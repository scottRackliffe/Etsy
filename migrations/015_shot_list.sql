-- Migration 015: AI shot-list generation (ADR-083 / WS-H1).
-- Stores the generated, checklist-style shot list per item. Mirrored in
-- src/lib/sqlite.ts (INVENTORY_COLUMNS).

ALTER TABLE inventory ADD COLUMN shot_list_json TEXT;
