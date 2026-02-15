/**
 * POST /api/spin — Server-Authoritative Spin Endpoint
 * 
 * Security model:
 *  1. Validate bet amount (server-side)
 *  2. Check user balance (server-side)
 *  3. Deduct bet from balance BEFORE spinning
 *  4. Generate outcome using crypto-random engine
 *  5. Credit winnings if applicable
 *  6. Return result with transaction proof
 * 
 * The client NEVER determines the outcome.
 */

import { NextRequest, NextResponse } from "next/server";
import { executeSpin, BET_OPTIONS } from "@/lib/slot-engine";
import {
  getOrCreateUser,
  debitBalance,
  creditBalance,
} from "@/lib/db";

interface SpinRequest {
  userId: string;
  betAmount: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: SpinRequest = await request.json();
    const { userId, betAmount } = body;

    // ─── Input Validation ─────────────────────────────────────────
    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid userId" },
        { status: 400 }
      );
    }

    if (!BET_OPTIONS.includes(betAmount as (typeof BET_OPTIONS)[number])) {
      return NextResponse.json(
        { error: `Invalid bet amount. Allowed: ${BET_OPTIONS.join(", ")}` },
        { status: 400 }
      );
    }

    // ─── Balance Check & Debit ────────────────────────────────────
    const user = await getOrCreateUser(userId);

    if (user.balance < betAmount) {
      return NextResponse.json(
        {
          error: "Insufficient balance",
          balance: user.balance,
          required: betAmount,
        },
        { status: 402 }
      );
    }

    // Debit FIRST — never spin without deducting
    const debitTx = await debitBalance(userId, betAmount, "SPIN_BET", {
      action: "spin",
    });

    // ─── Execute Spin (Server-Side Only) ──────────────────────────
    const result = executeSpin({ betAmount, userId });

    // ─── Credit Winnings ──────────────────────────────────────────
    let creditTx = null;
    if (result.winAmount > 0) {
      creditTx = await creditBalance(userId, result.winAmount, "SPIN_WIN", {
        spinId: result.spinId,
        multiplier: String(result.multiplier),
      });
    }

    // ─── Get Updated Balance ──────────────────────────────────────
    const updatedUser = await getOrCreateUser(userId);

    // ─── Response ─────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      spin: {
        reels: result.reels,
        multiplier: result.multiplier,
        winAmount: result.winAmount,
        isJackpot: result.isJackpot,
        spinId: result.spinId,
      },
      balance: updatedUser.balance,
      transactions: {
        betTransactionId: debitTx.id,
        winTransactionId: creditTx?.id || null,
      },
    });
  } catch (error) {
    console.error("[/api/spin] Error:", error);

    const message =
      error instanceof Error ? error.message : "Internal server error";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Only POST allowed
export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST." },
    { status: 405 }
  );
}
