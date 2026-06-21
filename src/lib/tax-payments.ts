import { getDb } from "@/lib/sqlite";

export type TaxPaymentRecord = {
  id: string;
  source: "legacy" | "expense";
  source_id: number;
  expense_id: number | null;
  payment_date: string;
  amount: number;
  payee: string | null;
  reason: string | null;
  period_from: string | null;
  period_to: string | null;
  reference_number: string | null;
  notes: string | null;
  created_at: string | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function getAllTaxPayments(): TaxPaymentRecord[] {
  const db = getDb();

  const fromExpenses = db
    .prepare(
      `SELECT
         bp.id AS source_id,
         be.id AS expense_id,
         bp.payment_date,
         bp.amount,
         be.vendor_name AS payee,
         be.subcategory AS reason,
         be.period_from,
         be.period_to,
         bp.reference_number,
         be.notes,
         bp.created_at
       FROM bill_payments bp
       JOIN business_expenses be ON be.id = bp.expense_id
       WHERE be.category = 'Tax Remittance'
       ORDER BY bp.payment_date DESC, bp.id DESC`
    )
    .all() as Array<Omit<TaxPaymentRecord, "id" | "source"> & { source_id: number; expense_id: number }>;

  const legacyOnly = db
    .prepare(
      `SELECT
         tp.id AS source_id,
         tp.payment_date,
         tp.amount,
         tp.payee,
         tp.reason,
         tp.period_from,
         tp.period_to,
         tp.reference_number,
         tp.notes,
         tp.created_at
       FROM tax_payments tp
       WHERE NOT EXISTS (
         SELECT 1
         FROM bill_payments bp
         JOIN business_expenses be ON be.id = bp.expense_id
         WHERE be.category = 'Tax Remittance'
           AND bp.payment_date = tp.payment_date
           AND ABS(bp.amount - tp.amount) < 0.01
       )
       ORDER BY tp.payment_date DESC, tp.id DESC`
    )
    .all() as Array<Omit<TaxPaymentRecord, "id" | "source" | "expense_id"> & { source_id: number }>;

  const items: TaxPaymentRecord[] = [
    ...fromExpenses.map((row) => ({
      ...row,
      id: `expense-${row.source_id}`,
      source: "expense" as const,
    })),
    ...legacyOnly.map((row) => ({
      ...row,
      expense_id: null,
      id: `legacy-${row.source_id}`,
      source: "legacy" as const,
    })),
  ];

  items.sort((a, b) => {
    const dateCmp = b.payment_date.localeCompare(a.payment_date);
    if (dateCmp !== 0) return dateCmp;
    return b.source_id - a.source_id;
  });

  return items;
}

export function getTaxPaymentSummary() {
  const db = getDb();
  const year = new Date().getFullYear();
  const yearStart = `${year}-01-01`;
  const payments = getAllTaxPayments();

  const taxCollectedRow = db
    .prepare(
      `SELECT ROUND(COALESCE(SUM(
         CASE WHEN payment_status != 'refunded' THEN COALESCE(tax_total, 0) ELSE 0 END
       ), 0), 2) AS tax_collected
       FROM orders
       WHERE order_status = 'active'`
    )
    .get() as { tax_collected: number };

  const totalRemitted = round2(payments.reduce((sum, p) => sum + (p.amount ?? 0), 0));
  const currentYearPaid = round2(
    payments
      .filter((p) => p.payment_date >= yearStart)
      .reduce((sum, p) => sum + (p.amount ?? 0), 0)
  );
  const lastPaymentDate =
    payments.length > 0
      ? payments.reduce((latest, p) => (p.payment_date > latest ? p.payment_date : latest), payments[0]!.payment_date)
      : null;
  const taxCollected = round2(taxCollectedRow.tax_collected ?? 0);
  const balanceDue = round2(taxCollected - totalRemitted);

  return {
    tax_collected: taxCollected,
    total_remitted: totalRemitted,
    balance_due: balanceDue,
    last_payment_date: lastPaymentDate,
    current_year_paid: currentYearPaid,
    payments_count: payments.length,
  };
}
