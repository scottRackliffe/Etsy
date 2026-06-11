/**
 * GET /api/auth/etsy/info
 * Read-only Etsy connection metadata for the Config page (ADR-034 §2).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSetting } from "@/lib/settings-store";
import { errorResponse, fromUnknownError } from "@/lib/api-error";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("etsy_session_id");
    const hasSession = !!sessionCookie?.value;

    return NextResponse.json({
      ok: true,
      connected: hasSession,
      redirect_uri: process.env.ETSY_REDIRECT_URI ?? null,
      token_expires_at: hasSession ? (getSetting("etsy_token_expires_at") ?? null) : null,
      last_etsy_sync_at: getSetting("last_etsy_sync_at") ?? null,
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load Etsy info",
        userMessage: "Could not load connection info.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
