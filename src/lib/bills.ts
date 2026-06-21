import { getDb } from "@/lib/sqlite";

const NON_TAX_CATEGORY = "Tax Remittance";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type BillRecord = {
  id: number;
  expense_date: string;
  vendor_name: string | null;
  category: string | null;
  subcategory: string | null;
  amount: number;
  amount_paid: number;
  amount_unpaid: number;
  payment_status: string;
  invoice_number: string | null;
  due_date: string | null;
  date_paid: string | null;
};

export function listNonTaxBills(limit = 25): BillRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
         be.id,
         be.expense_date,
         be.vendor_name,
         be.category,
         be.subcategory,
         be.amount,
         be.payment_status,
         be.invoice_number,
         be.due_date,
         be.date_paid,
         COALESCE(paid.total_paid, 0) AS amount_paid
       FROM business_expenses be
       LEFT JOIN (
         SELECT expense_id, SUM(amount) AS total_paid
         FROM bill_payments
         GROUP BY expense_id
       ) paid ON paid.expense_id = be.id
       WHERE be.category IS NULL OR be.category != ?
       ORDER BY
         CASE be.payment_status WHEN 'paid' THEN 1 ELSE 0 END,
         be.expense_date DESC,
         be.id DESC
       LIMIT ?`
    )
    .all(NON_TAX_CATEGORY, limit) as Array<Omit<BillRecord, "amount_unpaid">>;

  return rows.map((row) => ({
    ...row,
    amount: round2(row.amount ?? 0),
    amount_paid: round2(row.amount_paid ?? 0),
    amount_unpaid: round2(Math.max(0, (row.amount ?? 0) - (row.amount_paid ?? 0))),
  }));
}

export function getBillPaymentSummary() {
  const db = getDb();

  const amounts = db
    .prepare(
      `SELECT
         COALESCE(SUM(
           CASE
             WHEN be.payment_status != 'paid'
             THEN CASE
               WHEN be.amount - COALESCE(paid.total_paid, 0) > 0
               THEN be.amount - COALESCE(paid.total_paid, 0)
               ELSE 0
             END
             ELSE 0
           END
         ), 0) AS unpaid_amount,
         COALESCE(SUM(COALESCE(paid.total_paid, 0)), 0) AS paid_amount,
         SUM(CASE WHEN be.payment_status != 'paid' THEN 1 ELSE 0 END) AS unpaid_count,
         SUM(CASE WHEN be.payment_status = 'paid' THEN 1 ELSE 0 END) AS paid_count,
         COUNT(*) AS bill_count
       FROM business_expenses be
       LEFT JOIN (
         SELECT expense_id, SUM(amount) AS total_paid
         FROM bill_payments
         GROUP BY expense_id
       ) paid ON paid.expense_id = be.id
       WHERE be.category IS NULL OR be.category != ?`
    )
    .get(NON_TAX_CATEGORY) as {
    unpaid_amount: number;
    paid_amount: number;
    unpaid_count: number;
    paid_count: number;
    bill_count: number;
  };

  const lastPayment = db
    .prepare(
      `SELECT bp.payment_date, bp.created_at
       FROM bill_payments bp
       JOIN business_expenses be ON be.id = bp.expense_id
       WHERE be.category IS NULL OR be.category != ?
       ORDER BY bp.created_at DESC, bp.id DESC
       LIMIT 1`
    )
    .get(NON_TAX_CATEGORY) as { payment_date: string; created_at: string } | undefined;

  return {
    unpaid_amount: round2(amounts.unpaid_amount ?? 0),
    paid_amount: round2(amounts.paid_amount ?? 0),
    unpaid_count: amounts.unpaid_count ?? 0,
    paid_count: amounts.paid_count ?? 0,
    bill_count: amounts.bill_count ?? 0,
    last_payment_date: lastPayment?.payment_date ?? null,
    last_payment_at: lastPayment?.created_at ?? null,
  };
}