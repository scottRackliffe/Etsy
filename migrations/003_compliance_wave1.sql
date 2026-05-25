-- Migration 003: Wave 1 compliance (tracking_number, enum backfill, index)
PRAGMA foreign_keys = ON;

ALTER TABLE orders ADD COLUMN tracking_number TEXT;

UPDATE orders SET order_status = 'active' WHERE LOWER(COALESCE(order_status, '')) IN ('shipped', 'open');
UPDATE orders SET payment_status = 'unpaid'
  WHERE LOWER(COALESCE(payment_status, '')) = 'pending' AND COALESCE(was_paid, 0) = 0;
UPDATE orders SET payment_status = 'paid'
  WHERE LOWER(COALESCE(payment_status, '')) = 'pending' AND COALESCE(was_paid, 0) = 1;

UPDATE inventory SET status = 'Draft' WHERE LOWER(COALESCE(status, '')) = 'draft';
UPDATE inventory SET status = 'Listed' WHERE LOWER(COALESCE(status, '')) = 'listed';
UPDATE inventory SET status = 'Retired' WHERE LOWER(COALESCE(status, '')) = 'archived';

CREATE INDEX IF NOT EXISTS idx_orders_shipper ON orders(shipper);

INSERT OR IGNORE INTO schema_migrations(version) VALUES ('003_compliance_wave1.sql');
