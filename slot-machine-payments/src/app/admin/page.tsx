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

interface AuditLog {
  id: string;
  action: string;
  userId?: string;
  targetId?: string;
  details: Record<string, string>;
  timestamp: number;
}

export default function AdminPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [failedPayments, setFailedPayments] = useState<PaymentRecord[]>([]);
  const [webhookLogs, setWebhookLogs] = useState<
    { timestamp: number; eventType: string; paymentId: string; status: string; reason?: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "transactions" | "webhooks" | "failures" | "tuning" | "audit">(
    "overview"
  );

  // Game tuning state
  const [gameConfig, setGameConfig] = useState({
    enabled: true,
    winRate: 35,
    smallWinWeight: 70,
    mediumWinWeight: 25,
    bigWinWeight: 5,
    nearMissRate: 30,
    lossStreakBreaker: 5,
  });
  const [configSaving, setConfigSaving] = useState(false);
  const [configStatus, setConfigStatus] = useState("");
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    fetchAdminData();
  }, []);

  async function fetchAdminData() {
    try {
      const [txRes, webhookRes, configRes, auditRes] = await Promise.all([
        fetch("/api/transactions?admin=true&limit=200"),
        fetch("/api/payment-webhook"),
        fetch("/api/admin/settings"),
        fetch("/api/admin/audit"),
      ]);

      const txData = await txRes.json();
      const webhookData = await webhookRes.json();
      const configData = await configRes.json();
      const auditData = await auditRes.json();

      setTransactions(txData.transactions || []);
      setStats(txData.stats || null);
      setFailedPayments(txData.failedPayments || []);
      setWebhookLogs(webhookData.logs || []);
      if (configData.config) setGameConfig(configData.config);
      setAuditLogs(auditData.logs || []);
    } catch (error) {
      console.error("Failed to fetch admin data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function saveGameConfig() {
    setConfigSaving(true);
    setConfigStatus("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gameConfig),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setGameConfig(data.config);
      setConfigStatus("Settings saved successfully!");
    } catch (err) {
      setConfigStatus(err instanceof Error ? err.message : "Save failed");
    } finally {
      setConfigSaving(false);
    }
  }

  async function resetGameConfig() {
    setConfigSaving(true);
    setConfigStatus("");
    try {
      const res = await fetch("/api/admin/settings", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");
      setGameConfig(data.config);
      setConfigStatus("Reset to defaults!");
    } catch (err) {
      setConfigStatus(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setConfigSaving(false);
    }
  }

  const tabs = [
    { key: "overview" as const, label: "Overview" },
    { key: "tuning" as const, label: "🎛️ Game Tuning" },
    { key: "transactions" as const, label: "All Transactions" },
    { key: "audit" as const, label: "📝 Audit Log" },
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

        {/* Game Tuning Tab */}
        {activeTab === "tuning" && (
          <div className="space-y-6">
            {/* Master Switch */}
            <div className="glass-card p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-[#fbbf24]">Win Rate Control</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    When enabled, the system nudges outcomes to match your target win rate.
                    When disabled, spins are purely random.
                  </p>
                </div>
                <button
                  onClick={() => setGameConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                  className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                    gameConfig.enabled
                      ? "bg-green-600 text-white hover:bg-green-500"
                      : "bg-gray-700 text-gray-400 hover:bg-gray-600"
                  }`}
                >
                  {gameConfig.enabled ? "ENABLED" : "DISABLED"}
                </button>
              </div>
            </div>

            {/* Win Rate Slider */}
            <div className="glass-card p-6">
              <h3 className="text-sm font-bold text-[#fbbf24] mb-4 uppercase tracking-wider">
                Target Win Rate
              </h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-400 text-sm">Win Rate</span>
                    <span className="text-white font-mono font-bold text-lg">{gameConfig.winRate}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={80}
                    value={gameConfig.winRate}
                    onChange={(e) => setGameConfig(prev => ({ ...prev, winRate: Number(e.target.value) }))}
                    className="w-full accent-[#fbbf24] h-2 rounded-lg appearance-none bg-[#2a2a4a] cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-600 mt-1">
                    <span>0% (Never win)</span>
                    <span>40% (Balanced)</span>
                    <span>80% (Very generous)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Win Distribution */}
            <div className="glass-card p-6">
              <h3 className="text-sm font-bold text-[#fbbf24] mb-4 uppercase tracking-wider">
                Win Distribution (Of wins, how big?)
              </h3>
              <div className="space-y-5">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-400 text-sm">Small Wins (3x-8x) — Cherry, Lemon, Orange</span>
                    <span className="text-green-400 font-mono font-bold">{gameConfig.smallWinWeight}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={gameConfig.smallWinWeight}
                    onChange={(e) => setGameConfig(prev => ({ ...prev, smallWinWeight: Number(e.target.value) }))}
                    className="w-full accent-green-500 h-2 rounded-lg appearance-none bg-[#2a2a4a] cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-400 text-sm">Medium Wins (10x-15x) — Grape, Star</span>
                    <span className="text-blue-400 font-mono font-bold">{gameConfig.mediumWinWeight}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={gameConfig.mediumWinWeight}
                    onChange={(e) => setGameConfig(prev => ({ ...prev, mediumWinWeight: Number(e.target.value) }))}
                    className="w-full accent-blue-500 h-2 rounded-lg appearance-none bg-[#2a2a4a] cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-400 text-sm">Big Wins (25x-50x) — Diamond, Jackpot</span>
                    <span className="text-purple-400 font-mono font-bold">{gameConfig.bigWinWeight}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={gameConfig.bigWinWeight}
                    onChange={(e) => setGameConfig(prev => ({ ...prev, bigWinWeight: Number(e.target.value) }))}
                    className="w-full accent-purple-500 h-2 rounded-lg appearance-none bg-[#2a2a4a] cursor-pointer"
                  />
                </div>
                <div className="bg-[#1a1a2e] rounded-lg p-3 text-xs text-gray-500">
                  These weights are relative. Total: {gameConfig.smallWinWeight + gameConfig.mediumWinWeight + gameConfig.bigWinWeight}. 
                  Small gets {Math.round((gameConfig.smallWinWeight / Math.max(1, gameConfig.smallWinWeight + gameConfig.mediumWinWeight + gameConfig.bigWinWeight)) * 100)}% of wins, 
                  Medium gets {Math.round((gameConfig.mediumWinWeight / Math.max(1, gameConfig.smallWinWeight + gameConfig.mediumWinWeight + gameConfig.bigWinWeight)) * 100)}%, 
                  Big gets {Math.round((gameConfig.bigWinWeight / Math.max(1, gameConfig.smallWinWeight + gameConfig.mediumWinWeight + gameConfig.bigWinWeight)) * 100)}%.
                </div>
              </div>
            </div>

            {/* Engagement Settings */}
            <div className="glass-card p-6">
              <h3 className="text-sm font-bold text-[#fbbf24] mb-4 uppercase tracking-wider">
                Engagement Settings
              </h3>
              <div className="space-y-5">
                <div>
                  <div className="flex justify-between mb-2">
                    <div>
                      <span className="text-gray-400 text-sm">Near Miss Rate</span>
                      <p className="text-xs text-gray-600">% of losing spins that show 2 matching symbols</p>
                    </div>
                    <span className="text-orange-400 font-mono font-bold text-lg">{gameConfig.nearMissRate}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={80}
                    value={gameConfig.nearMissRate}
                    onChange={(e) => setGameConfig(prev => ({ ...prev, nearMissRate: Number(e.target.value) }))}
                    className="w-full accent-orange-500 h-2 rounded-lg appearance-none bg-[#2a2a4a] cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <div>
                      <span className="text-gray-400 text-sm">Loss Streak Breaker</span>
                      <p className="text-xs text-gray-600">Force a win after this many consecutive losses (0 = off)</p>
                    </div>
                    <span className="text-red-400 font-mono font-bold text-lg">{gameConfig.lossStreakBreaker}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    value={gameConfig.lossStreakBreaker}
                    onChange={(e) => setGameConfig(prev => ({ ...prev, lossStreakBreaker: Number(e.target.value) }))}
                    className="w-full accent-red-500 h-2 rounded-lg appearance-none bg-[#2a2a4a] cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-600 mt-1">
                    <span>Off</span>
                    <span>3 (Aggressive)</span>
                    <span>10 (Mild)</span>
                    <span>20 (Rare)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Save / Reset */}
            <div className="flex items-center gap-4">
              <button
                onClick={saveGameConfig}
                disabled={configSaving}
                className="px-6 py-3 bg-gradient-to-r from-[#fbbf24] to-[#f59e0b] text-black rounded-lg font-black text-sm hover:from-[#f59e0b] hover:to-[#d97706] transition-all disabled:opacity-50"
              >
                {configSaving ? "Saving..." : "💾 Save Settings"}
              </button>
              <button
                onClick={resetGameConfig}
                disabled={configSaving}
                className="px-6 py-3 bg-[#2a2a4a] text-gray-300 rounded-lg font-bold text-sm hover:bg-[#3a3a5a] transition-colors disabled:opacity-50"
              >
                Reset to Defaults
              </button>
              {configStatus && (
                <span className="text-sm text-green-400 font-bold">{configStatus}</span>
              )}
            </div>

            {/* Preview Box */}
            <div className="glass-card p-6 border border-[#2a2a4a]">
              <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">
                What This Means
              </h3>
              <div className="space-y-2 text-sm text-gray-400">
                <p>For every <strong className="text-white">100 spins</strong>:</p>
                <p>• ~<strong className="text-green-400">{gameConfig.winRate}</strong> will be wins</p>
                <p>
                  • Of those wins: ~<strong className="text-green-400">
                    {Math.round((gameConfig.smallWinWeight / Math.max(1, gameConfig.smallWinWeight + gameConfig.mediumWinWeight + gameConfig.bigWinWeight)) * gameConfig.winRate)}
                  </strong> small, 
                  ~<strong className="text-blue-400">
                    {Math.round((gameConfig.mediumWinWeight / Math.max(1, gameConfig.smallWinWeight + gameConfig.mediumWinWeight + gameConfig.bigWinWeight)) * gameConfig.winRate)}
                  </strong> medium, 
                  ~<strong className="text-purple-400">
                    {Math.round((gameConfig.bigWinWeight / Math.max(1, gameConfig.smallWinWeight + gameConfig.mediumWinWeight + gameConfig.bigWinWeight)) * gameConfig.winRate)}
                  </strong> big
                </p>
                <p>• ~<strong className="text-orange-400">
                  {Math.round((100 - gameConfig.winRate) * gameConfig.nearMissRate / 100)}
                </strong> will be near-misses (2 matching symbols)</p>
                <p>• ~<strong className="text-gray-300">
                  {100 - gameConfig.winRate - Math.round((100 - gameConfig.winRate) * gameConfig.nearMissRate / 100)}
                </strong> will be clean losses</p>
                {gameConfig.lossStreakBreaker > 0 && (
                  <p>• No player will lose more than <strong className="text-red-400">{gameConfig.lossStreakBreaker}</strong> times in a row</p>
                )}
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

        {/* Audit Log Tab */}
        {activeTab === "audit" && (
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a2a4a]">
                    <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase">
                      Time
                    </th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase">
                      Action
                    </th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase">
                      User
                    </th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase">
                      Target
                    </th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b border-[#2a2a4a]/50 hover:bg-[#2a2a4a]/30"
                    >
                      <td className="px-4 py-2 text-gray-400 font-mono text-xs whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded ${
                            log.action.startsWith("ADMIN")
                              ? "bg-purple-500/20 text-purple-400"
                              : log.action.includes("SPIN")
                              ? "bg-yellow-500/20 text-yellow-400"
                              : log.action.includes("PAYMENT") || log.action.includes("BALANCE")
                              ? "bg-blue-500/20 text-blue-400"
                              : log.action.includes("WEBHOOK")
                              ? "bg-cyan-500/20 text-cyan-400"
                              : "bg-gray-500/20 text-gray-400"
                          }`}
                        >
                          {log.action.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-400 font-mono text-xs">
                        {log.userId ? `${log.userId.slice(0, 12)}...` : "—"}
                      </td>
                      <td className="px-4 py-2 text-gray-500 font-mono text-xs">
                        {log.targetId ? `${log.targetId.slice(0, 16)}...` : "—"}
                      </td>
                      <td className="px-4 py-2 text-gray-600 text-xs max-w-[250px] truncate">
                        {Object.entries(log.details || {})
                          .map(([k, v]) => `${k}=${v}`)
                          .join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {auditLogs.length === 0 && (
              <p className="text-center text-gray-500 py-8">
                No audit events recorded yet. Start playing to see activity.
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
