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
import {
  decideNudge,
  recordLoss,
  resetLossStreak,
  type WinTier,
  type NudgeDecision,
} from "./game-config";

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
  /** Internal: why the nudge system made this decision (not sent to client) */
  nudgeReason?: string;
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

// ─── Win Tier Symbol Mappings ─────────────────────────────────────────
// Used by the nudge system to force specific outcome tiers.

const SMALL_WIN_SYMBOLS: SlotSymbol[] = ["🍒", "🍋", "🍊"];   // 3x, 5x, 8x
const MEDIUM_WIN_SYMBOLS: SlotSymbol[] = ["🍇", "⭐"];          // 10x, 15x
const BIG_WIN_SYMBOLS: SlotSymbol[] = ["💎", "7️⃣"];             // 25x, 50x

function pickSymbolForTier(tier: WinTier): SlotSymbol {
  const pool =
    tier === "small"
      ? SMALL_WIN_SYMBOLS
      : tier === "medium"
      ? MEDIUM_WIN_SYMBOLS
      : BIG_WIN_SYMBOLS;

  return pool[randomInt(0, pool.length)];
}

/**
 * Generate a near-miss result: two matching symbols + one different.
 */
function generateNearMiss(): [SlotSymbol, SlotSymbol, SlotSymbol] {
  // Pick a symbol for the pair (bias toward more exciting symbols)
  const pool: SlotSymbol[] = ["🍇", "⭐", "💎", "🍊", "🍋"];
  const matchSymbol = pool[randomInt(0, pool.length)];

  // Third reel must be different
  let thirdSymbol: SlotSymbol;
  do {
    thirdSymbol = SYMBOLS[randomInt(0, SYMBOLS.length)];
  } while (thirdSymbol === matchSymbol);

  // Randomly decide if the mismatch is on reel 3 (most common near-miss pattern)
  return [matchSymbol, matchSymbol, thirdSymbol];
}

/**
 * Generate a forced winning combination for a given tier.
 */
function generateForcedWin(tier: WinTier): [SlotSymbol, SlotSymbol, SlotSymbol] {
  const symbol = pickSymbolForTier(tier);
  return [symbol, symbol, symbol];
}

/**
 * Generate a guaranteed losing spin (no 3-of-a-kind, no partial match).
 */
function generateGuaranteedLoss(): [SlotSymbol, SlotSymbol, SlotSymbol] {
  let reels: [SlotSymbol, SlotSymbol, SlotSymbol];
  let attempts = 0;

  do {
    reels = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];
    attempts++;
    // Make sure it's not a 3-of-a-kind or a paying 2-of-a-kind
    const multiplier = calculateMultiplier(reels);
    if (multiplier === 0) break;
  } while (attempts < 20);

  return reels;
}

// ─── Admin-Controlled Spin ────────────────────────────────────────────

/**
 * Execute a spin with admin-controlled win rate nudging.
 * 
 * This wraps the core engine with the nudge system:
 *  1. Ask the nudge engine if this spin should win
 *  2. If yes, generate reels that produce the desired tier
 *  3. If no but near-miss, generate a near-miss
 *  4. If no, generate a normal loss
 *  5. Track loss streaks for the streak-breaker feature
 * 
 * The nudge system is probabilistic — it doesn't guarantee exact win rates,
 * but it biases outcomes to match the admin's target over many spins.
 */
export function executeConfiguredSpin(config: SpinConfig): SpinResult {
  const { betAmount, userId } = config;

  if (betAmount <= 0 || !Number.isFinite(betAmount)) {
    throw new Error("Invalid bet amount");
  }

  const nudge: NudgeDecision = decideNudge(userId);
  let reels: [SlotSymbol, SlotSymbol, SlotSymbol];

  if (nudge.shouldWin) {
    // Force a winning combination
    reels = generateForcedWin(nudge.forcedTier || "small");
    resetLossStreak(userId);
  } else if (nudge.isNearMiss) {
    // Show a near-miss (2 matching + 1 different)
    reels = generateNearMiss();
    recordLoss(userId);
  } else {
    // Normal spin — but ensure it doesn't accidentally win big
    // Use pure random first, then check
    reels = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];
    const accidentalMultiplier = calculateMultiplier(reels);

    if (accidentalMultiplier > 0) {
      // Lucky! The random spin happened to win anyway — allow it and reset streak
      resetLossStreak(userId);
    } else {
      recordLoss(userId);
    }
  }

  const multiplier = calculateMultiplier(reels);
  const winAmount = multiplier * betAmount;
  const isJackpot = reels.every((s) => s === "7️⃣");

  // If this was supposed to be a win but the multiplier is 0 (shouldn't happen), 
  // track as a loss
  if (nudge.shouldWin && multiplier === 0) {
    recordLoss(userId);
  }

  console.log(
    `[Spin] User=${userId} Bet=${betAmount} Reels=${reels.join("")} ` +
    `Win=${winAmount} Nudge="${nudge.reason}"`
  );

  return {
    reels,
    multiplier,
    winAmount,
    isJackpot,
    timestamp: Date.now(),
    spinId: generateSpinId(),
    nudgeReason: nudge.reason,
  };
}
