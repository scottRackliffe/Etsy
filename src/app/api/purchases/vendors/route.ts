import { NextResponse } from "next/server";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { getDb } from "@/lib/sqlite";

export async function GET() {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT DISTINCT vendor_name FROM purchases WHERE vendor_name IS NOT NULL AND vendor_name != '' ORDER BY vendor_name COLLATE NOCASE`
      )
      .all() as Array<{ vendor_name: string }>;
    return NextResponse.json({
      ok: true,
      vendors: rows.map((r) => r.vendor_name),
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load vendors",
        userMessage: "Could not load vendor list.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
