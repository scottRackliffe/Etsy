-- Migration 002: Schema reconciliation
-- Aligns the implemented schema with ADR-017 canonical requirements.
-- Keeps the existing three-table model (orders + order_items + purchases)
-- and adds missing columns needed by ADR-019/020/021/025.
--
-- All ALTER TABLE ADD COLUMN statements are safe: SQLite ignores them
-- if the column already exists (wrapped in runtime checks in sqlite.ts).

PRAGMA foreign_keys = ON;

-- ============================================================
-- 1. orders: add ADR-017/019/020/021 columns
-- ============================================================

ALTER TABLE orders ADD COLUMN was_paid INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN shipper TEXT;
ALTER TABLE orders ADD COLUMN seller_shipping_cost REAL;
ALTER TABLE orders ADD COLUMN shipped_without_paid_override INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN etsy_receipt_id TEXT;
ALTER TABLE orders ADD COLUMN shipping_date TEXT;
ALTER TABLE orders ADD COLUMN ship_to_first_name TEXT;
ALTER TABLE orders ADD COLUMN ship_to_last_name TEXT;
ALTER TABLE orders ADD COLUMN ship_to_address_line_1 TEXT;
ALTER TABLE orders ADD COLUMN ship_to_address_line_2 TEXT;
ALTER TABLE orders ADD COLUMN ship_to_city TEXT;
ALTER TABLE orders ADD COLUMN ship_to_state_province TEXT;
ALTER TABLE orders ADD COLUMN ship_to_country TEXT;
ALTER TABLE orders ADD COLUMN ship_to_postal_code TEXT;

-- ============================================================
-- 2. customers: add ADR-017 columns
-- ============================================================

ALTER TABLE customers ADD COLUMN default_address_id INTEGER REFERENCES addresses(id);
ALTER TABLE customers ADD COLUMN currency_code TEXT DEFAULT 'USD';
ALTER TABLE customers ADD COLUMN is_active INTEGER DEFAULT 1;

-- ============================================================
-- 3. Backfill was_paid from payment_status
-- ============================================================

UPDATE orders SET was_paid = 1 WHERE LOWER(payment_status) IN ('paid', 'complete', 'completed');
UPDATE orders SET was_paid = 0 WHERE was_paid IS NULL;

-- ============================================================
-- 4. Backfill default_address_id from addresses.is_default
-- ============================================================

UPDATE customers SET default_address_id = (
  SELECT a.id FROM addresses a
  WHERE a.customer_id = customers.id AND a.is_default = 1
  LIMIT 1
) WHERE default_address_id IS NULL;

-- ============================================================
-- 5. New indexes for query performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_orders_etsy_receipt_id ON orders(etsy_receipt_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_orders_was_paid ON orders(was_paid);
CREATE INDEX IF NOT EXISTS idx_orders_shipping_date ON orders(shipping_date);
CREATE INDEX IF NOT EXISTS idx_inventory_date_of_sale ON inventory(date_of_sale);
CREATE INDEX IF NOT EXISTS idx_inventory_date_listed ON inventory(date_listed);
CREATE INDEX IF NOT EXISTS idx_customers_is_active ON customers(is_active);

-- ============================================================
-- 6. Schema migrations tracking table
-- ============================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO schema_migrations(version) VALUES ('002_schema_reconciliation');
