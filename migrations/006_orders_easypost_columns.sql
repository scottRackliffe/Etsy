-- Migration 006: Add EasyPost shipping columns to orders table.
-- Per ADR-074 (2026-06-11).

ALTER TABLE orders ADD COLUMN easypost_shipment_id TEXT;
ALTER TABLE orders ADD COLUMN label_url TEXT;
ALTER TABLE orders ADD COLUMN label_format TEXT;
ALTER TABLE orders ADD COLUMN shipping_rate_cents INTEGER;
ALTER TABLE orders ADD COLUMN shipping_carrier_service TEXT;
