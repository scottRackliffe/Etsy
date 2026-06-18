-- Migration 012: AP Lite — bill payments tracking + business_expenses enhancements
-- Adds bill_payments table for tracking payments against bills/invoices.
-- Adds payment_status, due_date, period_from, period_to to business_expenses.
-- Migrates existing tax_payments into business_expenses + bill_payments.

-- 1. New columns on business_expenses
ALTER TABLE business_expenses ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid';
ALTER TABLE business_expenses ADD COLUMN due_date TEXT;
ALTER TABLE business_expenses ADD COLUMN period_from TEXT;
ALTER TABLE business_expenses ADD COLUMN period_to TEXT;

-- Mark existing expenses with date_paid as 'paid'
UPDATE business_expenses SET payment_status = 'paid' WHERE date_paid IS NOT NULL AND date_paid != '';

-- 2. Bill payments table
CREATE TABLE IF NOT EXISTS bill_payments (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id       INTEGER NOT NULL REFERENCES business_expenses(id) ON DELETE CASCADE,
  payment_date     TEXT    NOT NULL,
  amount           REAL    NOT NULL,
  payment_method   TEXT,
  reference_number TEXT,
  notes            TEXT,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bill_payments_expense_id ON bill_payments(expense_id);

-- 3. Migrate tax_payments → business_expenses + bill_payments
INSERT INTO business_expenses (
  expense_date, amount, vendor_name, category, subcategory,
  notes, payment_status, date_paid, period_from, period_to,
  tax_deductible, created_at, updated_at
)
SELECT
  payment_date, amount, payee, 'Tax Remittance', reason,
  CASE
    WHEN reference_number IS NOT NULL AND notes IS NOT NULL THEN 'Ref: ' || reference_number || char(10) || notes
    WHEN reference_number IS NOT NULL THEN 'Ref: ' || reference_number
    ELSE notes
  END,
  'paid', payment_date, period_from, period_to,
  0, created_at, created_at
FROM tax_payments;

-- Create bill_payment records for migrated tax payments
INSERT INTO bill_payments (expense_id, payment_date, amount, reference_number, created_at)
SELECT be.id, be.expense_date, be.amount, tp.reference_number, be.created_at
FROM business_expenses be
JOIN tax_payments tp ON tp.payment_date = be.expense_date
  AND tp.amount = be.amount
  AND be.category = 'Tax Remittance'
  AND (tp.payee IS NULL AND be.vendor_name IS NULL OR tp.payee = be.vendor_name);
