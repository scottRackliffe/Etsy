/**
 * POST /api/inventory/regenerate-thumbnails
 *
 * Regenerates all inventory thumbnails (ADR-026 §5).
 * Used when thumbnail_size setting changes.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { regenerateAllThumbnails } from "@/lib/picture-storage";

export async function POST() {
  try {
    requireEtsyAccessToken(await cookies());
    const result = await regenerateAllThumbnails();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to regenerate thumbnails",
        userMessage: "We could not regenerate thumbnails.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
