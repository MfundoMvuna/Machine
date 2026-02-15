/**
 * GET /api/transactions — Transaction History & Admin Queries
 * 
 * Query params:
 *  - userId: Get transactions for specific user
 *  - limit: Max results (default: 50)
 *  - admin: If "true", return all transactions + stats
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getTransactionHistory,
  getAllTransactions,
  getPaymentStats,
  getFailedPayments,
} from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const isAdmin = searchParams.get("admin") === "true";
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    // ─── Admin View ───────────────────────────────────────────────
    if (isAdmin) {
      const [transactions, stats, failedPayments] = await Promise.all([
        getAllTransactions(limit),
        getPaymentStats(),
        getFailedPayments(),
      ]);

      return NextResponse.json({
        transactions,
        stats,
        failedPayments,
        totalRecords: transactions.length,
      });
    }

    // ─── User View ────────────────────────────────────────────────
    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId parameter" },
        { status: 400 }
      );
    }

    const transactions = await getTransactionHistory(userId, limit);

    return NextResponse.json({
      userId,
      transactions,
      totalRecords: transactions.length,
    });
  } catch (error) {
    console.error("[/api/transactions] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
