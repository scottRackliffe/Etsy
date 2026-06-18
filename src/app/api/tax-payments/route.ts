import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/sqlite";

export async function GET() {
  const rows = getDb()
    .prepare(
      `SELECT id, payment_date, amount, payee, reason,
              period_from, period_to, reference_number, notes, created_at
       FROM tax_payments
       ORDER BY payment_date DESC`
    )
    .all();

  return NextResponse.json({ ok: true, items: rows });
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

  const row = getDb().prepare("SELECT * FROM tax_payments WHERE id = ?").get(result.lastInsertRowid);

  return NextResponse.json({ ok: true, item: row }, { status: 201 });
}
