import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getDb } from "@/lib/sqlite";

export async function GET(request: NextRequest) {
  try {
    const skipAuth = request.nextUrl.searchParams.get("wizard") === "1";
    if (!skipAuth) {
      requireEtsyAccessToken(await cookies());
    }
    const db = getDb();
    const rows = db
      .prepare("SELECT key, value FROM settings ORDER BY key")
      .all() as Array<{ key: string; value: string | null }>;
    const settings: Record<string, string | null> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load settings",
        userMessage: "We could not load settings.",
        actions: ["Retry in a moment.", "Reconnect Etsy if your session expired."],
      })
    );
  }
}

export async function POST() {
  return errorResponse(
    new ApiRouteError({
      status: 405,
      code: "VALIDATION_ERROR",
      message: "Method not allowed",
      userMessage: "Use PUT /api/settings/[key] to update a setting.",
      actions: ["Retry with the correct endpoint."],
      canRetry: false,
    })
  );
}
