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
  const baseUrl =
    request.nextUrl.origin ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "http://localhost:3000";

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
    const validAmounts: number[] = CREDIT_PACKAGES.map((p) => p.priceZAR);
    if (typeof amount !== "number" || !validAmounts.includes(amount)) {
      return NextResponse.json(
        {
          error: "Invalid payment amount",
          validPackages: CREDIT_PACKAGES,
        },
        { status: 400 }
      );
    }

    // Ensure user exists
    const user = await getOrCreateUser(userId);

    // ─── Generate Idempotency Key ─────────────────────────────────
    const idempotencyKey = `checkout_${userId}_${uuidv4()}`;

    // ─── Determine URLs ───────────────────────────────────────────
    // Note: Yoco does not support template variables like {checkoutId} in URLs.
    // The checkout ID is appended after the session is created below.
    const successUrl = `${baseUrl}/payment/success`;
    const cancelUrl = `${baseUrl}/payment/cancel`;
    const failureUrl = `${baseUrl}/payment/failure`;

    // ─── Create Yoco Checkout Session ─────────────────────────────
    const checkout = await createCheckoutSession({
      amount,
      currency: "ZAR",
      userId,
      profileName: user.profileName || undefined,
      profileEmail: user.profileEmail || undefined,
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

    if (process.env.NODE_ENV !== "production") {
      const mockCheckoutId = `mock_checkout_${Date.now()}`;
      const amount = 2000;
      const credits = getCreditsForAmount(amount);

      return NextResponse.json({
        success: true,
        checkoutId: mockCheckoutId,
        redirectUrl: `${baseUrl}/payment/success?session=${mockCheckoutId}&mock=true`,
        amount,
        credits,
        message: "Using local mock checkout (Yoco unavailable in development).",
      });
    }

    return NextResponse.json({ error: message, detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
