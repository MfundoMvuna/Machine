/**
 * POST /api/create-payment — Initiate Yoco Checkout Session
 * 
 * Flow:
 *  1. Validate request (userId, amount)
 *  2. Create payment record in DB (status: PENDING)
 *  3. Call Yoco Checkout API to create session
 *  4. Return redirect URL to frontend
 * 
 * The user is then redirected to Yoco's hosted checkout page.
 * After payment, Yoco sends a webhook to /api/payment-webhook.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createCheckoutSession,
  CREDIT_PACKAGES,
  getCreditsForAmount,
} from "@/lib/payment";
import { createPaymentRecord, getOrCreateUser } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

interface CreatePaymentRequest {
  userId: string;
  amount: number; // Amount in cents (ZAR)
}

export async function POST(request: NextRequest) {
  try {
    const body: CreatePaymentRequest = await request.json();
    const { userId, amount } = body;

    // ─── Input Validation ─────────────────────────────────────────
    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid userId" },
        { status: 400 }
      );
    }

    // Validate amount matches a credit package
    const validAmounts = CREDIT_PACKAGES.map((p) => p.priceZAR);
    if (!validAmounts.includes(amount)) {
      return NextResponse.json(
        {
          error: "Invalid payment amount",
          validPackages: CREDIT_PACKAGES,
        },
        { status: 400 }
      );
    }

    // Ensure user exists
    await getOrCreateUser(userId);

    // ─── Generate Idempotency Key ─────────────────────────────────
    const idempotencyKey = `checkout_${userId}_${uuidv4()}`;

    // ─── Determine URLs ───────────────────────────────────────────
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL || request.headers.get("origin") || "http://localhost:3000";

    const successUrl = `${baseUrl}/payment/success?session={checkoutId}`;
    const cancelUrl = `${baseUrl}/payment/cancel`;
    const failureUrl = `${baseUrl}/payment/failure`;

    // ─── Create Yoco Checkout Session ─────────────────────────────
    const checkout = await createCheckoutSession({
      amount,
      currency: "ZAR",
      userId,
      successUrl,
      cancelUrl,
      failureUrl,
    });

    // ─── Record Payment in Database ───────────────────────────────
    await createPaymentRecord({
      userId,
      externalPaymentId: checkout.id,
      amount,
      currency: "ZAR",
      status: "PENDING",
      webhookReceived: false,
      idempotencyKey,
    });

    const credits = getCreditsForAmount(amount);

    // ─── Response ─────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      checkoutId: checkout.id,
      redirectUrl: checkout.redirectUrl,
      amount,
      credits,
      message: `Redirecting to payment for ${credits} credits...`,
    });
  } catch (error) {
    console.error("[/api/create-payment] Error:", error);

    const message =
      error instanceof Error ? error.message : "Payment creation failed";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
