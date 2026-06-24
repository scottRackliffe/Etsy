import { NextResponse } from "next/server";
import { getTaxComplianceStatus } from "@/lib/tax-payments";

// Returns the tax payment summary PLUS filing-compliance status (ADR-039 / audit C22):
// balance_due, next_filing_due_date, days_until_due, filing_status, etc.
export async function GET() {
  return NextResponse.json({ ok: true, ...getTaxComplianceStatus() });
}
