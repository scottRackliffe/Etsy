# ADR-019: Etsy order sync / import — when and how Etsy receipts become local data

## Status

Accepted

## Date

2025-02-15

## Context

The app can fetch Etsy receipts via the API (ADR-007). When the user triggers “Sync from Etsy,” we must define exactly how those receipts become rows in the local database (customer, customer_address, purchase) so there is no ambiguity. This covers: which receipts are imported, how we avoid duplicates, how we create or match customers and addresses, and how we create purchase rows and link to Etsy.

## Decision

**Trigger:** (1) **Manual:** The user runs “Sync from Etsy” (Sales tab or Config). The app calls the sync endpoint (e.g. POST /api/sync/etsy) with optional shop_id. (2) **On startup:** When the system starts (app load / user session start), the app runs a full Etsy sync (same logic as manual) once when the user is authenticated with Etsy. Sync runs only when the user is authenticated with Etsy (token in cookies).

**Last sync date:** After every successful sync (startup or manual), update the setting `last_etsy_sync_at` (ADR-017) with the current datetime (ISO 8601). Display it in the UI (e.g. "Last synced: 15 Feb 2025, 10:30 AM" on Dashboard, Sales, or Config).

**Scope:** One shop per sync. If no shop_id is provided, use the shop the user last selected (e.g. from settings or session) or the first shop in the list.

**Steps (exact order):**

1. **Fetch receipts from Etsy** for the chosen shop (same API as GET /api/receipts), with a sufficient limit (e.g. last 100 or 200). Use the same Etsy API client and token as the dashboard.

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
       - inventory_id = **resolve by Etsy listing_id:** Look up `inventory` where `etsy_listing_id` equals this line’s Etsy listing_id. If found, use that inventory_id. If not found, setting inventory_id to NULL is not allowed per schema (ADR-017)—so we must either (a) create a placeholder inventory row for “unknown item” and use its id, or (b) skip this line item and log it, or (c) require inventory_id NOT NULL to be relaxed for “unlinked” Etsy lines. **Decision:** If no inventory row has matching etsy_listing_id, create a single placeholder inventory row per Etsy listing_id that we don’t have: description = “Imported from Etsy (listing_id …)” or the listing title from Etsy, item_number = “etsy-” + listing_id, status = “Listed”, and use that inventory_id. That way every purchase row has a valid inventory_id and the user can later edit or merge that item.
     - **Snapshot:** Copy ship-to name and address from the receipt into ship_to_first_name, ship_to_last_name, ship_to_address_line_1, ship_to_address_line_2, ship_to_city, ship_to_state_province, ship_to_country, ship_to_postal_code.
    - **Dates and amounts:** date_of_purchase = receipt creation date (convert from Etsy timestamp to YYYY-MM-DD). shipping_date = null initially. discount_amount = 0 or from Etsy if available. sale_revenue on the linked inventory: set from line item price if we have it (Etsy API); else leave null for user to fill.
    - **was_paid:** Set purchase.was_paid = 1 if the Etsy receipt has was_paid = true; else 0. So synced orders from Etsy that were already marked paid on Etsy appear as paid in the app.
    - **Etsy linkage:** etsy_receipt_id = receipt_id (string). notes = null or “Synced from Etsy”.
    - **Shipper/shipping:** shipper = null, shipping_cost = null (user fills when they mark shipped).
   - **After all line items:** If the receipt has a single “total” and we have multiple line items, we do not split the total across rows; sale_revenue on inventory is set from the line item price when the Etsy API provides it. If Etsy does not provide per-line price, leave sale_revenue null.

3. **Idempotency:** A receipt that was already synced (existing purchase.etsy_receipt_id) is never processed again. No update of existing purchase rows during sync; sync only creates new rows.

4. **Response:** Return a summary, e.g. { synced: number of receipts processed (new), created_orders: number of new order_ids, created_purchases: number of new purchase rows }.

**Edge cases:**

- **Receipt with no line items:** Skip receipt (or create zero purchase rows and still create customer/address for consistency; prefer skip if Etsy never sends empty receipts).
- **Same buyer, multiple receipts:** Each receipt gets its own order_id (etsy_receipt_id). Customer and address are reused when matched.
- **Token expired during sync:** Return 401; client should prompt re-connect (token refresh per ADR-007 when implemented).

## Consequences

- **Positive:** Unambiguous sync behavior; no duplicate orders; every purchase row has valid inventory_id (via placeholder when needed).
- **Negative:** Placeholder inventory rows may accumulate; UI should allow user to “link to real item” or merge later (implementation detail in Inventory/Orders flows).

## Notes

- Etsy API receipt/listing shape: use the actual Etsy Open API v3 receipt and transaction/listing structure; field names in this ADR map to that structure (receipt_id, buyer email, ship-to fields, line items with listing_id and price). Implementer must map Etsy response fields to our schema.
- Thumbnail for placeholder inventory: leave thumbnail_path null; pick list shows placeholder icon per ADR-015.
