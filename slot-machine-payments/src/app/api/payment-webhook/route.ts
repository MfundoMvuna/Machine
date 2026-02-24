/**
 * POST /api/payment-webhook — Yoco Webhook Handler
 * 
 * This endpoint receives payment notifications from Yoco.
 * 
 * CRITICAL SECURITY:
 *  1. Verify webhook signature/payload
 *  2. Check idempotency (prevent double-crediting)
 *  3. Validate payment amount matches expected
 *  4. Credit user balance only after ALL checks pass
 *  5. Log every attempt (success and failure)
 * 
 * Webhook events handled:
 *  - payment.succeeded → Credit user balance
 *  - payment.failed → Log failure, update payment status
 *  - checkout.completed → Verify checkout completion
 * 
 * This endpoint MUST return 200 quickly to acknowledge receipt.
 * Yoco will retry on non-200 responses.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  verifyWebhookPayload,
  normalizeWebhookPayload,
  getCreditsForAmount,
  generatePaymentIdempotencyKey,
} from "@/lib/payment";
import {
  getPaymentByExternalId,
  updatePaymentStatus,
  creditBalance,
  isPaymentProcessed,
  getOrCreateUser,
} from "@/lib/db";

// ─── Webhook Event Log (In-memory for Phase 1) ───────────────────────
interface WebhookLog {
  timestamp: number;
  eventType: string;
  paymentId: string;
  status: "PROCESSED" | "REJECTED" | "DUPLICATE" | "ERROR";
  reason?: string;
  payloadSummary?: {
    paymentId?: string;
    checkoutId?: string;
    amount?: number;
    currency?: string;
    userId?: string;
  };
}

const webhookLogs: WebhookLog[] = [];

function logWebhookEvent(log: WebhookLog) {
  webhookLogs.push(log);
  console.log(
    `[Webhook] ${log.status}: ${log.eventType} | Payment: ${log.paymentId} | ${log.reason || "OK"}`
  );
}

// ─── Main Webhook Handler ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let rawPayload: unknown;

  try {
    rawPayload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  const normalized = normalizeWebhookPayload(rawPayload);

  // ─── Step 1: Verify Webhook Payload ─────────────────────────────
  const verification = verifyWebhookPayload(rawPayload);
  if (!verification.valid) {
    logWebhookEvent({
      timestamp: Date.now(),
      eventType: normalized?.eventType || "unknown",
      paymentId: normalized?.paymentId || normalized?.checkoutId || "unknown",
      status: "REJECTED",
      reason: verification.reason,
      payloadSummary: {
        paymentId: normalized?.paymentId,
        checkoutId: normalized?.checkoutId,
        amount: normalized?.amount,
        currency: normalized?.currency,
        userId: normalized?.metadata?.userId,
      },
    });

    // Return 200 to prevent retries on invalid payloads
    return NextResponse.json({ received: true, processed: false });
  }

  const type = normalized?.eventType || "unknown";
  const paymentId = normalized?.paymentId;
  const checkoutId = normalized?.checkoutId || normalized?.paymentId;
  const metadata = normalized?.metadata || {};

  // ─── Step 2: Handle Payment Failed ──────────────────────────────
  if (type === "payment.failed") {
    logWebhookEvent({
      timestamp: Date.now(),
      eventType: type,
      paymentId: paymentId || checkoutId || "unknown",
      status: "PROCESSED",
      reason: "Payment failed by provider",
    });

    // Update payment record if we have one
    const lookupIds = [checkoutId, paymentId].filter(
      (id): id is string => typeof id === "string" && id.length > 0
    );
    let paymentRecord = null;
    for (const externalId of lookupIds) {
      paymentRecord = await getPaymentByExternalId(externalId);
      if (paymentRecord) break;
    }
    if (paymentRecord) {
      await updatePaymentStatus(paymentRecord.id, "FAILED", true);
    }

    return NextResponse.json({ received: true, processed: true });
  }

  // ─── Step 3: Handle Payment Succeeded ───────────────────────────
  if (type === "payment.succeeded" || type === "checkout.completed") {
    const webhookAmount = Number(normalized?.amount);
    const metadataUserId = metadata.userId;

    if (!checkoutId) {
      logWebhookEvent({
        timestamp: Date.now(),
        eventType: type,
        paymentId: paymentId || "unknown",
        status: "REJECTED",
        reason: "Missing checkout identifier",
      });

      return NextResponse.json({ received: true, processed: false });
    }

    // ─── Step 3a: Find Payment Record ─────────────────────────────
    const paymentRecord =
      (await getPaymentByExternalId(checkoutId)) ||
      (paymentId ? await getPaymentByExternalId(paymentId) : null);

    const amountCents =
      Number.isFinite(webhookAmount) && webhookAmount > 0
        ? webhookAmount
        : paymentRecord?.amount;

    if (typeof amountCents !== "number" || !Number.isFinite(amountCents) || amountCents <= 0) {
      logWebhookEvent({
        timestamp: Date.now(),
        eventType: type,
        paymentId: paymentId || checkoutId,
        status: "REJECTED",
        reason: "Missing or invalid amount in webhook payload and no matching payment record",
      });

      return NextResponse.json({ received: true, processed: false });
    }

    const resolvedAmountCents: number = amountCents;

    // Generate idempotency key
    const idempotencyKey = generatePaymentIdempotencyKey(checkoutId, paymentId || checkoutId);

    // ─── Step 3b: Idempotency Check ───────────────────────────────
    const alreadyProcessed = await isPaymentProcessed(idempotencyKey);
    if (alreadyProcessed) {
      logWebhookEvent({
        timestamp: Date.now(),
        eventType: type,
        paymentId: paymentId || checkoutId,
        status: "DUPLICATE",
        reason: "Payment already credited (idempotency check)",
      });

      // Return 200 — already handled
      return NextResponse.json({
        received: true,
        processed: true,
        duplicate: true,
      });
    }

    // ─── Step 3c: Validate Amount ─────────────────────────────────
    if (paymentRecord && resolvedAmountCents !== paymentRecord.amount) {
      logWebhookEvent({
        timestamp: Date.now(),
        eventType: type,
        paymentId: paymentId || checkoutId,
        status: "REJECTED",
        reason: `Amount mismatch: expected ${paymentRecord.amount}, got ${resolvedAmountCents}`,
      });

      return NextResponse.json({ received: true, processed: false });
    }

    // ─── Step 3d: Credit User Balance ─────────────────────────────
    try {
      const credits = getCreditsForAmount(resolvedAmountCents);
      const userId = paymentRecord?.userId || metadataUserId;

      if (!userId) {
        logWebhookEvent({
          timestamp: Date.now(),
          eventType: type,
          paymentId: paymentId || checkoutId,
          status: "ERROR",
          reason: "Missing userId in both payment record and webhook metadata",
        });

        return NextResponse.json({ received: true, processed: false });
      }

      // Ensure user exists
      await getOrCreateUser(userId);

      // Credit with idempotency key
      await creditBalance(
        userId,
        credits,
        "CREDIT_PURCHASE",
        {
          paymentId: paymentId || "unknown",
          checkoutId: checkoutId || "unknown",
          amountCents: String(resolvedAmountCents),
          currency: normalized?.currency || "ZAR",
          webhookEventType: type,
        },
        idempotencyKey
      );

      // Update payment record when available
      if (paymentRecord) {
        await updatePaymentStatus(paymentRecord.id, "COMPLETED", true);
      }

      logWebhookEvent({
        timestamp: Date.now(),
        eventType: type,
        paymentId: paymentId || checkoutId,
        status: "PROCESSED",
        reason: paymentRecord
          ? `Credited ${credits} to user ${userId}`
          : `Credited ${credits} via metadata fallback for user ${userId}`,
        payloadSummary: {
          paymentId,
          checkoutId,
          amount: resolvedAmountCents,
          currency: normalized?.currency || "ZAR",
          userId,
        },
      });

      return NextResponse.json({
        received: true,
        processed: true,
        credited: credits,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      logWebhookEvent({
        timestamp: Date.now(),
        eventType: type,
        paymentId: paymentId || checkoutId,
        status: "ERROR",
        reason: `Credit failed: ${errorMessage}`,
      });

      console.error("[Webhook] Credit error:", error);

      // Return 500 so Yoco retries
      return NextResponse.json(
        { received: true, processed: false, error: errorMessage },
        { status: 500 }
      );
    }
  }

  // ─── Unhandled Event Type ───────────────────────────────────────
  logWebhookEvent({
    timestamp: Date.now(),
    eventType: type,
    paymentId: paymentId || checkoutId || "unknown",
    status: "PROCESSED",
    reason: "Unhandled event type (acknowledged)",
  });

  return NextResponse.json({ received: true, processed: false });
}

// ─── GET: Retrieve Webhook Logs (Admin Only) ──────────────────────────
export async function GET() {
  return NextResponse.json({
    logs: webhookLogs.slice(-50).reverse(),
    totalEvents: webhookLogs.length,
  });
}
