import { NextResponse } from "next/server";
import { getTaxPaymentSummary } from "@/lib/tax-payments";

export async function GET() {
  return NextResponse.json({ ok: true, ...getTaxPaymentSummary() });
}
