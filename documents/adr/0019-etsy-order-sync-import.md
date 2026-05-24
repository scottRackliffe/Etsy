# ADR-019: Etsy order sync / import — when and how Etsy receipts become local data

## Status

Accepted

## Date

2025-02-15

## Context

The app can fetch Etsy receipts via the API (ADR-007). When the user triggers “Sync from Etsy,” we must define exactly how those receipts become rows in the local database (customer, customer_address, purchase) so there is no ambiguity. This covers: which receipts are imported, how we avoid duplicates, how we create or match customers and addresses, and how we create purchase rows and link to Etsy.

## Decision

**Trigger:** (1) **Manual:** The user runs “Sync from Etsy” (Sales tab or Config). The app calls the sync endpoint (e.g. POST /api/sync/etsy) with optional shop_id. (2) **On startup:** When the system starts (app load / user session start), the app runs a full Etsy sync (same logic as manual) once when the user is authenticated with Etsy. Sync runs only when the user is authenticated with valid SQLite-backed auth/session token state.

**Last sync date:** After every successful sync (startup or manual), update the setting `last_etsy_sync_at` (ADR-017) with the current datetime (ISO 8601). Display it in the UI (e.g. "Last synced: 15 Feb 2025, 10:30 AM" on Dashboard, Sales, or Config).

**Scope:** One shop per sync. If no shop_id is provided, use the shop the user last selected (e.g. from settings or session) or the first shop in the list.

**Steps (exact order):**

1. **Fetch receipts from Etsy** for the chosen shop (same API as GET /api/receipts), with `limit=200` by default (configurable). If more receipts exist, import the most recent 200 in that run; older receipts are imported in subsequent sync runs. Use the same Etsy API client and token as the dashboard.

2. **For each receipt in the response:**
   - **Skip if already imported:** If any row in `purchase` has `etsy_receipt_id` equal to this receipt’s id (Etsy receipt_id), skip this receipt entirely (no duplicate orders).
   - **Resolve or create customer:**
     - **Match by email:** If the receipt has a buyer email, look up `customer` by that email (exact match, case-insensitive). If found, use that customer_id.
     - **Else create customer:** Create a new row in `customer` with first_name and last_name from the receipt buyer name (split on first space: first token = first_name, rest = last_name; if no space, put all in first_name), and email from receipt if present. Use the new customer_id.
   - **Resolve or create ship-to address:**
     - Receipt has ship-to name and address (first_line, second_line, city, state, zip, country). Look for an existing `customer_address` for this customer_id with same address_line_1, city, postal_code, country (normalize whitespace and case for comparison). If found, use that customer_address_id.
     - Else create a new row in `customer_address` for this customer_id with: address_line_1 = first_line, address_line_2 = second_line, city, state_province = state, country, postal_code = zip; label = null or “Etsy import”. Use the new id.
   - **Create purchase row(s) for this receipt:**
     - **order_id:** Set to the Etsy receipt_id (as string) for all rows created for this receipt.
     - **One row per line item:** Etsy receipts can have multiple listings (line items). Create one `purchase` row per line item with:
       - order_id = receipt_id (string)
       - customer_id = (resolved above)
       - customer_address_id = (resolved above)
       - inventory_id = **resolve by Etsy listing_id:** Look up `inventory` where `etsy_listing_id` equals this line’s Etsy listing_id. If found, use that inventory_id. If not found, setting inventory_id to NULL is not allowed per schema (ADR-017). **Decision:** Create a single placeholder inventory row per missing Etsy listing_id: description = “Imported from Etsy (listing_id …)” or listing title from Etsy, item_number = “etsy-” + listing_id, status = “Listed”, then use that inventory_id. This preserves referential integrity and allows later cleanup.
     - **Snapshot:** Copy ship-to name and address from the receipt into ship_to_first_name, ship_to_last_name, ship_to_address_line_1, ship_to_address_line_2, ship_to_city, ship_to_state_province, ship_to_country, ship_to_postal_code.
   - **Dates and amounts:** date_of_purchase = receipt creation date (convert from Etsy timestamp to YYYY-MM-DD). shipping_date = null initially. discount_amount = 0 or from Etsy if available. sale_revenue on the linked inventory: set from line item price if we have it (Etsy API); else leave null for user to fill.
   - **was_paid:** Set purchase.was_paid = 1 if the Etsy receipt has was_paid = true; else 0. So synced orders from Etsy that were already marked paid on Etsy appear as paid in the app.
   - **Etsy linkage:** etsy_receipt_id = receipt_id (string). notes = null or “Synced from Etsy”.
   - **Shipper/shipping:** shipper = null, shipping_cost = null (user fills when they mark shipped).
   - **After all line items:** If the receipt has a single “total” and we have multiple line items, we do not split the total across rows; sale_revenue on inventory is set from the line item price when the Etsy API provides it. If Etsy does not provide per-line price, leave sale_revenue null.

3. **Idempotency:** A receipt that was already synced (existing purchase.etsy_receipt_id) is never processed again. No update of existing purchase rows during sync; sync only creates new rows.

4. **Response:** Return a summary, e.g. { synced: number of receipts processed (new), created_orders: number of new order_ids, created_purchases: number of new purchase rows }.

**Edge cases (no ambiguity):**

- **Receipt with no line items:** Skip receipt entirely. Do not create customer or address rows for receipts with zero line items.
- **Same buyer, multiple receipts:** Each receipt gets its own order_id (etsy_receipt_id). Customer and address are reused when matched.
- **Token expired during sync:** Use token refresh middleware (ADR-025) to refresh automatically. If refresh fails (revoked token), abort the sync and return 401 to the client with `ETSY_TOKEN_REVOKED`.
- **Matching rules for `etsy_listing_id`:** Exact string match. The `etsy_listing_id` column on `inventory` is the canonical link. If multiple inventory rows have the same `etsy_listing_id`, use the first match by `id ASC` (oldest). The user should resolve duplicates manually.
- **Placeholder inventory field defaults:** When creating a placeholder inventory row for an unrecognized Etsy listing_id, use: `item_number = "etsy-" + listing_id`, `description = listing title from Etsy API (or "Imported from Etsy (listing_id …)" if title unavailable)`, `status = "Listed"`, `quantity = 1`, `is_listed = 1`, `etsy_listing_id = the Etsy listing_id`, `listing_draft_state = NULL`, all other fields = NULL. The placeholder is editable by the user.
- **Update policy for already-synced receipts:** Receipts that match an existing `purchase.etsy_receipt_id` are skipped entirely. No fields on existing purchase rows are updated during sync. If the user wants updated data from Etsy (e.g. a status change), they must manually edit the local record. Re-sync does not overwrite. This is intentional: the local database is the system of record once data is imported.
- **Partial-failure handling:** Sync processes receipts sequentially. If one receipt fails to import (e.g. database constraint error, unexpected data shape), log the error with receipt_id, skip that receipt, and continue with the next. The response includes a `skipped` array with `{ receipt_id, reason }` for each failed receipt alongside the `synced` count. The sync is successful if at least one receipt was processed; it is a failure only if zero receipts could be processed (return 500 with user-actionable error).
- **Etsy API pagination during sync:** If `has_more` is true in the Etsy response, fetch the next page (up to 5 pages or 1000 receipts per sync run). Stop early if all remaining receipts are already synced (check `etsy_receipt_id` before fetching next page).
- **Duplicate buyer email handling:** Email match is case-insensitive (LOWER comparison). If email is null or empty on the receipt, fall back to name match: LOWER(first_name) + LOWER(last_name). If no name or email match, create a new customer.
- **Concurrent sync protection:** Only one sync may run at a time. The sync endpoint sets a `sync_in_progress` key in `settings` at the start and clears it at the end (in a `finally` block). If a second sync request arrives while one is in progress, return 409 with `user_message`: "A sync is already in progress. Please wait for it to complete."

## Consequences

- **Positive:** Unambiguous sync behavior; no duplicate orders; every purchase row has valid inventory_id (via placeholder when needed).
- **Negative:** Placeholder inventory rows may accumulate; UI should allow user to “link to real item” or merge later (implementation detail in Inventory/Orders flows).

## Notes

- Etsy API receipt/listing shape: use the actual Etsy Open API v3 receipt and transaction/listing structure; field names in this ADR map to that structure (receipt_id, buyer email, ship-to fields, line items with listing_id and price). Implementer must map Etsy response fields to our schema.
- Thumbnail for placeholder inventory: leave thumbnail_path null; pick list shows placeholder icon per ADR-015.
- Placeholder inventory behavior: placeholder rows use `status = 'Listed'` and appear in item pick lists (ADR-015). Users can edit, relink, or merge placeholders with existing inventory records during cleanup.
