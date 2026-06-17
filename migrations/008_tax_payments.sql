CREATE TABLE IF NOT EXISTS tax_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_date TEXT NOT NULL,
  amount REAL NOT NULL,
  payee TEXT,
  reason TEXT,
  period_from TEXT,
  period_to TEXT,
  reference_number TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
