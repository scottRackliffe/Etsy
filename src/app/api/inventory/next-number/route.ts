import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getDb } from "@/lib/sqlite";
import { getSetting } from "@/lib/settings-store";

const DEFAULT_PREFIX = "ITEM";
const DEFAULT_PADDING = 4;

export async function GET() {
  try {
    requireEtsyAccessToken(await cookies());
    const db = getDb();

    const prefix = getSetting("inventory.number_prefix") || DEFAULT_PREFIX;
    const paddingRaw = parseInt(getSetting("inventory.number_padding") ?? "", 10);
    const padding = Number.isFinite(paddingRaw) && paddingRaw >= 2 && paddingRaw <= 6
      ? paddingRaw
      : DEFAULT_PADDING;

    const row = db.prepare("SELECT MAX(id) AS max_id FROM inventory").get() as
      | { max_id: number | null }
      | undefined;
    const nextId = (row?.max_id ?? 0) + 1;
    const seq = String(nextId).padStart(padding, "0");
    const nextNumber = `${prefix}-${seq}`;

    return NextResponse.json({
      ok: true,
      next_number: nextNumber,
      next_id: nextId,
      prefix,
      padding,
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to compute next item number",
        userMessage: "Could not determine the next item number.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
