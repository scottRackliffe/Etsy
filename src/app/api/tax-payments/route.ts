import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/sqlite";
import { getAllTaxPayments } from "@/lib/tax-payments";
import { logActivity } from "@/lib/activity-log";

export async function GET() {
  const items = getAllTaxPayments();
  return NextResponse.json({ ok: true, items });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { payment_date, amount, payee, reason, period_from, period_to, reference_number, notes } = body;

  if (!payment_date || amount == null || amount <= 0) {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Payment date and amount are required." } },
      { status: 400 }
    );
  }

  const result = getDb()
    .prepare(
      `INSERT INTO tax_payments (payment_date, amount, payee, reason, period_from, period_to, reference_number, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(payment_date, amount, payee || null, reason || null, period_from || null, period_to || null, reference_number || null, notes || null);

  const row = getDb().prepare("SELECT * FROM tax_payments WHERE id = ?").get(result.lastInsertRowid) as { id?: number; payee?: string; reason?: string } | undefined;
  logActivity({ action: "tax_payment.created", entityType: "tax_payment", entityId: row?.id ?? undefined, entityLabel: payee || reason || "Tax payment" });

  return NextResponse.json({ ok: true, item: row }, { status: 201 });
}
