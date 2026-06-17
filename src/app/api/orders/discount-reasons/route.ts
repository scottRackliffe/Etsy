import { NextResponse } from "next/server";
import { getDb } from "@/lib/sqlite";

export async function GET() {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT discount_reason
       FROM orders
       WHERE discount_reason IS NOT NULL AND discount_reason <> ''
       ORDER BY discount_reason ASC`
    )
    .all() as Array<{ discount_reason: string }>;

  return NextResponse.json({ reasons: rows.map((r) => r.discount_reason) });
}
