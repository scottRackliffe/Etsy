# Schema reconciliation — ADR-017 canonical vs. implemented

This document identifies differences between the **canonical schema** (ADR-017) and what is actually implemented in `migrations/001_initial_schema.sql` and `src/lib/sqlite.ts`. These differences must be resolved before building out the remaining features.

---

## Summary

The canonical schema in ADR-017 uses a **`purchase`** table with ship-to snapshots, `was_paid`, `order_status`, `shipped_without_paid_override`, and order grouping by `order_id`. The implemented schema uses separate **`orders`**, **`order_items`**, **`purchases`**, and **`customers`** tables with different column sets and no ship-to snapshot.

**Action required:** Create a new migration (`002_schema_reconciliation.sql`) that aligns the implemented schema with ADR-017. The migration must be additive (ALTER TABLE ADD COLUMN) where possible, with data migration for restructured tables.

---

## Table-by-table comparison

### 1. `inventory`

| ADR-017 column | Implemented? | Notes |
|----------------|-------------|-------|
| `item_number` | Yes, but NOT NULL UNIQUE in ADR-017 vs. TEXT UNIQUE (nullable) in migration | **Fix:** Add NOT NULL constraint (requires backfilling any NULL values) |
| `listing_category_path` | Yes (in sqlite.ts runtime) | Not in ADR-017 canonical DDL but used in listing workflow |
| `listing_title_strategy` | Yes (in sqlite.ts runtime) | ADR-023 field; add to ADR-017 |
| `listing_product_story` | Yes (in sqlite.ts runtime) | ADR-023 field; add to ADR-017 |
| `listing_condition_clarity` | Yes (in sqlite.ts runtime) | ADR-023 field; add to ADR-017 |
| `listing_attributes` | Yes (in sqlite.ts runtime) | ADR-023 field; add to ADR-017 |
| `listing_pricing_shipping_notes` | Yes (in sqlite.ts runtime) | ADR-023 field; add to ADR-017 |
| `listing_quality_checklist` | Yes (in sqlite.ts runtime) | ADR-023 field; add to ADR-017 |
| `listing_draft_state` | Yes (in sqlite.ts runtime) | ADR-023 field; add to ADR-017 |
| `listing_draft_source` | Yes (in sqlite.ts runtime) | ADR-023 field; add to ADR-017 |
| `listing_export_id` | Yes (in sqlite.ts runtime) | ADR-023 field; add to ADR-017 |
| `listing_approved_at` | Yes (in sqlite.ts runtime) | ADR-023 field; add to ADR-017 |
| `listing_published_at` | Yes (in sqlite.ts runtime) | ADR-023 field; add to ADR-017 |

**ADR-017 update needed:** Add all `listing_*` columns from ADR-023 to the canonical DDL.

### 2. `customer` vs. `customers`

| ADR-017 | Implemented | Difference |
|---------|------------|------------|
| Table name: `customer` | Table name: `customers` | **Name mismatch** |
| Has `default_address_id` FK | Not implemented | **Missing column** |
| Has `currency_code` | Not implemented | **Missing column** |
| Has `is_active` | Not implemented | **Missing column** |
| No `phone` column | Has `phone` | Extra column in implementation |
| No `address_1/2`, `city`, `state`, `postal_code`, `country` | Has inline address fields | ADR-017 uses separate `customer_address` table; implementation has both inline and separate `addresses` table |

**Decision:** The canonical model (separate `customer_address` table) is correct for multi-address support. The inline address fields on `customers` should be deprecated. Migration adds `default_address_id`, `currency_code`, `is_active` columns.

### 3. `customer_address` vs. `addresses`

| ADR-017 | Implemented | Difference |
|---------|------------|------------|
| Table name: `customer_address` | Table name: `addresses` | **Name mismatch** |
| Column: `address_line_1` | Column: `first_line` | **Column name mismatch** |
| Column: `address_line_2` | Column: `second_line` | **Column name mismatch** |
| Column: `state_province` | Column: `state` | **Column name mismatch** |
| No `is_default` column | Has `is_default` | Extra column (functionally replaced by `customer.default_address_id`) |

### 4. `purchase` vs. `purchases` + `orders` + `order_items`

This is the **largest drift**. ADR-017 has a single `purchase` table that handles what the implementation splits into three tables.

| ADR-017 `purchase` | Implemented equivalent | Notes |
|---------------------|----------------------|-------|
| `order_id` (groups rows) | `orders.id` + `order_items` | ADR-017 uses text order_id; implementation uses numeric orders.id |
| `customer_id` | `orders.customer_id` | On order header, not per-item |
| `inventory_id` | `order_items.inventory_id` | Per-item via junction table |
| `ship_to_*` (8 snapshot columns) | Not implemented | **Missing** — no ship-to snapshot |
| `was_paid` | Not on any table | **Missing** — `orders.payment_status` used instead (text, not boolean) |
| `order_status` (active/void/cancelled) | `orders.order_status` | Similar but text-based |
| `shipper` | Not on any table | **Missing** |
| `shipping_cost` (seller cost) | Not on any table | **Missing** (orders.shipping_total is different — that's buyer-facing) |
| `shipped_without_paid_override` | Not on any table | **Missing** |
| `etsy_receipt_id` | Not on any table | **Missing** |
| `discount_amount` | `orders.discount_total` | Different granularity (order-level vs. per-item) |

**Decision:** The implemented three-table structure (orders + order_items + purchases) provides a different but functional model. Two options:

- **Option A (align to ADR-017):** Replace with the single `purchase` table. This is a breaking restructure.
- **Option B (update ADR-017):** Update the canonical schema to reflect the three-table model, adding the missing columns (`ship_to_*` snapshots on `orders`, `was_paid` on `orders`, `shipper` and `shipping_cost` on `orders`, `etsy_receipt_id` on `orders`, `shipped_without_paid_override` on `orders`).

**Recommended: Option B.** The three-table model is already implemented and functional. Update ADR-017 to match, and add the missing columns via migration.

### 5. Other tables

| ADR-017 table | Implemented table | Status |
|---------------|------------------|--------|
| `inventory_other_cost` | `other_costs` | **Name mismatch**; column `description` (ADR-017) vs. `cost_type` + `note` (impl) |
| `settings` | `settings` | Match; ADR-017 has no `updated_at`, implementation does — keep `updated_at` |
| — | `etsy_receipts` | **Extra table** in implementation (raw receipt JSON cache); not in ADR-017 but useful — add to ADR-017 |
| — | `report_artifacts` | **Extra table** in implementation; add to ADR-017 |
| — | `listing_exports` | **Extra table** in implementation (ADR-023 audit); add to ADR-017 |
| — | `listing_imports` | **Extra table** in implementation (ADR-023 audit); add to ADR-017 |
| — | `listing_publish_previews` | **Extra table** in implementation (ADR-023 audit); add to ADR-017 |

---

## Migration plan

### Migration `002_schema_reconciliation.sql`

```sql
-- Add missing columns to orders
ALTER TABLE orders ADD COLUMN was_paid INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN shipper TEXT;
ALTER TABLE orders ADD COLUMN seller_shipping_cost REAL;
ALTER TABLE orders ADD COLUMN shipped_without_paid_override INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN etsy_receipt_id TEXT;
ALTER TABLE orders ADD COLUMN ship_to_first_name TEXT;
ALTER TABLE orders ADD COLUMN ship_to_last_name TEXT;
ALTER TABLE orders ADD COLUMN ship_to_address_line_1 TEXT;
ALTER TABLE orders ADD COLUMN ship_to_address_line_2 TEXT;
ALTER TABLE orders ADD COLUMN ship_to_city TEXT;
ALTER TABLE orders ADD COLUMN ship_to_state_province TEXT;
ALTER TABLE orders ADD COLUMN ship_to_country TEXT;
ALTER TABLE orders ADD COLUMN ship_to_postal_code TEXT;
ALTER TABLE orders ADD COLUMN shipping_date TEXT;

-- Add missing columns to customers
ALTER TABLE customers ADD COLUMN default_address_id INTEGER REFERENCES addresses(id);
ALTER TABLE customers ADD COLUMN currency_code TEXT DEFAULT 'USD';
ALTER TABLE customers ADD COLUMN is_active INTEGER DEFAULT 1;

-- Add listing columns to inventory (if not already present via runtime bootstrap)
ALTER TABLE inventory ADD COLUMN listing_category_path TEXT;
ALTER TABLE inventory ADD COLUMN listing_title_strategy TEXT;
ALTER TABLE inventory ADD COLUMN listing_product_story TEXT;
ALTER TABLE inventory ADD COLUMN listing_condition_clarity TEXT;
ALTER TABLE inventory ADD COLUMN listing_attributes TEXT;
ALTER TABLE inventory ADD COLUMN listing_pricing_shipping_notes TEXT;
ALTER TABLE inventory ADD COLUMN listing_quality_checklist TEXT;
ALTER TABLE inventory ADD COLUMN listing_draft_state TEXT;
ALTER TABLE inventory ADD COLUMN listing_draft_source TEXT;
ALTER TABLE inventory ADD COLUMN listing_export_id TEXT;
ALTER TABLE inventory ADD COLUMN listing_approved_at TEXT;
ALTER TABLE inventory ADD COLUMN listing_published_at TEXT;

-- Backfill was_paid from payment_status
UPDATE orders SET was_paid = 1 WHERE LOWER(payment_status) IN ('paid', 'complete');
UPDATE orders SET was_paid = 0 WHERE was_paid IS NULL;

-- Index for etsy_receipt_id on orders
CREATE INDEX IF NOT EXISTS idx_orders_etsy_receipt_id ON orders(etsy_receipt_id);
```

**Note:** Each `ALTER TABLE ADD COLUMN` is safe in SQLite (no-op if column already exists when wrapped in runtime checks). The `sqlite.ts` runtime bootstrap already handles some of these via `ensureInventorySchema()`.

---

## ADR-017 update needed

After migration, update ADR-017 to:

1. Use the three-table model (`orders`, `order_items`, `purchases` for vendor sourcing) instead of the single `purchase` table.
2. Add all `listing_*` columns from ADR-023 to the `inventory` table definition.
3. Add `etsy_receipts`, `report_artifacts`, `listing_exports`, `listing_imports`, `listing_publish_previews` tables.
4. Add `default_address_id`, `currency_code`, `is_active` to `customers`.
5. Add ship-to snapshot columns, `was_paid`, `shipper`, `seller_shipping_cost`, `shipped_without_paid_override`, `etsy_receipt_id`, `shipping_date` to `orders`.
6. Document the table/column name mapping (ADR-017 name → implemented name) for any names that differ.

---

_This document is a one-time reconciliation guide. After the migration and ADR-017 update are complete, this document should be archived and ADR-017 becomes the sole schema SSOT again._
