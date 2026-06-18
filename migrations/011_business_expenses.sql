-- Migration 011: Business Expenses table + Equity COA accounts + GL rule

CREATE TABLE IF NOT EXISTS business_expenses (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_date          TEXT    NOT NULL,
  date_paid             TEXT,
  amount                REAL    NOT NULL,
  currency_code         TEXT    NOT NULL DEFAULT 'USD',
  payment_method        TEXT,
  vendor_id             INTEGER REFERENCES vendors(id),
  vendor_name           TEXT,
  category              TEXT    NOT NULL,
  subcategory           TEXT,
  tax_deductible        INTEGER NOT NULL DEFAULT 1,
  tax_category          TEXT,
  business_use_pct      REAL    NOT NULL DEFAULT 100.0,
  is_cogs               INTEGER NOT NULL DEFAULT 0,
  is_asset              INTEGER NOT NULL DEFAULT 0,
  depreciation_years    INTEGER,
  inventory_id          INTEGER REFERENCES inventory(id),
  invoice_number        TEXT,
  receipt_attached      INTEGER NOT NULL DEFAULT 0,
  receipt_path          TEXT,
  paid_by               TEXT,
  is_recurring          INTEGER NOT NULL DEFAULT 0,
  recurring_frequency   TEXT,
  recurring_next_date   TEXT,
  contract_end_date     TEXT,
  gl_account            TEXT,
  fiscal_quarter        TEXT,
  notes                 TEXT,
  created_at            TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_business_expenses_date ON business_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_business_expenses_category ON business_expenses(category);
CREATE INDEX IF NOT EXISTS idx_business_expenses_vendor_id ON business_expenses(vendor_id);

INSERT OR IGNORE INTO chart_of_accounts (acct_number, account_name, account_type, normal_balance, description)
VALUES ('3000', 'Owner''s Equity', 'Equity', 'credit', 'Owner capital contributions');

INSERT OR IGNORE INTO chart_of_accounts (acct_number, account_name, account_type, normal_balance, description)
VALUES ('3200', 'Retained Earnings', 'Equity', 'credit', 'Accumulated net income from prior periods');

INSERT OR IGNORE INTO gl_transaction_rules (transaction_type, description, debit_acct, credit_acct, source_table, source_column)
SELECT 'Business Expense', 'Business overhead expense — debit expense acct, credit cash', '6200', '1000', 'business_expenses', 'amount'
WHERE NOT EXISTS (SELECT 1 FROM gl_transaction_rules WHERE transaction_type = 'Business Expense');
