-- Migration 010: Vendor subsystem (ADR-076)
-- Normalized vendor/supplier records with FK on purchases and receipts.

CREATE TABLE IF NOT EXISTS vendors (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  name                    TEXT    NOT NULL UNIQUE,
  address_1               TEXT,
  address_2               TEXT,
  city                    TEXT,
  state                   TEXT,
  postal_code             TEXT,
  country                 TEXT    DEFAULT 'US',
  contact_person          TEXT,
  email                   TEXT,
  phone                   TEXT,
  website                 TEXT,
  account_number          TEXT,
  payment_terms           TEXT,
  tax_id                  TEXT,
  is_preferred            INTEGER NOT NULL DEFAULT 0,
  vendor_category         TEXT,
  default_shipping_method TEXT,
  notes                   TEXT,
  is_active               INTEGER NOT NULL DEFAULT 1,
  created_at              TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Backfill vendors from existing purchases and receipts
INSERT OR IGNORE INTO vendors (name, created_at, updated_at)
SELECT DISTINCT vendor_name, datetime('now'), datetime('now')
FROM purchases
WHERE vendor_name IS NOT NULL AND vendor_name != ''
UNION
SELECT DISTINCT vendor_name, datetime('now'), datetime('now')
FROM receipts
WHERE vendor_name IS NOT NULL AND vendor_name != '';

-- Add vendor_id FK columns (SQLite ALTER TABLE cannot add FK constraints inline,
-- but the column references are enforced by PRAGMA foreign_keys = ON at runtime)
ALTER TABLE purchases ADD COLUMN vendor_id INTEGER REFERENCES vendors(id);
ALTER TABLE receipts  ADD COLUMN vendor_id INTEGER REFERENCES vendors(id);

-- Backfill vendor_id on existing rows
UPDATE purchases SET vendor_id = (
  SELECT id FROM vendors WHERE vendors.name = purchases.vendor_name
) WHERE vendor_name IS NOT NULL AND vendor_name != '';

UPDATE receipts SET vendor_id = (
  SELECT id FROM vendors WHERE vendors.name = receipts.vendor_name
) WHERE vendor_name IS NOT NULL AND vendor_name != '';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_purchases_vendor_id ON purchases(vendor_id);
CREATE INDEX IF NOT EXISTS idx_receipts_vendor_id  ON receipts(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendors_name        ON vendors(name);
CREATE INDEX IF NOT EXISTS idx_vendors_is_active   ON vendors(is_active);
