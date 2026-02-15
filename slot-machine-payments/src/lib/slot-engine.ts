/**
 * Slot Machine Engine — Server-Side Only
 * 
 * CRITICAL: All spin logic runs on the server.
 * The frontend NEVER determines spin outcomes.
 * This prevents client-side manipulation and ensures fairness.
 * 
 * Architecture:
 *  - Cryptographically secure randomness (crypto.getRandomValues)
 *  - Configurable payout table with house edge
 *  - Server-authoritative results only
 */

import { randomInt } from "crypto";

// ─── Symbol Definitions ───────────────────────────────────────────────
export const SYMBOLS = ["🍒", "🍋", "🍊", "🍇", "⭐", "💎", "7️⃣"] as const;
export type SlotSymbol = (typeof SYMBOLS)[number];

// ─── Payout Table ─────────────────────────────────────────────────────
// Multiplier applied to the bet amount when a winning combination hits.
// House edge is built into the probability distribution.
const PAYOUT_TABLE: Record<string, number> = {
  "7️⃣7️⃣7️⃣": 50,    // Jackpot
  "💎💎💎": 25,     // Diamond trio
  "⭐⭐⭐": 15,     // Star trio
  "🍇🍇🍇": 10,     // Grape trio
  "🍊🍊🍊": 8,      // Orange trio
  "🍋🍋🍋": 5,      // Lemon trio
  "🍒🍒🍒": 3,      // Cherry trio
};

// Partial matches (two of a kind on the first two reels)
const PARTIAL_PAYOUT: Record<string, number> = {
  "7️⃣7️⃣": 5,
  "💎💎": 3,
  "⭐⭐": 2,
};

// ─── Spin Result Type ─────────────────────────────────────────────────
export interface SpinResult {
  reels: [SlotSymbol, SlotSymbol, SlotSymbol];
  multiplier: number;
  winAmount: number;
  isJackpot: boolean;
  timestamp: number;
  spinId: string;
}

// ─── Spin Configuration ──────────────────────────────────────────────
export interface SpinConfig {
  betAmount: number;
  userId: string;
}

// ─── Symbol Weights ───────────────────────────────────────────────────
// Lower weight = rarer symbol. This creates the house edge.
// Total weight per reel determines probability distribution.
const SYMBOL_WEIGHTS: Record<SlotSymbol, number> = {
  "🍒": 30,  // Most common
  "🍋": 25,
  "🍊": 20,
  "🍇": 15,
  "⭐": 7,
  "💎": 2,
  "7️⃣": 1,   // Rarest
};

const TOTAL_WEIGHT = Object.values(SYMBOL_WEIGHTS).reduce((a, b) => a + b, 0);

// ─── Core Engine ──────────────────────────────────────────────────────

/**
 * Generate a single random symbol based on weighted probability.
 * Uses Node.js crypto.randomInt for cryptographic randomness.
 */
function getRandomSymbol(): SlotSymbol {
  const roll = randomInt(0, TOTAL_WEIGHT);
  let cumulative = 0;

  for (const [symbol, weight] of Object.entries(SYMBOL_WEIGHTS)) {
    cumulative += weight;
    if (roll < cumulative) {
      return symbol as SlotSymbol;
    }
  }

  // Fallback (should never reach here)
  return "🍒";
}

/**
 * Generate a unique spin ID for transaction tracking.
 * Format: SPIN-{timestamp}-{random}
 */
function generateSpinId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomInt(0, 0xffffff).toString(36).padStart(5, "0");
  return `SPIN-${timestamp}-${random}`;
}

/**
 * Calculate the payout multiplier for a given reel combination.
 */
function calculateMultiplier(reels: [SlotSymbol, SlotSymbol, SlotSymbol]): number {
  const key = reels.join("");

  // Check for three-of-a-kind
  if (PAYOUT_TABLE[key]) {
    return PAYOUT_TABLE[key];
  }

  // Check for two-of-a-kind (first two reels)
  const partialKey = reels.slice(0, 2).join("");
  if (reels[0] === reels[1] && PARTIAL_PAYOUT[partialKey]) {
    return PARTIAL_PAYOUT[partialKey];
  }

  // No match
  return 0;
}

/**
 * Execute a server-authoritative spin.
 * 
 * This is the ONLY function that should determine spin outcomes.
 * It must be called from a server-side API route — never from the client.
 * 
 * @param config - Bet amount and user identification
 * @returns SpinResult with reels, multiplier, and win amount
 */
export function executeSpin(config: SpinConfig): SpinResult {
  const { betAmount } = config;

  // Validate bet amount
  if (betAmount <= 0 || !Number.isFinite(betAmount)) {
    throw new Error("Invalid bet amount");
  }

  // Generate three random reels
  const reels: [SlotSymbol, SlotSymbol, SlotSymbol] = [
    getRandomSymbol(),
    getRandomSymbol(),
    getRandomSymbol(),
  ];

  const multiplier = calculateMultiplier(reels);
  const winAmount = multiplier * betAmount;
  const isJackpot = reels.every((s) => s === "7️⃣");

  return {
    reels,
    multiplier,
    winAmount,
    isJackpot,
    timestamp: Date.now(),
    spinId: generateSpinId(),
  };
}

/**
 * Get the theoretical Return-to-Player (RTP) percentage.
 * Useful for transparency/admin dashboards.
 */
export function calculateTheoreticalRTP(): number {
  let expectedReturn = 0;

  // Calculate probability and expected value for each three-of-a-kind
  for (const [combo, multiplier] of Object.entries(PAYOUT_TABLE)) {
    const symbols = [...combo].filter((_, i) => {
      // Handle multi-codepoint emojis by joining in groups
      return true;
    });
    // For three identical symbols: P = (weight/total)^3
    const firstSymbol = combo.slice(0, 2) as SlotSymbol; // Handle emoji width
    const weight = SYMBOL_WEIGHTS[firstSymbol] || 0;
    const probability = Math.pow(weight / TOTAL_WEIGHT, 3);
    expectedReturn += probability * multiplier;
  }

  return expectedReturn * 100; // Convert to percentage
}

// ─── Valid bet amounts ────────────────────────────────────────────────
export const BET_OPTIONS = [1, 5, 10, 25, 50, 100] as const;
export const DEFAULT_BET = 10;
export const INITIAL_BALANCE = 1000; // Starting credits for new users
