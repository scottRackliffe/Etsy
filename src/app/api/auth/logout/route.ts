/**
 * POST /api/auth/logout
 * Invalidates SQLite-backed Etsy session and clears session cookie.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { SESSION_COOKIE, clearSession } from "@/lib/auth-session";

export async function POST() {
  try {
    const cookieStore = await cookies();
    clearSession();
    cookieStore.delete(SESSION_COOKIE);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Logout failed",
        userMessage: "We could not disconnect your Etsy session.",
        actions: ["Try disconnecting again.", "If the issue persists, refresh and retry."],
      })
    );
  }
}
