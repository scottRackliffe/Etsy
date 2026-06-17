-- Add discount_reason to orders for tracking why a discount was given
ALTER TABLE orders ADD COLUMN discount_reason TEXT;
