"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Transaction {
  id: string;
  userId: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  status: string;
  metadata: Record<string, string>;
  createdAt: number;
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string>("");

  useEffect(() => {
    const stored = localStorage.getItem("slotUserId");
    if (stored) {
      setUserId(stored);
      fetchTransactions(stored);
    } else {
      setLoading(false);
    }
  }, []);

  async function fetchTransactions(uid: string) {
    try {
      const res = await fetch(`/api/transactions?userId=${uid}&limit=100`);
      const data = await res.json();
      setTransactions(data.transactions || []);
    } catch (error) {
      console.error("Failed to fetch transactions:", error);
    } finally {
      setLoading(false);
    }
  }

  const typeColors: Record<string, string> = {
    SPIN_BET: "text-red-400",
    SPIN_WIN: "text-green-400",
    CREDIT_PURCHASE: "text-blue-400",
    REFUND: "text-purple-400",
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#0f0f23] to-[#0a0a0a]">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-[#fbbf24]">
              Transaction History
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Complete audit trail of all balance changes
            </p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 bg-[#2a2a4a] text-gray-300 rounded-lg hover:bg-[#3a3a5a] transition-colors text-sm"
          >
            ← Back to Game
          </Link>
        </div>

        {loading ? (
          <div className="text-center text-gray-400 animate-pulse py-20">
            Loading transactions...
          </div>
        ) : transactions.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <p className="text-gray-400 text-lg">No transactions yet</p>
            <p className="text-gray-600 text-sm mt-2">
              Start spinning to see your history here
            </p>
            <Link
              href="/"
              className="inline-block mt-4 px-6 py-2 bg-[#fbbf24] text-black rounded-lg font-bold hover:bg-[#f59e0b] transition-colors"
            >
              Go Play
            </Link>
          </div>
        ) : (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="glass-card p-4 text-center">
                <p className="text-xs text-gray-400 uppercase">Total Spins</p>
                <p className="text-2xl font-black text-white font-mono">
                  {transactions.filter((t) => t.type === "SPIN_BET").length}
                </p>
              </div>
              <div className="glass-card p-4 text-center">
                <p className="text-xs text-gray-400 uppercase">Wins</p>
                <p className="text-2xl font-black text-green-400 font-mono">
                  {transactions.filter((t) => t.type === "SPIN_WIN").length}
                </p>
              </div>
              <div className="glass-card p-4 text-center">
                <p className="text-xs text-gray-400 uppercase">Total Won</p>
                <p className="text-2xl font-black text-green-400 font-mono">
                  {transactions
                    .filter((t) => t.type === "SPIN_WIN")
                    .reduce((sum, t) => sum + t.amount, 0)
                    .toLocaleString()}
                </p>
              </div>
              <div className="glass-card p-4 text-center">
                <p className="text-xs text-gray-400 uppercase">Total Bet</p>
                <p className="text-2xl font-black text-red-400 font-mono">
                  {Math.abs(
                    transactions
                      .filter((t) => t.type === "SPIN_BET")
                      .reduce((sum, t) => sum + t.amount, 0)
                  ).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Transaction Table */}
            <div className="glass-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a2a4a]">
                      <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase">
                        Time
                      </th>
                      <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase">
                        Type
                      </th>
                      <th className="text-right px-4 py-3 text-xs text-gray-400 uppercase">
                        Amount
                      </th>
                      <th className="text-right px-4 py-3 text-xs text-gray-400 uppercase">
                        Before
                      </th>
                      <th className="text-right px-4 py-3 text-xs text-gray-400 uppercase">
                        After
                      </th>
                      <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase">
                        ID
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => (
                      <tr
                        key={tx.id}
                        className="border-b border-[#2a2a4a]/50 hover:bg-[#2a2a4a]/30 transition-colors"
                      >
                        <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                          {new Date(tx.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`font-bold text-xs ${
                              typeColors[tx.type] || "text-gray-400"
                            }`}
                          >
                            {tx.type.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold">
                          <span
                            className={
                              tx.amount > 0 ? "text-green-400" : "text-red-400"
                            }
                          >
                            {tx.amount > 0 ? "+" : ""}
                            {tx.amount.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-500 text-xs">
                          {tx.balanceBefore.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-300 text-xs">
                          {tx.balanceAfter.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-gray-600 font-mono text-xs truncate max-w-[120px]">
                          {tx.id.slice(0, 8)}...
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-center text-gray-600 text-xs mt-4">
              User: {userId} • {transactions.length} transactions
            </p>
          </>
        )}
      </div>
    </main>
  );
}
