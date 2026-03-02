/**
 * GET /api/admin/audit — Retrieve audit logs
 * 
 * Query params:
 *  - limit: Max number of logs to return (default: 100)
 *  - action: Filter by action type (optional)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuditLogs, type AuditAction } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const action = searchParams.get("action") as AuditAction | null;

    const logs = await getAuditLogs(limit, action || undefined);

    return NextResponse.json({ logs });
  } catch (error) {
    console.error("[Admin/Audit] Error fetching audit logs:", error);
    return NextResponse.json(
      { error: "Failed to fetch audit logs", logs: [] },
      { status: 500 }
    );
  }
}
