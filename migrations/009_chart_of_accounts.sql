-- Migration 009: Chart of Accounts and GL Transaction Rules (ADR-056)

CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  acct_number    TEXT    NOT NULL UNIQUE,
  account_name   TEXT    NOT NULL,
  account_type   TEXT    NOT NULL,
  normal_balance TEXT    NOT NULL,
  description    TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gl_transaction_rules (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_type TEXT    NOT NULL,
  description      TEXT,
  debit_acct       TEXT    NOT NULL,
  credit_acct      TEXT    NOT NULL,
  source_table     TEXT,
  source_column    TEXT,
  is_active        INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Seed: Chart of Accounts
INSERT OR IGNORE INTO chart_of_accounts (acct_number, account_name, account_type, normal_balance, description) VALUES
  ('1000', 'Cash',                       'Asset',          'debit',  'Cash on hand and in bank'),
  ('1100', 'Accounts Receivable',        'Asset',          'debit',  'Money owed by customers for sales'),
  ('1300', 'Inventory',                  'Asset',          'debit',  'Merchandise held for resale'),
  ('2100', 'Sales Tax Payable',          'Liability',      'credit', 'Tax collected, owed to state/local authority'),
  ('4000', 'Sales Revenue',              'Revenue',        'credit', 'Income from sale of merchandise'),
  ('4100', 'Shipping Income',            'Revenue',        'credit', 'Shipping charges collected from customers'),
  ('4800', 'Sales Returns & Allowances', 'Contra-Revenue', 'debit',  'Returns and allowances reducing gross revenue'),
  ('4900', 'Sales Discounts',            'Contra-Revenue', 'debit',  'Discounts given to customers (contra-income)'),
  ('5000', 'Cost of Goods Sold',         'COGS',           'debit',  'Cost of merchandise sold'),
  ('6100', 'Shipping Expense',           'Expense',        'debit',  'Seller-paid shipping costs to carriers'),
  ('6200', 'Operating Expenses',         'Expense',        'debit',  'Packaging, supplies, and other operating costs');

-- Seed: GL Transaction Rules
INSERT OR IGNORE INTO gl_transaction_rules (transaction_type, description, debit_acct, credit_acct, source_table, source_column) VALUES
  ('Sale',               'Sale recorded — AR increases, revenue recognized',     '1100', '4000', 'order_items',   'line_total'),
  ('COGS',               'Cost of sale — COGS recognized, inventory reduced',    '5000', '1300', 'inventory',     'purchase_cost'),
  ('Payment',            'Payment received — cash in, AR cleared',               '1000', '1100', 'orders',        'grand_total'),
  ('Discount',           'Discount given — contra-income, AR reduced',           '4900', '1100', 'orders',        'discount_total'),
  ('Shipping Revenue',   'Shipping charged to customer',                         '1100', '4100', 'orders',        'shipping_total'),
  ('Shipping Expense',   'Seller pays carrier for shipping',                     '6100', '1000', 'orders',        'seller_shipping_cost'),
  ('Tax Collected',      'Tax collected from customer — AR up, liability up',    '1100', '2100', 'orders',        'tax_total'),
  ('Tax Remittance',     'Tax paid to state — liability cleared, cash out',      '2100', '1000', 'tax_payments',  'amount'),
  ('Refund — Revenue',   'Refund issued — contra-revenue, cash returned',        '4800', '1000', 'orders',        'subtotal'),
  ('Refund — Tax',       'Refund tax portion — liability reversed, cash out',    '2100', '1000', 'orders',        'tax_total'),
  ('Refund — Inventory', 'Item returned to stock — inventory up, COGS reversed', '1300', '5000', 'inventory',     'purchase_cost'),
  ('Purchase',           'Buy inventory item for resale',                        '1300', '1000', 'purchases',     'purchase_price'),
  ('Purchase Shipping',  'Shipping cost to acquire inventory',                   '1300', '1000', 'purchases',     'shipping_price'),
  ('Other Cost',         'Operating expense (packaging, supplies, etc.)',        '6200', '1000', 'other_costs',   'amount');
