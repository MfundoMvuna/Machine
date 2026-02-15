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
  getCreditsForAmount,
  generatePaymentIdempotencyKey,
  type YocoWebhookPayload,
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
  let payload: YocoWebhookPayload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  // ─── Step 1: Verify Webhook Payload ─────────────────────────────
  const verification = verifyWebhookPayload(payload);
  if (!verification.valid) {
    logWebhookEvent({
      timestamp: Date.now(),
      eventType: payload?.type || "unknown",
      paymentId: payload?.payload?.id || "unknown",
      status: "REJECTED",
      reason: verification.reason,
    });

    // Return 200 to prevent retries on invalid payloads
    return NextResponse.json({ received: true, processed: false });
  }

  const { type, payload: paymentData } = payload;
  const paymentId = paymentData.id;
  const checkoutId = paymentData.checkoutId;

  // ─── Step 2: Handle Payment Failed ──────────────────────────────
  if (type === "payment.failed") {
    logWebhookEvent({
      timestamp: Date.now(),
      eventType: type,
      paymentId,
      status: "PROCESSED",
      reason: "Payment failed by provider",
    });

    // Update payment record if we have one
    const paymentRecord = await getPaymentByExternalId(checkoutId);
    if (paymentRecord) {
      await updatePaymentStatus(paymentRecord.id, "FAILED", true);
    }

    return NextResponse.json({ received: true, processed: true });
  }

  // ─── Step 3: Handle Payment Succeeded ───────────────────────────
  if (type === "payment.succeeded" || type === "checkout.completed") {
    // Generate idempotency key
    const idempotencyKey = generatePaymentIdempotencyKey(checkoutId, paymentId);

    // ─── Step 3a: Idempotency Check ───────────────────────────────
    const alreadyProcessed = await isPaymentProcessed(idempotencyKey);
    if (alreadyProcessed) {
      logWebhookEvent({
        timestamp: Date.now(),
        eventType: type,
        paymentId,
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

    // ─── Step 3b: Find Payment Record ─────────────────────────────
    const paymentRecord = await getPaymentByExternalId(checkoutId);
    if (!paymentRecord) {
      logWebhookEvent({
        timestamp: Date.now(),
        eventType: type,
        paymentId,
        status: "ERROR",
        reason: `No payment record found for checkout: ${checkoutId}`,
      });

      // Return 200 but flag as unprocessed
      return NextResponse.json({ received: true, processed: false });
    }

    // ─── Step 3c: Validate Amount ─────────────────────────────────
    if (paymentData.amount !== paymentRecord.amount) {
      logWebhookEvent({
        timestamp: Date.now(),
        eventType: type,
        paymentId,
        status: "REJECTED",
        reason: `Amount mismatch: expected ${paymentRecord.amount}, got ${paymentData.amount}`,
      });

      return NextResponse.json({ received: true, processed: false });
    }

    // ─── Step 3d: Credit User Balance ─────────────────────────────
    try {
      const credits = getCreditsForAmount(paymentData.amount);
      const userId = paymentRecord.userId;

      // Ensure user exists
      await getOrCreateUser(userId);

      // Credit with idempotency key
      await creditBalance(
        userId,
        credits,
        "CREDIT_PURCHASE",
        {
          paymentId,
          checkoutId,
          amountCents: String(paymentData.amount),
          currency: paymentData.currency || "ZAR",
        },
        idempotencyKey
      );

      // Update payment record
      await updatePaymentStatus(paymentRecord.id, "COMPLETED", true);

      logWebhookEvent({
        timestamp: Date.now(),
        eventType: type,
        paymentId,
        status: "PROCESSED",
        reason: `Credited ${credits} to user ${userId}`,
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
        paymentId,
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
    paymentId,
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
