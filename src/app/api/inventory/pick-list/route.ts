import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { getDb } from "@/lib/sqlite";

export async function GET() {
  try {
    requireEtsyAccessToken(await cookies());
    const db = getDb();
    const items = db
      .prepare(
        `
        SELECT id, item_number, description, quantity, status
        FROM inventory
        WHERE status IN ('In stock', 'Listed', 'Reserved')
        ORDER BY id DESC
      `
      )
      .all();
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load pick list",
        userMessage: "We could not load the pick list.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
