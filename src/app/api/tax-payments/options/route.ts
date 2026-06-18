import { NextResponse } from "next/server";
import { getDb } from "@/lib/sqlite";

const DEFAULT_PAYEES = [
  "State Department of Revenue",
  "State Tax Commission",
  "City/County Tax Office",
];

const DEFAULT_REASONS = [
  "Monthly filing",
  "Quarterly filing",
  "Annual filing",
  "Penalty",
  "Interest",
  "Adjustment",
  "Audit assessment",
];

function mergeDistinct(defaults: string[], dbValues: string[]): string[] {
  return Array.from(new Set([...defaults, ...dbValues])).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

export async function GET() {
  const db = getDb();

  const payeeRows = db
    .prepare(
      `SELECT DISTINCT payee FROM tax_payments
       WHERE payee IS NOT NULL AND payee != ''
       ORDER BY payee COLLATE NOCASE`
    )
    .all() as Array<{ payee: string }>;

  const reasonRows = db
    .prepare(
      `SELECT DISTINCT reason FROM tax_payments
       WHERE reason IS NOT NULL AND reason != ''
       ORDER BY reason COLLATE NOCASE`
    )
    .all() as Array<{ reason: string }>;

  return NextResponse.json({
    ok: true,
    payees: mergeDistinct(DEFAULT_PAYEES, payeeRows.map((r) => r.payee)),
    reasons: mergeDistinct(DEFAULT_REASONS, reasonRows.map((r) => r.reason)),
  });
}
