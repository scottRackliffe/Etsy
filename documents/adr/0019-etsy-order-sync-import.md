# ADR-019: Etsy order sync / import — when and how Etsy receipts become local data

## Status

Accepted

## Date

2025-02-15 (Decision aligned 2026-05-24)

## Context

The app can fetch Etsy receipts via the API (ADR-007). When the user triggers “Sync from Etsy,” we must define exactly how those receipts become local rows (`customers`, `addresses`, `orders`, `order_items`) so there is no ambiguity. This covers: which receipts are imported, how we avoid duplicates, how we create or match customers and addresses, and how we create orders and line items linked to Etsy.

## Decision

> **Terminology (2026-05-24):** One Etsy receipt → one `orders` row + one `order_items` row per Etsy line item. Vendor buys use `purchases` only. Canonical DDL: ADR-017.

**Trigger:** (1) **Manual:** User runs “Sync from Etsy” (Sales or Config). App calls `POST /api/sync/etsy` with optional `shop_id`. (2) **On startup:** When authenticated with Etsy, run the same sync once per session start (optional per ADR-057). Sync only when valid OAuth session exists (ADR-025).

**Last sync date:** After every successful sync, update setting `last_etsy_sync_at` (ADR-017) to current datetime (ISO 8601). Display in UI (Dashboard, Sales, or Config).

**Scope:** One shop per sync. If `shop_id` omitted, use last selected shop from settings/session or first shop in list.

**Steps (exact order):**

1. **Fetch receipts** from Etsy for the chosen shop (same API as `GET /api/receipts`), `limit=200` default. If more exist, import the most recent 200 per run; older receipts in later runs. Use ADR-025 token handling.

2. **For each receipt:**
   - **Skip if already imported:** If any `orders` row has `etsy_receipt_id` = this receipt’s id, skip entirely (idempotent).
   - **Resolve or create customer:**
     - **Match by email:** If buyer email present, lookup `customers` by email (case-insensitive). Use `customers.id` if found.
     - **Else create:** Insert `customers` with `first_name` / `last_name` from buyer name (first token = first_name, remainder = last_name; if no space, all in first_name), `email` from receipt when present.
   - **Resolve or create ship-to address (optional convenience row):**
     - Compare receipt ship-to to existing `addresses` for this `customer_id` (`first_line`, `city`, `postal_code`, `country` — normalize whitespace/case). If match, keep id for reference only.
     - Else insert `addresses` with `first_line`, `second_line`, `city`, `state`, `postal_code`, `country` from Etsy; `label` null or `"Etsy import"`.
     - **Snapshot:** Copy ship-to onto the new `orders` row (`ship_to_*` columns). Invoices/history use snapshot, not live address rows (ADR-003).
   - **Create `orders` header for this receipt:**
     - `order_number` = Etsy `receipt_id` (string)
     - `etsy_receipt_id` = receipt id (dedup key)
     - `customer_id` = resolved customer
     - `order_date` = receipt creation date (`YYYY-MM-DD`)
     - `order_status` = `'active'`
     - `source_channel` = `'etsy'`
     - `was_paid` = 1 if Etsy `was_paid` true, else 0
     - `payment_status` = `'paid'` or `'unpaid'` consistent with `was_paid`
     - Ship-to snapshot fields from receipt
     - Totals from receipt when available: `subtotal`, `shipping_total`, `tax_total`, `discount_total`, `grand_total` (map from Etsy fields)
     - `shipper`, `seller_shipping_cost`, `shipping_date`, `tracking_number` = null initially (user fills on mark shipped)
     - `notes` = null or `"Synced from Etsy"`
   - **Create `order_items` (one per Etsy line item):**
     - `order_id` = new order id
     - `inventory_id` = resolve by Etsy `listing_id`: exact match on `inventory.etsy_listing_id`. If multiple matches, first by `id ASC`. If none: **create placeholder inventory** (required — `inventory_id` NOT NULL):
       - `item_number` = `"etsy-" + listing_id`
       - `description` = listing title from API or `"Imported from Etsy (listing_id …)"`
       - `status` = `"Listed"`, `quantity` = 1, `is_listed` = 1, `etsy_listing_id` = listing_id, other fields null
     - `quantity` = from Etsy line or 1
     - `unit_price` / `line_total` = from Etsy line price when provided; else derive from inventory `sale_revenue` or leave for user
     - Update linked `inventory.sale_revenue` from line price when Etsy provides it (do not split receipt total across lines artificially)

3. **Idempotency:** Existing `orders.etsy_receipt_id` → skip receipt. **No update** of existing orders on re-sync; local DB is system of record after import. User edits locally for Etsy status changes.

4. **Response:** Summary per ADR-018, e.g. `{ synced, created_orders, created_order_items?, skipped?, errors? }`. Count `created_orders` = new `orders` rows; line items counted separately if exposed.

**Edge cases (no ambiguity):**

- **Receipt with no line items:** Skip; do not create customer/order.
- **Same buyer, multiple receipts:** Each receipt → separate `orders` row; reuse customer/address when matched.
- **Token expired during sync:** ADR-025 refresh; on revoked token abort with 401 `ETSY_TOKEN_REVOKED`.
- **Placeholder inventory:** Defaults as in schema mapping Notes; editable; appears in pick list (ADR-015).
- **Partial failure:** Process sequentially; on failure log `receipt_id`, append to `skipped`, continue. Success if ≥1 receipt imported; total failure only if zero processed (500).
- **Pagination:** If Etsy `has_more`, fetch up to 5 pages or 1000 receipts per run; stop early if remaining pages are all already synced.
- **Duplicate buyer:** Email match case-insensitive; if no email, name match `LOWER(first_name)+LOWER(last_name)`; else new customer.
- **Concurrent sync:** `sync_in_progress` in `settings`; second request → 409 “A sync is already in progress.”

## Consequences

- **Positive:** Unambiguous sync; no duplicate orders; every `order_items` row has valid `inventory_id` (placeholder when needed).
- **Negative:** Placeholder inventory may accumulate; UI should support relink/merge (Inventory/Sales flows).

## Notes

- Map Etsy Open API v3 receipt/transaction fields to this schema; field names in steps above are logical names.
- Thumbnail for placeholder: `thumbnail_path` null; placeholder icon in pick list (ADR-015).
- Scheduled auto-sync: ADR-057.

### Schema mapping (legacy terms)

| Legacy / ADR-019 shorthand  | Canonical (ADR-017)                             |
| --------------------------- | ----------------------------------------------- |
| purchase row                | `orders` + `order_items`                        |
| customer / customer_address | `customers` / `addresses`                       |
| purchase.etsy_receipt_id    | `orders.etsy_receipt_id`                        |
| purchase.order_id           | `orders.order_number`                           |
| date_of_purchase            | `orders.order_date`                             |
| purchase.was_paid           | `orders.was_paid`                               |
| customer_address_id on sale | `orders.ship_to_*` snapshot (no FK required v1) |
