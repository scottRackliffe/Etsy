import { NextResponse } from "next/server";
import { getDb } from "@/lib/sqlite";

export async function GET() {
  const db = getDb();
  const year = new Date().getFullYear();
  const yearStart = `${year}-01-01`;

  const fromTaxTable = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS total_paid,
            COALESCE(SUM(CASE WHEN payment_date >= ? THEN amount ELSE 0 END), 0) AS current_year_paid,
            MAX(payment_date) AS last_payment_date,
            COUNT(*) AS payments_count
     FROM tax_payments`
  ).get(yearStart) as { total_paid: number; current_year_paid: number; last_payment_date: string | null; payments_count: number };

  const fromExpenses = db.prepare(
    `SELECT COALESCE(SUM(bp.amount), 0) AS total_paid,
            COALESCE(SUM(CASE WHEN bp.payment_date >= ? THEN bp.amount ELSE 0 END), 0) AS current_year_paid,
            MAX(bp.payment_date) AS last_payment_date,
            COUNT(DISTINCT be.id) AS payments_count
     FROM business_expenses be
     JOIN bill_payments bp ON bp.expense_id = be.id
     WHERE be.category = 'Tax Remittance'`
  ).get(yearStart) as { total_paid: number; current_year_paid: number; last_payment_date: string | null; payments_count: number };

  const total_paid = (fromTaxTable.total_paid ?? 0) + (fromExpenses.total_paid ?? 0);
  const current_year_paid = (fromTaxTable.current_year_paid ?? 0) + (fromExpenses.current_year_paid ?? 0);
  const last_payment_date = [fromTaxTable.last_payment_date, fromExpenses.last_payment_date]
    .filter(Boolean)
    .sort()
    .pop() ?? null;
  const payments_count = (fromTaxTable.payments_count ?? 0) + (fromExpenses.payments_count ?? 0);

  return NextResponse.json({
    ok: true,
    total_paid,
    current_year_paid,
    last_payment_date,
    payments_count,
  });
}
