-- Migration 014: Cache the latest listing quality evaluation (ADR-082 / WS-G2).
-- Stores the most recent listing-quality result JSON for display; invalidated
-- by drift (ADR-081 phase recompute). Mirrored in src/lib/sqlite.ts.

ALTER TABLE inventory ADD COLUMN listing_quality_json TEXT;
