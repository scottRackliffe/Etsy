# ADR-020: Outstanding list — definitions and query rules (no ambiguity)

## Status

Accepted

## Date

2025-02-15

## Context

The outstanding panel and full-page Outstanding tab (ADR-009) show a data-driven list of “what needs attention.” Each item type must be defined so an implementer can query the database (and, where needed, compare with Etsy data) with no ambiguity. No user-added manual tasks; all items are derived from data (ADR-009, ui-design §4).

## Decision

> **Queries (2026-05-24):** Implement against `orders`, `order_items`, `inventory`, `customers` — not legacy `purchase` rows. See schema mapping in Notes.

The outstanding list is the **union** of the following item types. Each type has an exact definition and a query rule (SQL or equivalent). The list is ordered by user-configurable sort (ADR-020 sort order; default date first). The panel may show a capped number (e.g. top 20); the full-page Outstanding tab shows the full list. Clicking an item puts context in place (navigate to tab and select record) per ADR-009.

**Exclude void/cancelled orders:** For order-based types (1, 2, 6), include only `orders` where `order_status = 'active'`. Exclude void and cancelled orders from the outstanding list.

**Item types and query rules:**

---

### 1. Orders paid but not yet shipped

**Definition:** Orders marked paid but not yet shipped (no shipping date recorded).

**Query rule:** From `orders` where `order_status = 'active'` AND `was_paid = 1` AND `shipping_date` IS NULL.

> **Reconciled 2026-06-09:** Removed `seller_shipping_cost IS NULL` and `shipper IS NULL` from the predicate. Type 1 checks only whether the order has shipped (via `shipping_date`), not whether shipping cost or carrier have been entered. Missing shipping cost on already-shipped orders is covered separately by Type 6.

**Grouping:** One outstanding item per `orders.id`. Display: e.g. “Order #&lt;order_number&gt; – &lt;ship_to_first_name&gt; &lt;ship_to_last_name&gt; – not shipped”.

**Target on click:** Sales tab; `record = orders.id` (deep-link `orderId`).

---

### 2. Orders not yet marked paid

**Definition:** Active orders not yet marked paid in the app.

**Query rule:** From `orders` where `order_status = 'active'` AND (`was_paid = 0` OR `was_paid` IS NULL). “Mark as paid” sets `orders.was_paid = 1` (ADR-018).

**Target on click:** Sales tab; `record = orders.id`.

---

### 3. New Etsy orders not yet synced

**Definition:** Etsy receipts in the API with no matching local order (`orders.etsy_receipt_id`).

**Query rule:** Not pure SQL. (1) Fetch receipts from Etsy (e.g. last 200). (2) For each `receipt_id`, check for `orders.etsy_receipt_id` = that id. (3) If none, emit outstanding item “Etsy order #&lt;receipt_id&gt; – not synced”.

**Rate-limit and failure behavior:** Cache the fetched Etsy receipt-id set for 5 minutes to reduce repeated API calls from panel/tab refreshes. If Etsy returns HTTP 429, keep showing cached results and surface “Etsy sync status may be delayed.” If Etsy is unavailable, omit this type from the list for that refresh and show “Etsy sync status unavailable.”

**Target on click:** Sales tab; navigate to Sales and highlight or focus the “Sync from Etsy” command. The app shows a clear indication that syncing will import this order (e.g. detail text: “Sync to import this order”). User may then run Sync from Etsy.

---

### 4. Inventory items in stock but not yet listed

**Definition:** Inventory rows with status `In stock` that have not been listed (no `date_listed`).

**Query rule:** Select from `inventory` where `status` = 'In stock' AND (`date_listed` IS NULL OR `date_listed` = '').

> **Reconciled 2026-06-09:** Removed `Draft` from this type. Draft items are intentionally incomplete (still being entered/prepared) and should not appear as outstanding “not listed” items. Only `In stock` items — which are ready for sale but not yet listed — are flagged.

One outstanding item per inventory row. Display: e.g. “Item &lt;item_number&gt; – &lt;description or name&gt; – not listed”.

**Target on click:** Inventory tab; open/select that inventory item. Record = inventory id.

---

### 5. Customers with no address or incomplete address

**Definition:** Customers that have zero addresses, or for which every address is “incomplete” (missing required fields for shipping).

**Query rule:** A customer is complete if either (a) flat `customers.address_1`, `city`, `country`, `postal_code` are all non-empty, OR (b) at least one `addresses` row for that customer has `first_line`, `city`, `country`, `postal_code` non-empty. Outstanding = customers failing both checks.

One outstanding item per customer. Display: e.g. “Customer: &lt;first_name&gt; &lt;last_name&gt; – no address” or “incomplete address”.

**Target on click:** Customers tab; open/select that customer. Record = customer id.

---

### 6. Orders missing shipping cost (in scope)

**Definition:** Shipped orders (`shipper` and `shipping_date` set) with missing `seller_shipping_cost` for postal-by-vendor reporting.

**Query rule:** From `orders` where `order_status = 'active'` AND `shipper` IS NOT NULL AND `shipping_date` IS NOT NULL AND (`seller_shipping_cost` IS NULL OR `seller_shipping_cost = 0`).

**Target on click:** Sales tab; `record = orders.id`.

---

### 7. Records with validation or context-check issues (in scope)

**Definition:** Records that failed validation or context checks at save time and were not auto-corrected. Each such record appears as an outstanding to-do so the user can fix it (e.g. "Order #123 — select a customer," "Item X — listing description required before List on Etsy").

**Query rule:** When the Outstanding list is built, the app runs validation and context checks (ADR-021) for the relevant records; records (or orders) with unresolved validation/context-check failures appear as outstanding items. One outstanding item per record or per order that has unresolved issues. No separate stored "flag" is required; the app evaluates validation state to build the list.

**Target on click:** Navigate to the tab and record that needs attention (e.g. Sales → order; Inventory → item).

---

### Summary table

| Type                            | Data source          | Query / logic                                                      | One item per       | Click target        |
| ------------------------------- | -------------------- | ------------------------------------------------------------------ | ------------------ | ------------------- |
| Paid but not shipped            | orders               | active, was_paid=1, missing ship date | orders.id          | Sales, order        |
| Not yet marked paid             | orders               | active, was_paid=0                                                 | orders.id          | Sales, order        |
| New Etsy not synced             | Etsy API + orders    | receipt_id with no orders.etsy_receipt_id                          | receipt_id         | Sales, sync         |
| In stock not listed             | inventory            | status In stock and date_listed empty                        | inventory.id       | Inventory, item     |
| Customer no/incomplete address  | customers, addresses | no complete flat or ship-to address                                | customers.id       | Customers, customer |
| Missing shipping cost           | orders               | shipped but seller_shipping_cost null/0                            | orders.id          | Sales, order        |
| Validation/context-check issues | DB or computed       | records with unresolved validation/context failures                | record or order_id | Tab and record      |

---

**Sort order (user-configurable):** The outstanding list supports **three sort levels**. The user selects which **field** is 1st, 2nd, and 3rd sort (from a defined list: e.g. date, type, customer name, order ID). **Date** is the **default** for the **first** sort (user can change it). For **each** of the three criteria, the user chooses **ascending or descending**. Values are stored in settings (ADR-017: outstanding_sort_1_field, outstanding_sort_1_direction, outstanding_sort_2_field, outstanding_sort_2_direction, outstanding_sort_3_field, outstanding_sort_3_direction). Default: 1st = date, e.g. descending (newest first). Config/Preferences exposes the sort choices.

---

**was_paid:** On `orders` (INTEGER 0/1, default 0) per ADR-017. Query rules above use `orders.was_paid`.

## Consequences

- **Positive:** Implementer can build the outstanding list with exact queries; no ambiguity.
- **Negative:** “New Etsy not synced” requires an Etsy API call; implementer must cache or fetch when the Outstanding view loads (and respect rate limits per ADR-011).

---

### Caching and performance (no ambiguity)

**Etsy receipt fetch depth:** For type 3 (new Etsy orders not synced), fetch at most **200 receipts** (limit=200) from the Etsy API. This matches the sync fetch depth. Only the receipt_id list is needed (not full receipt details) for the outstanding check.

**Cache invalidation triggers:**

- After a successful Etsy sync (`POST /api/sync/etsy`), invalidate the cached receipt-id set immediately.
- After the user marks an order paid or shipped, re-evaluate outstanding items for that order (remove from list if no longer qualifying).
- After inventory or customer changes that affect outstanding types (e.g. setting `date_listed`, completing an address), re-evaluate the affected item.
- On manual panel refresh (user clicks Refresh or the 60-second auto-refresh fires), re-query all types.

**429/timeout fallback UX:**

- If the Etsy API returns 429 or times out when fetching receipt IDs for type 3, keep showing the last cached result.
- Display a subtle note below the outstanding panel: "Etsy sync status may be delayed" (info badge, not error).
- If no cached result exists (first load, never connected), omit type 3 from the list entirely with no error message.
- Retry the Etsy fetch on the next auto-refresh cycle (60 seconds).

**Sort-field definitions:**

| Field key       | Label    | Source                                                                                                              | Sort value                           |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `date`          | Date     | `order_date (from orders table)` for orders; `created_at` for inventory/customers; `creation_tsz` for Etsy receipts | ISO 8601 string (lexicographic sort) |
| `type`          | Type     | Outstanding type name (e.g. "Paid not shipped", "Not listed")                                                       | Alphabetical by type label           |
| `customer_name` | Customer | `ship_to_last_name, ship_to_first_name` for orders; `last_name, first_name` for customers; "Etsy order" for type 3  | Alphabetical (last name first)       |
| `order_id`      | Order ID | `order_id` for orders; `item_number` for inventory; `receipt_id` for Etsy                                           | String sort                          |
| `age_days`      | Age      | Days since the `date` field value                                                                                   | Numeric                              |

**Null sorting:** Null values sort **last** in ascending order and **first** in descending order. This ensures items with missing dates appear at the bottom of "newest first" views rather than at the top.

## Notes

- Panel and full-page tab show the same data; only the count or cap may differ (e.g. panel top 20, tab full list).
- Sort order is user-configurable: three levels, date default first; see "Sort order (user-configurable)" above and ADR-017 settings keys.
- The outstanding panel auto-refreshes every 60 seconds when visible. The full-page Outstanding tab refreshes on mount and every 60 seconds.
- Outstanding items are aggregated server-side via a `GET /api/outstanding` endpoint (updated from original client-side design). The endpoint runs 6 SQL queries and returns a unified list. The frontend Outstanding tab consumes this endpoint and supports auto-refresh (60 seconds) and type filtering.

### Context-in-place navigation (updated 2026-05-24)

When a user clicks an outstanding item in the Outstanding tab, the app navigates to the relevant page (Sales, Inventory, or Customers) with a deep-link query parameter that selects, scrolls to, and highlights the target record. ADR-035 defines the full deep-link protocol:

- Paid-not-shipped / Unpaid / Missing-shipping-cost / Orders-missing-customer → navigates to `/sales?orderId=<id>`
- Not-listed → navigates to `/inventory?itemId=<id>`
- Missing-address → navigates to `/customers?customerId=<id>`

The target page reads the query parameter on mount, fetches the record if not already loaded, scrolls it into view, applies a highlight animation, and cleans the URL. This satisfies the "context in place" requirement from ADR-009 without requiring the side panel.

### Schema mapping (updated 2026-05-24)

This ADR's item descriptions use the original data model terms ("purchase", "purchase row", "customer_address"). The implementation maps as follows:

| ADR-020 term                            | Implementation                                                            | Notes                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| purchase / purchase row                 | `orders` table (header) + `order_items` (line items)                      | Outstanding queries run against `orders`, not a separate `purchase` table                   |
| order_id (grouping)                     | `orders.id`                                                               | Each `orders` row IS the order                                                              |
| was_paid                                | `orders.was_paid`                                                         |                                                                                             |
| shipping_date / shipper / shipping_cost | `orders.shipping_date` / `orders.shipper` / `orders.seller_shipping_cost` |                                                                                             |
| order_status                            | `orders.order_status`                                                     | Values: `active`, `void`, `cancelled`                                                       |
| customer_address                        | `addresses` table                                                         | Column names: `first_line`, `second_line`, `state` (not `address_line_1`, `state_province`) |
| etsy_receipt_id                         | `orders.etsy_receipt_id`                                                  |                                                                                             |

### Implemented outstanding types (v1)

| API `type` value        | ADR-020 type # | Status      |
| ----------------------- | -------------- | ----------- |
| `paid_not_shipped`      | Type 1         | Implemented |
| `unpaid`                | Type 2         | Implemented |
| `not_listed`            | Type 4         | Implemented |
| `missing_address`       | Type 5         | Implemented |
| `missing_shipping_cost` | Type 6         | Implemented |

### Future / Post-v1 Types

The following outstanding types require additional infrastructure and are deferred to post-v1:

| API `type` value     | ADR-020 type # | Reason deferred                                                                 |
| -------------------- | -------------- | ------------------------------------------------------------------------------- |
| `etsy_not_synced`    | Type 3         | Requires live Etsy API call at query time; depends on sync infrastructure       |
| `validation_issue`   | Type 7         | Requires runtime validation checks across all entity types at outstanding build |

See Types 3 and 7 definitions above for full query rules and caching behavior.
