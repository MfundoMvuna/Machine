/**
 * GET/POST /api/admin/settings — Game Configuration API
 * 
 * GET: Retrieve current game configuration
 * POST: Update game configuration (partial updates supported)
 * DELETE: Reset to default configuration
 * 
 * In production, this should be protected by authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getGameConfig,
  updateGameConfig,
  resetGameConfig,
  type GameConfig,
} from "@/lib/game-config";
import { writeAuditLog } from "@/lib/db";

export async function GET() {
  const config = getGameConfig();
  return NextResponse.json({ config });
}

export async function POST(request: NextRequest) {
  try {
    const body: Partial<GameConfig> = await request.json();

    // Validate that only known keys are being set
    const allowedKeys: (keyof GameConfig)[] = [
      "enabled",
      "winRate",
      "smallWinWeight",
      "mediumWinWeight",
      "bigWinWeight",
      "nearMissRate",
      "lossStreakBreaker",
    ];

    const updates: Partial<GameConfig> = {};
    for (const key of allowedKeys) {
      if (key in body) {
        (updates as Record<string, unknown>)[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid settings provided" },
        { status: 400 }
      );
    }

    const config = updateGameConfig(updates);

    writeAuditLog({
      action: "ADMIN_CONFIG_CHANGED",
      details: Object.fromEntries(
        Object.entries(updates).map(([k, v]) => [k, String(v)])
      ),
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      config,
      message: "Game settings updated",
    });
  } catch (error) {
    console.error("[Admin Settings] Error:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const config = resetGameConfig();

  writeAuditLog({
    action: "ADMIN_CONFIG_RESET",
    details: { message: "Reset to defaults" },
  }).catch(() => {});

  return NextResponse.json({
    success: true,
    config,
    message: "Game settings reset to defaults",
  });
}
