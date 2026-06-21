-- Migration 016: AI dimension annotation (ADR-084 / WS-H2).
-- Retains the confirmed dimensions + source ruler photo reference so the
-- measurement overlay can be re-rendered. Mirrored in src/lib/sqlite.ts.

ALTER TABLE inventory ADD COLUMN dimension_annotation_json TEXT;
