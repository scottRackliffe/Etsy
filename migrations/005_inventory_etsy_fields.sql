-- Migration 005: Add Etsy per-item fields, expanded photos (11-20), video, materials,
-- dimensions, weight, photo classifications to inventory table.
-- Per ADR-017 §1a-1c (2026-06-10).

ALTER TABLE inventory ADD COLUMN picture_11 TEXT;
ALTER TABLE inventory ADD COLUMN picture_12 TEXT;
ALTER TABLE inventory ADD COLUMN picture_13 TEXT;
ALTER TABLE inventory ADD COLUMN picture_14 TEXT;
ALTER TABLE inventory ADD COLUMN picture_15 TEXT;
ALTER TABLE inventory ADD COLUMN picture_16 TEXT;
ALTER TABLE inventory ADD COLUMN picture_17 TEXT;
ALTER TABLE inventory ADD COLUMN picture_18 TEXT;
ALTER TABLE inventory ADD COLUMN picture_19 TEXT;
ALTER TABLE inventory ADD COLUMN picture_20 TEXT;
ALTER TABLE inventory ADD COLUMN video_path TEXT;
ALTER TABLE inventory ADD COLUMN etsy_when_made TEXT;
ALTER TABLE inventory ADD COLUMN etsy_taxonomy_id INTEGER;
ALTER TABLE inventory ADD COLUMN etsy_who_made TEXT;
ALTER TABLE inventory ADD COLUMN etsy_shipping_profile_id INTEGER;
ALTER TABLE inventory ADD COLUMN etsy_return_policy_id INTEGER;
ALTER TABLE inventory ADD COLUMN materials TEXT;
ALTER TABLE inventory ADD COLUMN item_weight REAL;
ALTER TABLE inventory ADD COLUMN item_weight_unit TEXT;
ALTER TABLE inventory ADD COLUMN item_length REAL;
ALTER TABLE inventory ADD COLUMN item_width REAL;
ALTER TABLE inventory ADD COLUMN item_height REAL;
ALTER TABLE inventory ADD COLUMN item_dimensions_unit TEXT;
ALTER TABLE inventory ADD COLUMN is_supply INTEGER DEFAULT 0;
ALTER TABLE inventory ADD COLUMN picture_classifications TEXT;
