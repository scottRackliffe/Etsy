-- Migration 013: Listing lifecycle & phases (ADR-081 / WS-G1).
-- Adds a stored listing_phase dimension (separate from inventory.status), a
-- drift-detection hash, and a generation timestamp.
-- NOTE: runtime schema is maintained idempotently by src/lib/sqlite.ts
-- (INVENTORY_COLUMNS map). These columns are mirrored there; this file is the
-- documented migration trail consistent with prior migrations.

ALTER TABLE inventory ADD COLUMN listing_phase TEXT;
ALTER TABLE inventory ADD COLUMN listing_source_hash TEXT;
ALTER TABLE inventory ADD COLUMN listing_generated_at TEXT;
