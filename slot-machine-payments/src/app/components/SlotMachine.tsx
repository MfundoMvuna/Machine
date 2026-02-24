"use client";

import { useState, useCallback, useEffect, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────

interface SpinResultData {
  reels: [string, string, string];
  multiplier: number;
  winAmount: number;
  isJackpot: boolean;
  spinId: string;
}

interface TransactionData {
  id: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: number;
}

const BET_OPTIONS = [1, 5, 10, 25, 50, 100];
const DEFAULT_BET = 10;

// Placeholder symbols for reel animation
const ALL_SYMBOLS = ["🍒", "🍋", "🍊", "🍇", "⭐", "💎", "7️⃣"];

// ─── Reel Component ───────────────────────────────────────────────────

function Reel({
  symbol,
  spinning,
  index,
}: {
  symbol: string;
  spinning: boolean;
  index: number;
}) {
  const [displaySymbol, setDisplaySymbol] = useState(symbol);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (spinning) {
      // Cycle through random symbols while spinning
      intervalRef.current = setInterval(() => {
        const randomIdx = Math.floor(Math.random() * ALL_SYMBOLS.length);
        setDisplaySymbol(ALL_SYMBOLS[randomIdx]);
      }, 80);
    } else {
      // Stop spinning — show actual result
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // Staggered stop for each reel
      const delay = index * 200;
      setTimeout(() => {
        setDisplaySymbol(symbol);
      }, delay);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [spinning, symbol, index]);

  return (
    <div className="flex items-center justify-center w-28 h-28 sm:w-32 sm:h-32 bg-gradient-to-b from-[#1a1a2e] to-[#16213e] rounded-xl border-2 border-[#2a2a4a] shadow-inner">
      <span
        className={`text-5xl sm:text-6xl transition-transform duration-200 ${
          spinning ? "blur-[1px]" : ""
        }`}
      >
        {displaySymbol}
      </span>
    </div>
  );
}

// ─── Payout Table Component ───────────────────────────────────────────

function PayoutTable() {
  const payouts = [
    { symbols: "7️⃣ 7️⃣ 7️⃣", label: "Jackpot", multiplier: "50x" },
    { symbols: "💎 💎 💎", label: "Diamond", multiplier: "25x" },
    { symbols: "⭐ ⭐ ⭐", label: "Star", multiplier: "15x" },
    { symbols: "🍇 🍇 🍇", label: "Grape", multiplier: "10x" },
    { symbols: "🍊 🍊 🍊", label: "Orange", multiplier: "8x" },
    { symbols: "🍋 🍋 🍋", label: "Lemon", multiplier: "5x" },
    { symbols: "🍒 🍒 🍒", label: "Cherry", multiplier: "3x" },
  ];

  return (
    <div className="glass-card p-4">
      <h3 className="text-sm font-bold text-[#fbbf24] mb-3 uppercase tracking-wider">
        Payout Table
      </h3>
      <div className="space-y-1.5">
        {payouts.map((p) => (
          <div
            key={p.label}
            className="flex items-center justify-between text-xs sm:text-sm"
          >
            <span className="text-gray-300">{p.symbols}</span>
            <span className="text-[#fbbf24] font-mono font-bold">
              {p.multiplier}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Slot Machine Component ──────────────────────────────────────

export default function SlotMachine() {
  // State
  const [userId] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("slotUserId");
      if (stored) return stored;
      const newId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem("slotUserId", newId);
      return newId;
    }
    return "user_default";
  });

  const [balance, setBalance] = useState<number>(1000);
  const [betAmount, setBetAmount] = useState<number>(DEFAULT_BET);
  const [reels, setReels] = useState<[string, string, string]>(["🍒", "🍋", "🍊"]);
  const [spinning, setSpinning] = useState(false);
  const [lastResult, setLastResult] = useState<SpinResultData | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<TransactionData[]>([]);
  const [message, setMessage] = useState<string>("");
  const [messageType, setMessageType] = useState<"win" | "lose" | "jackpot" | "error" | "info">("info");
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileStatus, setProfileStatus] = useState("");
  const [initialized, setInitialized] = useState(false);

  const refreshBalance = useCallback(async () => {
    const res = await fetch(`/api/balance?userId=${userId}`);
    if (!res.ok) {
      throw new Error("Failed to refresh balance");
    }
    const data = await res.json();
    if (data.balance !== undefined) {
      setBalance(data.balance);
      setRecentTransactions(data.recentTransactions || []);
      setProfileName(data.profileName || "");
      setProfileEmail(data.profileEmail || "");
    }
  }, [userId]);

  // ─── Initialize Balance ───────────────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        await refreshBalance();
        setInitialized(true);
      } catch {
        setInitialized(true);
      }
    }
    init();
  }, [refreshBalance]);

  // ─── Post-Payment Balance Polling ────────────────────────────────
  useEffect(() => {
    if (!initialized) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") !== "success") return;

    let attempts = 0;
    const maxAttempts = 8;
    const intervalMs = 2000;

    const intervalId = setInterval(async () => {
      attempts += 1;

      try {
        await refreshBalance();
      } catch {
        // Ignore polling errors during the temporary post-payment window
      }

      if (attempts >= maxAttempts) {
        clearInterval(intervalId);
      }
    }, intervalMs);

    return () => clearInterval(intervalId);
  }, [initialized, refreshBalance]);

  // ─── Spin Handler ─────────────────────────────────────────────────
  const handleSpin = useCallback(async () => {
    if (spinning) return;
    if (balance < betAmount) {
      setMessage("Insufficient balance! Buy more credits.");
      setMessageType("error");
      return;
    }

    setSpinning(true);
    setMessage("");
    setLastResult(null);

    try {
      const res = await fetch("/api/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, betAmount }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Spin failed");
      }

      // Simulate reel stopping delay for UX
      await new Promise((resolve) => setTimeout(resolve, 1500));

      setReels(data.spin.reels);
      setBalance(data.balance);
      setLastResult(data.spin);

      // Set result message
      if (data.spin.isJackpot) {
        setMessage(`🎰 JACKPOT! You won ${data.spin.winAmount} credits!`);
        setMessageType("jackpot");
      } else if (data.spin.winAmount > 0) {
        setMessage(`You won ${data.spin.winAmount} credits! (${data.spin.multiplier}x)`);
        setMessageType("win");
      } else {
        setMessage("No match. Try again!");
        setMessageType("lose");
      }

      // Refresh transactions (non-blocking for spin result UX)
      try {
        const txRes = await fetch(`/api/balance?userId=${userId}`);
        if (txRes.ok) {
          const txData = await txRes.json();
          setRecentTransactions(txData.recentTransactions || []);
        }
      } catch {
        // Ignore refresh failures so successful spin results remain visible
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Spin failed");
      setMessageType("error");
    } finally {
      setSpinning(false);
    }
  }, [spinning, balance, betAmount, userId]);

  // ─── Buy Credits Handler ──────────────────────────────────────────
  const handleBuyCredits = useCallback(async () => {
    try {
      const res = await fetch("/api/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          amount: 2000, // R20.00 starter package
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Payment initiation failed");
      }

      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else if (data.message) {
        setMessage(data.message);
        setMessageType("info");
      } else {
        throw new Error("Payment initiation failed");
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Payment initiation failed. Try again."
      );
      setMessageType("error");
    }
  }, [userId]);

  const handleSaveProfile = useCallback(async () => {
    setProfileSaving(true);
    setProfileStatus("");

    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          profileName,
          profileEmail,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save profile");
      }

      setProfileName(data.profileName || "");
      setProfileEmail(data.profileEmail || "");
      setProfileStatus("Profile saved");
    } catch (error) {
      setProfileStatus(error instanceof Error ? error.message : "Failed to save profile");
    } finally {
      setProfileSaving(false);
    }
  }, [userId, profileName, profileEmail]);

  if (!initialized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-gray-400 animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl sm:text-5xl font-black bg-gradient-to-r from-[#fbbf24] via-[#f59e0b] to-[#d97706] bg-clip-text text-transparent">
          🎰 SLOT MACHINE
        </h1>
        <p className="text-gray-500 text-sm mt-2">
          Server-Authoritative • Secure • Auditable
        </p>
      </div>

      <div className="glass-card p-4 mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Player Name</p>
            <input
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="Enter your name"
              className="w-full rounded-lg bg-[#111427] border border-[#2a2a4a] px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#fbbf24]"
            />
          </div>
          <div className="flex-1 min-w-[240px]">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Email</p>
            <input
              type="email"
              value={profileEmail}
              onChange={(e) => setProfileEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg bg-[#111427] border border-[#2a2a4a] px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#fbbf24]"
            />
          </div>
          <button
            onClick={handleSaveProfile}
            disabled={profileSaving}
            className="px-4 py-2.5 bg-[#2a2a4a] text-gray-200 rounded-lg font-bold text-sm hover:bg-[#3a3a5a] transition-colors disabled:opacity-50"
          >
            {profileSaving ? "Saving..." : "Save Profile"}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">User ID: {userId}</p>
        {profileStatus && <p className="text-xs mt-1 text-blue-400">{profileStatus}</p>}
      </div>

      {/* Balance Display */}
      <div className="glass-card p-4 mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider">
            Balance
          </p>
          <p className="text-3xl font-black text-[#fbbf24] font-mono coin-drop">
            {balance.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500">credits</p>
        </div>
        <button
          onClick={handleBuyCredits}
          className="px-5 py-2.5 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg font-bold text-sm hover:from-green-500 hover:to-green-600 transition-all hover:-translate-y-0.5 shadow-lg"
        >
          💳 Buy Credits
        </button>
      </div>

      {/* Slot Machine */}
      <div
        className={`glass-card p-8 mb-6 ${
          lastResult?.isJackpot ? "jackpot-glow" : ""
        } ${lastResult?.winAmount && lastResult.winAmount > 0 ? "win-pulse" : ""}`}
      >
        {/* Reels */}
        <div className="flex items-center justify-center gap-4 mb-8">
          {reels.map((symbol, i) => (
            <Reel key={i} symbol={symbol} spinning={spinning} index={i} />
          ))}
        </div>

        {/* Result Message */}
        {message && (
          <div
            className={`text-center mb-6 p-3 rounded-lg text-sm font-bold ${
              messageType === "jackpot"
                ? "bg-yellow-500/20 text-yellow-300 text-lg"
                : messageType === "win"
                ? "bg-green-500/20 text-green-400"
                : messageType === "lose"
                ? "bg-gray-500/20 text-gray-400"
                : messageType === "error"
                ? "bg-red-500/20 text-red-400"
                : "bg-blue-500/20 text-blue-400"
            }`}
          >
            {message}
          </div>
        )}

        {/* Bet Selection */}
        <div className="mb-6">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2 text-center">
            Bet Amount
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {BET_OPTIONS.map((amount) => (
              <button
                key={amount}
                onClick={() => setBetAmount(amount)}
                disabled={spinning}
                className={`px-4 py-2 rounded-lg font-mono font-bold text-sm transition-all ${
                  betAmount === amount
                    ? "bg-[#fbbf24] text-black shadow-lg shadow-yellow-500/30"
                    : "bg-[#2a2a4a] text-gray-300 hover:bg-[#3a3a5a]"
                }`}
              >
                {amount}
              </button>
            ))}
          </div>
        </div>

        {/* Spin Button */}
        <div className="text-center">
          <button
            onClick={handleSpin}
            disabled={spinning || balance < betAmount}
            className="btn-spin px-12 py-4 rounded-xl text-black font-black text-xl uppercase tracking-wider shadow-xl"
          >
            {spinning ? "SPINNING..." : "🎰 SPIN"}
          </button>
          {balance < betAmount && !spinning && (
            <p className="text-red-400 text-xs mt-2">
              Insufficient balance for this bet
            </p>
          )}
        </div>
      </div>

      {/* Bottom Section: Payout Table + Recent Transactions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <PayoutTable />

        {/* Recent Transactions */}
        <div className="glass-card p-4">
          <h3 className="text-sm font-bold text-[#fbbf24] mb-3 uppercase tracking-wider">
            Recent Activity
          </h3>
          {recentTransactions.length === 0 ? (
            <p className="text-gray-500 text-sm">No transactions yet. Start spinning!</p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {recentTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between text-xs py-1.5 border-b border-[#2a2a4a] last:border-0"
                >
                  <div>
                    <span
                      className={`font-bold ${
                        tx.type === "SPIN_WIN"
                          ? "text-green-400"
                          : tx.type === "SPIN_BET"
                          ? "text-red-400"
                          : tx.type === "CREDIT_PURCHASE"
                          ? "text-blue-400"
                          : "text-gray-400"
                      }`}
                    >
                      {tx.type.replace("_", " ")}
                    </span>
                    <span className="text-gray-600 ml-2">
                      {new Date(tx.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <span
                    className={`font-mono font-bold ${
                      tx.amount > 0 ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {tx.amount > 0 ? "+" : ""}
                    {tx.amount}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Security Footer */}
      <div className="text-center mt-8 space-y-1">
        <p className="text-gray-600 text-xs">
          🔒 All outcomes generated server-side using cryptographic randomness
        </p>
        <p className="text-gray-700 text-xs">
          Spin ID: {lastResult?.spinId || "—"}
        </p>
      </div>
    </div>
  );
}
