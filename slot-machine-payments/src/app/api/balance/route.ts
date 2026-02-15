/**
 * GET /api/balance — Get User Balance & Transaction Summary
 * POST /api/balance — Initialize a new user (returns starting balance)
 */

import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUser, getTransactionHistory } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId parameter" },
        { status: 400 }
      );
    }

    const user = await getOrCreateUser(userId);
    const recentTransactions = await getTransactionHistory(userId, 10);

    return NextResponse.json({
      userId: user.id,
      balance: user.balance,
      recentTransactions,
    });
  } catch (error) {
    console.error("[/api/balance] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
