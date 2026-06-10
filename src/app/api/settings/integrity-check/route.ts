import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getDb } from "@/lib/sqlite";
import { runIntegrityCheckOnDb } from "@/lib/sqlite-integrity";
import { setSetting } from "@/lib/settings-store";
import { logActivity } from "@/lib/activity-log";

export async function POST() {
  try {
    requireEtsyAccessToken(await cookies());
    const db = getDb();
    const { ok, details } = runIntegrityCheckOnDb(db);
    const now = new Date().toISOString();

    setSetting("last_integrity_check", now);

    if (ok) {
      setSetting("integrity_warning", "");
      return NextResponse.json({ ok: true, result: "ok" });
    }

    setSetting("integrity_warning", "true");

    logActivity({
      action: "system.integrity_check_failed",
      entityType: "system",
      entityLabel: "Database integrity",
      detail: { details },
      source: "user",
    });

    return NextResponse.json({
      ok: true,
      result: "issues found",
      details,
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to run integrity check",
        userMessage: "We could not run the database integrity check.",
        actions: ["Try again in a moment."],
      })
    );
  }
}
