import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { parsePagination } from "@/lib/api-utils";
import { getDb } from "@/lib/sqlite";

export async function GET(request: NextRequest) {
  try {
    const skipAuth = request.nextUrl.searchParams.get("wizard") === "1";
    if (!skipAuth) {
      requireEtsyAccessToken(await cookies());
    }
    const { limit, offset } = parsePagination(request.nextUrl.searchParams);
    const db = getDb();
    const total = (db.prepare("SELECT COUNT(*) AS c FROM settings").get() as { c: number }).c;
    const items = db
      .prepare("SELECT key, value, updated_at FROM settings ORDER BY key LIMIT ? OFFSET ?")
      .all(limit, offset);
    return NextResponse.json({
      ok: true,
      items,
      pagination: {
        limit,
        offset,
        total,
        has_more: offset + items.length < total,
      },
    });
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
