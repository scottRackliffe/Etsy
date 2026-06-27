-- 019_drop_dead_schema.sql
-- ADR-087 + audit C2/C12: remove schema left behind by the retired Coach/Workshop
-- (ADR-085). These objects have zero application reads/writes.
--   • inventory.listing_draft_state  — superseded by inventory.listing_phase (C2)
--   • listing_exports / listing_imports / listing_publish_previews — retired
--     portable export/import + PublishPreview (C12)
-- Runs once (recorded in schema_migrations); no re-run idempotency concern.

ALTER TABLE inventory DROP COLUMN listing_draft_state;

DROP TABLE IF EXISTS listing_exports;
DROP TABLE IF EXISTS listing_imports;
DROP TABLE IF EXISTS listing_publish_previews;
