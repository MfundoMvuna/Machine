/**
 * Admin-Controlled Game Configuration
 * 
 * This module provides tunable settings that control the slot machine's
 * win behavior. All settings are adjustable at runtime via the admin dashboard.
 * 
 * Philosophy: Games become addictive when players WIN frequently.
 * Not jackpots every spin — but enough small/medium wins to keep them playing.
 * 
 * Settings:
 *  - winRate: Target % of spins that produce any win (0–100)
 *  - smallWinWeight: How likely a win is small (cherry/lemon/orange 3x-8x)
 *  - mediumWinWeight: How likely a win is medium (grape/star 10x-15x)
 *  - bigWinWeight: How likely a win is big (diamond/jackpot 25x-50x)
 *  - nearMissRate: % of LOSING spins that show 2 matching symbols (0–100)
 *  - lossStreakBreaker: After N consecutive losses, force a win (0 = disabled)
 *  - enabled: Master switch — when false, uses pure random
 */

import { randomInt } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────

export interface GameConfig {
  /** Master switch for the win-rate system */
  enabled: boolean;
  /** Target win rate percentage (0-100). e.g. 40 = 40% of spins win */
  winRate: number;
  /** Weight for small wins (3x-8x multiplier). Relative to other weights */
  smallWinWeight: number;
  /** Weight for medium wins (10x-15x multiplier). Relative to other weights */
  mediumWinWeight: number;
  /** Weight for big wins (25x-50x multiplier). Relative to other weights */
  bigWinWeight: number;
  /** % of losing spins that show a near-miss (2 matching symbols) */
  nearMissRate: number;
  /** Force a win after this many consecutive losses (0 = disabled) */
  lossStreakBreaker: number;
}

export type WinTier = "small" | "medium" | "big";

export interface NudgeDecision {
  shouldWin: boolean;
  forcedTier?: WinTier;
  isNearMiss: boolean;
  reason: string;
}

// ─── Default Configuration ────────────────────────────────────────────

const DEFAULT_CONFIG: GameConfig = {
  enabled: true,
  winRate: 35,              // 35% of spins result in a win
  smallWinWeight: 70,       // 70% of wins are small (3x-8x)
  mediumWinWeight: 25,      // 25% of wins are medium (10x-15x)
  bigWinWeight: 5,          // 5% of wins are big (25x-50x)
  nearMissRate: 30,         // 30% of losses show a near-miss
  lossStreakBreaker: 5,     // Force a win after 5 consecutive losses
};

// ─── In-Memory State ──────────────────────────────────────────────────

let currentConfig: GameConfig = { ...DEFAULT_CONFIG };

/** Track consecutive losses per user */
const userLossStreaks = new Map<string, number>();

// ─── Config Getters/Setters ───────────────────────────────────────────

export function getGameConfig(): GameConfig {
  return { ...currentConfig };
}

export function updateGameConfig(updates: Partial<GameConfig>): GameConfig {
  // Validate and clamp values
  if (updates.winRate !== undefined) {
    updates.winRate = clamp(updates.winRate, 0, 100);
  }
  if (updates.smallWinWeight !== undefined) {
    updates.smallWinWeight = clamp(updates.smallWinWeight, 0, 100);
  }
  if (updates.mediumWinWeight !== undefined) {
    updates.mediumWinWeight = clamp(updates.mediumWinWeight, 0, 100);
  }
  if (updates.bigWinWeight !== undefined) {
    updates.bigWinWeight = clamp(updates.bigWinWeight, 0, 100);
  }
  if (updates.nearMissRate !== undefined) {
    updates.nearMissRate = clamp(updates.nearMissRate, 0, 100);
  }
  if (updates.lossStreakBreaker !== undefined) {
    updates.lossStreakBreaker = Math.max(0, Math.floor(updates.lossStreakBreaker));
  }

  currentConfig = { ...currentConfig, ...updates };
  console.log("[GameConfig] Updated:", currentConfig);
  return { ...currentConfig };
}

export function resetGameConfig(): GameConfig {
  currentConfig = { ...DEFAULT_CONFIG };
  userLossStreaks.clear();
  console.log("[GameConfig] Reset to defaults");
  return { ...currentConfig };
}

// ─── Loss Streak Tracking ─────────────────────────────────────────────

export function getUserLossStreak(userId: string): number {
  return userLossStreaks.get(userId) || 0;
}

export function recordLoss(userId: string): number {
  const streak = (userLossStreaks.get(userId) || 0) + 1;
  userLossStreaks.set(userId, streak);
  return streak;
}

export function resetLossStreak(userId: string): void {
  userLossStreaks.delete(userId);
}

// ─── Nudge Decision Engine ────────────────────────────────────────────

/**
 * Decide whether the next spin should be nudged toward a win.
 * 
 * This does NOT generate the spin result — it just decides the "intent".
 * The slot engine then uses this intent when generating reels.
 */
export function decideNudge(userId: string): NudgeDecision {
  if (!currentConfig.enabled) {
    return { shouldWin: false, isNearMiss: false, reason: "Config disabled — pure random" };
  }

  const lossStreak = getUserLossStreak(userId);

  // ─── Loss Streak Breaker ──────────────────────────────────────
  if (
    currentConfig.lossStreakBreaker > 0 &&
    lossStreak >= currentConfig.lossStreakBreaker
  ) {
    const tier = pickWinTier();
    return {
      shouldWin: true,
      forcedTier: tier,
      isNearMiss: false,
      reason: `Loss streak breaker (${lossStreak} losses)`,
    };
  }

  // ─── Win Rate Roll ────────────────────────────────────────────
  const roll = randomInt(0, 100);
  if (roll < currentConfig.winRate) {
    const tier = pickWinTier();
    return {
      shouldWin: true,
      forcedTier: tier,
      isNearMiss: false,
      reason: `Win rate hit (rolled ${roll} < ${currentConfig.winRate})`,
    };
  }

  // ─── Near Miss Roll (for losing spins) ────────────────────────
  const nearMissRoll = randomInt(0, 100);
  const isNearMiss = nearMissRoll < currentConfig.nearMissRate;

  return {
    shouldWin: false,
    isNearMiss,
    reason: isNearMiss
      ? `Near miss (rolled ${nearMissRoll} < ${currentConfig.nearMissRate})`
      : `Loss (rolled ${roll} >= ${currentConfig.winRate})`,
  };
}

// ─── Win Tier Selection ───────────────────────────────────────────────

function pickWinTier(): WinTier {
  const total =
    currentConfig.smallWinWeight +
    currentConfig.mediumWinWeight +
    currentConfig.bigWinWeight;

  if (total <= 0) return "small";

  const roll = randomInt(0, total);
  if (roll < currentConfig.smallWinWeight) return "small";
  if (roll < currentConfig.smallWinWeight + currentConfig.mediumWinWeight) return "medium";
  return "big";
}

// ─── Utility ──────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
