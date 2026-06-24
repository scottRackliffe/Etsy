import { getDb } from "@/lib/sqlite";
import { getSetting } from "@/lib/settings-store";

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

/**
 * Tax filing compliance status (ADR-039 / audit C22) — the "is it filed on time?" focus.
 *
 * The outstanding liability is already a fact (`balance_due` = collected − remitted). What this adds
 * is filing-timeliness against the OWNER-CONFIGURED schedule — we do NOT hardcode any jurisdiction's
 * filing calendar (CT or otherwise); the due date and cadence are facts the operator supplies via
 * settings:
 *   • tax.next_filing_due_date  — ISO date (YYYY-MM-DD) of the next filing deadline
 *   • tax.filing_frequency      — "monthly" | "quarterly" | "annual" (informational label)
 *   • tax.filing_reminder_days  — lead-time window for the "due soon" warning (default 14)
 *
 * filing_status:
 *   "current"      — nothing owed (balance_due ≤ 0)
 *   "no_schedule"  — money owed but no due date configured (operator must set one)
 *   "overdue"      — money owed and the due date has passed
 *   "due_soon"     — money owed and due within the reminder window
 *   "ok"           — money owed, due date set, beyond the reminder window
 */
export type TaxFilingStatus = "current" | "no_schedule" | "overdue" | "due_soon" | "ok";

export function getTaxComplianceStatus() {
  const summary = getTaxPaymentSummary();
  const nextDue = (getSetting("tax.next_filing_due_date") ?? "").trim() || null;
  const frequency = (getSetting("tax.filing_frequency") ?? "").trim() || null;
  const reminderRaw = parseInt(getSetting("tax.filing_reminder_days") ?? "", 10);
  const reminderDays = Number.isFinite(reminderRaw) && reminderRaw > 0 ? reminderRaw : 14;

  let daysUntilDue: number | null = null;
  if (nextDue) {
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
    const due = new Date(nextDue + "T00:00:00Z").getTime();
    if (Number.isFinite(due)) {
      daysUntilDue = Math.round((due - today) / 86_400_000);
    }
  }

  let filing_status: TaxFilingStatus;
  if (summary.balance_due <= 0) {
    filing_status = "current";
  } else if (!nextDue || daysUntilDue === null) {
    filing_status = "no_schedule";
  } else if (daysUntilDue < 0) {
    filing_status = "overdue";
  } else if (daysUntilDue <= reminderDays) {
    filing_status = "due_soon";
  } else {
    filing_status = "ok";
  }

  return {
    ...summary,
    filing_frequency: frequency,
    next_filing_due_date: nextDue,
    reminder_days: reminderDays,
    days_until_due: daysUntilDue,
    filing_status,
  };
}
