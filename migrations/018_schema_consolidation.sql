-- 018_schema_consolidation.sql
-- ADR-087: make the migrations set the single source of truth.
-- Back-fills the tables/columns/indexes that previously existed ONLY in the
-- sqlite.ts runtime bootstrap (audit C14 divergence). DDL copied verbatim from
-- the live (golden) schema. All statements are idempotent: CREATE ... IF NOT
-- EXISTS no-ops on databases that already have these objects (e.g. ones the old
-- bootstrap built), and ADD COLUMN duplicates are swallowed by the migration
-- runner. After this migration, a migrations-only database equals the golden
-- schema (verified) and the parallel bootstrap can be retired.

-- ── Tables (bootstrap-only) ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_name TEXT NOT NULL,
  purchase_date TEXT,
  receipt_image TEXT,
  shipping_price REAL,
  reference_number TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  vendor_id INTEGER REFERENCES vendors(id)
);

CREATE TABLE IF NOT EXISTS receipt_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  cost REAL,
  inventory_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(receipt_id) REFERENCES receipts(id) ON DELETE CASCADE,
  FOREIGN KEY(inventory_id) REFERENCES inventory(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS api_call_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  status_code INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS connection_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  last_heartbeat TEXT NOT NULL,
  duration_seconds INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS etsy_taxonomy_nodes (
  id INTEGER PRIMARY KEY,
  parent_id INTEGER,
  name TEXT NOT NULL,
  full_path TEXT,
  level INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS etsy_taxonomy_properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  taxonomy_id INTEGER NOT NULL,
  property_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT,
  is_required INTEGER NOT NULL DEFAULT 0,
  supports_attributes INTEGER NOT NULL DEFAULT 0,
  supports_variations INTEGER NOT NULL DEFAULT 0,
  possible_values_json TEXT,
  scales_json TEXT,
  UNIQUE(taxonomy_id, property_id)
);

-- ── Columns (bootstrap-only; ADD COLUMN duplicates are swallowed by runner) ───

ALTER TABLE inventory ADD COLUMN etsy_attributes_json TEXT;
ALTER TABLE inventory ADD COLUMN receipt_description TEXT;
ALTER TABLE inventory ADD COLUMN store_category TEXT;
ALTER TABLE orders ADD COLUMN package_length_in REAL;
ALTER TABLE orders ADD COLUMN package_width_in REAL;
ALTER TABLE orders ADD COLUMN package_height_in REAL;
ALTER TABLE orders ADD COLUMN package_weight_oz REAL;
ALTER TABLE purchases ADD COLUMN receipt_image TEXT;

-- ── Indexes (bootstrap-only) ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_api_call_log_service_month ON api_call_log(service, created_at);
CREATE INDEX IF NOT EXISTS idx_connection_sessions_service ON connection_sessions(service, started_at);
CREATE INDEX IF NOT EXISTS idx_etsy_taxonomy_nodes_parent ON etsy_taxonomy_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_etsy_taxonomy_properties_taxonomy ON etsy_taxonomy_properties(taxonomy_id);
CREATE INDEX IF NOT EXISTS idx_inventory_listing_phase ON inventory(listing_phase);
CREATE INDEX IF NOT EXISTS idx_receipts_vendor_id ON receipts(vendor_id);
