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

interface PaymentRecord {
  id: string;
  userId: string;
  externalPaymentId: string;
  amount: number;
  currency: string;
  status: string;
  webhookReceived: boolean;
  createdAt: number;
}

interface Stats {
  totalPayments: number;
  completedPayments: number;
  failedPayments: number;
  totalRevenue: number;
}

export default function AdminPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [failedPayments, setFailedPayments] = useState<PaymentRecord[]>([]);
  const [webhookLogs, setWebhookLogs] = useState<
    { timestamp: number; eventType: string; paymentId: string; status: string; reason?: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "transactions" | "webhooks" | "failures">(
    "overview"
  );

  useEffect(() => {
    fetchAdminData();
  }, []);

  async function fetchAdminData() {
    try {
      const [txRes, webhookRes] = await Promise.all([
        fetch("/api/transactions?admin=true&limit=200"),
        fetch("/api/payment-webhook"),
      ]);

      const txData = await txRes.json();
      const webhookData = await webhookRes.json();

      setTransactions(txData.transactions || []);
      setStats(txData.stats || null);
      setFailedPayments(txData.failedPayments || []);
      setWebhookLogs(webhookData.logs || []);
    } catch (error) {
      console.error("Failed to fetch admin data:", error);
    } finally {
      setLoading(false);
    }
  }

  const tabs = [
    { key: "overview" as const, label: "Overview" },
    { key: "transactions" as const, label: "All Transactions" },
    { key: "webhooks" as const, label: "Webhook Logs" },
    { key: "failures" as const, label: "Failed Payments" },
  ];

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#0f0f23] to-[#0a0a0a] flex items-center justify-center">
        <div className="text-gray-400 animate-pulse text-xl">
          Loading admin dashboard...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#0f0f23] to-[#0a0a0a]">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-[#fbbf24]">
              Admin Dashboard
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Payment monitoring, webhook logs, and system health
            </p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 bg-[#2a2a4a] text-gray-300 rounded-lg hover:bg-[#3a3a5a] transition-colors text-sm"
          >
            ← Back to Game
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${
                activeTab === tab.key
                  ? "bg-[#fbbf24] text-black"
                  : "bg-[#2a2a4a] text-gray-300 hover:bg-[#3a3a5a]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && stats && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="glass-card p-6 text-center">
                <p className="text-xs text-gray-400 uppercase mb-1">
                  Total Payments
                </p>
                <p className="text-3xl font-black text-white font-mono">
                  {stats.totalPayments}
                </p>
              </div>
              <div className="glass-card p-6 text-center">
                <p className="text-xs text-gray-400 uppercase mb-1">
                  Completed
                </p>
                <p className="text-3xl font-black text-green-400 font-mono">
                  {stats.completedPayments}
                </p>
              </div>
              <div className="glass-card p-6 text-center">
                <p className="text-xs text-gray-400 uppercase mb-1">Failed</p>
                <p className="text-3xl font-black text-red-400 font-mono">
                  {stats.failedPayments}
                </p>
              </div>
              <div className="glass-card p-6 text-center">
                <p className="text-xs text-gray-400 uppercase mb-1">
                  Revenue (cents)
                </p>
                <p className="text-3xl font-black text-[#fbbf24] font-mono">
                  {stats.totalRevenue.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="glass-card p-6">
              <h3 className="text-sm font-bold text-[#fbbf24] mb-3 uppercase tracking-wider">
                System Health
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Webhook Events Received</span>
                  <span className="text-white font-mono">
                    {webhookLogs.length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Transactions</span>
                  <span className="text-white font-mono">
                    {transactions.length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">
                    Payment Success Rate
                  </span>
                  <span className="text-green-400 font-mono font-bold">
                    {stats.totalPayments > 0
                      ? (
                          (stats.completedPayments / stats.totalPayments) *
                          100
                        ).toFixed(1)
                      : "N/A"}
                    %
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Transactions Tab */}
        {activeTab === "transactions" && (
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a2a4a]">
                    <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase">
                      Time
                    </th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase">
                      User
                    </th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase">
                      Type
                    </th>
                    <th className="text-right px-4 py-3 text-xs text-gray-400 uppercase">
                      Amount
                    </th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr
                      key={tx.id}
                      className="border-b border-[#2a2a4a]/50 hover:bg-[#2a2a4a]/30"
                    >
                      <td className="px-4 py-2 text-gray-400 font-mono text-xs">
                        {new Date(tx.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-gray-300 font-mono text-xs truncate max-w-[100px]">
                        {tx.userId.slice(0, 12)}...
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`text-xs font-bold ${
                            tx.type === "SPIN_WIN"
                              ? "text-green-400"
                              : tx.type === "SPIN_BET"
                              ? "text-red-400"
                              : "text-blue-400"
                          }`}
                        >
                          {tx.type.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono font-bold">
                        <span
                          className={
                            tx.amount > 0 ? "text-green-400" : "text-red-400"
                          }
                        >
                          {tx.amount > 0 ? "+" : ""}
                          {tx.amount}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400">
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {transactions.length === 0 && (
              <p className="text-center text-gray-500 py-8">
                No transactions recorded yet
              </p>
            )}
          </div>
        )}

        {/* Webhook Logs Tab */}
        {activeTab === "webhooks" && (
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a2a4a]">
                    <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase">
                      Time
                    </th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase">
                      Event
                    </th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase">
                      Payment ID
                    </th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase">
                      Status
                    </th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {webhookLogs.map((log, i) => (
                    <tr
                      key={i}
                      className="border-b border-[#2a2a4a]/50 hover:bg-[#2a2a4a]/30"
                    >
                      <td className="px-4 py-2 text-gray-400 font-mono text-xs">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-gray-300 text-xs font-mono">
                        {log.eventType}
                      </td>
                      <td className="px-4 py-2 text-gray-400 text-xs font-mono truncate max-w-[100px]">
                        {log.paymentId.slice(0, 12)}...
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-bold ${
                            log.status === "PROCESSED"
                              ? "bg-green-500/20 text-green-400"
                              : log.status === "DUPLICATE"
                              ? "bg-yellow-500/20 text-yellow-400"
                              : log.status === "REJECTED"
                              ? "bg-red-500/20 text-red-400"
                              : "bg-gray-500/20 text-gray-400"
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-500 text-xs truncate max-w-[200px]">
                        {log.reason || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {webhookLogs.length === 0 && (
              <p className="text-center text-gray-500 py-8">
                No webhook events received yet
              </p>
            )}
          </div>
        )}

        {/* Failed Payments Tab */}
        {activeTab === "failures" && (
          <div className="glass-card overflow-hidden">
            {failedPayments.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-green-400 text-lg font-bold">
                  ✅ No failed payments
                </p>
                <p className="text-gray-500 text-sm mt-1">
                  All payment processing is healthy
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a2a4a]">
                      <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase">
                        Time
                      </th>
                      <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase">
                        User
                      </th>
                      <th className="text-right px-4 py-3 text-xs text-gray-400 uppercase">
                        Amount
                      </th>
                      <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase">
                        External ID
                      </th>
                      <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase">
                        Webhook?
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {failedPayments.map((p) => (
                      <tr
                        key={p.id}
                        className="border-b border-[#2a2a4a]/50 hover:bg-red-500/5"
                      >
                        <td className="px-4 py-2 text-gray-400 font-mono text-xs">
                          {new Date(p.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-gray-300 font-mono text-xs truncate max-w-[100px]">
                          {p.userId.slice(0, 12)}...
                        </td>
                        <td className="px-4 py-2 text-right text-red-400 font-mono font-bold text-xs">
                          {p.amount} {p.currency}
                        </td>
                        <td className="px-4 py-2 text-gray-500 font-mono text-xs truncate max-w-[100px]">
                          {p.externalPaymentId.slice(0, 12)}...
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`text-xs ${
                              p.webhookReceived
                                ? "text-green-400"
                                : "text-red-400"
                            }`}
                          >
                            {p.webhookReceived ? "Yes" : "No"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
