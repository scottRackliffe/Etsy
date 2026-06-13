import { NextResponse } from "next/server";
import { getMonthlyUsage, purgeApiCallLog } from "@/lib/api-usage";
import { getMonthlySessionHours, purgeConnectionSessions } from "@/lib/connection-session";
import { logActivity } from "@/lib/activity-log";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const monthsParam = url.searchParams.get("months");
    const months = monthsParam ? Math.max(1, Math.min(24, parseInt(monthsParam, 10) || 6)) : 6;

    const items = getMonthlyUsage(months);
    const sessions = getMonthlySessionHours(months);

    return NextResponse.json({ ok: true, items, sessions });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Failed to retrieve API usage data" } },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const deletedCalls = purgeApiCallLog();
    const deletedSessions = purgeConnectionSessions();
    logActivity({
      action: "api_usage.purged",
      entityType: "api_call_log",
      detail: { calls_deleted: deletedCalls, sessions_deleted: deletedSessions },
      source: "user",
    });
    return NextResponse.json({ ok: true, deleted: deletedCalls + deletedSessions });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Failed to purge API usage data" } },
      { status: 500 }
    );
  }
}
