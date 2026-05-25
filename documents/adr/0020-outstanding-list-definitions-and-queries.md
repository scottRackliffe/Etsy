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

**Exclude void/cancelled orders:** For every outstanding type that is **order-based** (types 1, 2, 6 — orders paid but not shipped, orders not yet paid, orders missing shipping cost), include **only** orders where **every** purchase row in that order has **order_status = 'active'**. Do not show void or cancelled orders on the outstanding list; they need no action. (ADR-017: order_status one of active, void, cancelled.)

**Item types and query rules:**

---

### 1. Orders paid but not yet shipped

**Definition:** Purchase rows that represent an order that has been marked paid but not yet shipped (no shipping date or shipper recorded).

**Query rule:** Select distinct order_id where: (1) the order is **paid** — every purchase row in that order has `was_paid = 1` (treat `was_paid` IS NULL as 0 for legacy rows). (2) The order is **not yet shipped** — at least one purchase row in that order has `shipping_date` IS NULL OR `shipper` IS NULL OR `shipping_cost` IS NULL. So: paid orders that still need shipping info.

**Grouping:** One outstanding item per **order_id** (not per purchase row). So: distinct order_id where at least one purchase row in that order satisfies the condition above. Display: one row per order, e.g. “Order #&lt;order_id&gt; – &lt;ship_to_first_name&gt; &lt;ship_to_last_name&gt; – not shipped”.

**Target on click:** Sales tab; open/select the order (all purchase rows with that order_id). Record = order_id.

---

### 2. Orders not yet marked paid

**Definition:** Orders that the user has not yet marked as paid (e.g. payment received but not recorded in the app).

**Query rule:** Select distinct order_id where **every** purchase row in that order has `was_paid = 0` or `was_paid` IS NULL. The purchase table includes `was_paid` (ADR-017). “Mark as paid” sets was_paid = 1 for all purchase rows in the order.

**Target on click:** Sales tab; select the order. Record = order_id.

---

### 3. New Etsy orders not yet synced

**Definition:** Etsy receipts that exist in the Etsy API but do not yet have any corresponding purchase row in the local DB (no purchase.etsy_receipt_id matching that receipt).

**Query rule:** Not a pure SQL query. (1) Fetch receipts from Etsy (same as dashboard, e.g. last N receipts). (2) For each receipt id, check whether there exists a row in `purchase` with `etsy_receipt_id` = that id. (3) If no such row exists, the receipt is “new Etsy order not yet synced.” Display one outstanding item per such receipt, e.g. “Etsy order #&lt;receipt_id&gt; – not synced”.

**Rate-limit and failure behavior:** Cache the fetched Etsy receipt-id set for 5 minutes to reduce repeated API calls from panel/tab refreshes. If Etsy returns HTTP 429, keep showing cached results and surface “Etsy sync status may be delayed.” If Etsy is unavailable, omit this type from the list for that refresh and show “Etsy sync status unavailable.”

**Target on click:** Sales tab; navigate to Sales and highlight or focus the “Sync from Etsy” command. The app shows a clear indication that syncing will import this order (e.g. detail text: “Sync to import this order”). User may then run Sync from Etsy.

---

### 4. Inventory items in “In stock” but not yet “Listed”

**Definition:** Inventory rows with status that indicates in stock but not yet listed (e.g. status = ‘In stock’ and date_listed IS NULL, or status = ‘Draft’ and ready to list).

**Query rule:** Select from `inventory` where:

- `status` = ‘In stock’ AND (`date_listed` IS NULL OR `date_listed` = ‘’)
- OR `status` = ‘Draft’ (items being prepared; user may list them next).

One outstanding item per inventory row. Display: e.g. “Item &lt;item_number&gt; – &lt;description or name&gt; – not listed”.

**Target on click:** Inventory tab; open/select that inventory item. Record = inventory id.

---

### 5. Customers with no address or incomplete address

**Definition:** Customers that have zero addresses, or for which every address is “incomplete” (missing required fields for shipping).

**Query rule:** Required address fields for “complete”: address_line_1, city, country, postal_code (per ADR-003 and typical shipping). List customers where `customer.id` is **not in** the set of customer ids that have at least one complete address:

- complete-address set = `SELECT customer_id FROM customer_address WHERE address_line_1 IS NOT NULL AND address_line_1 <> '' AND city IS NOT NULL AND city <> '' AND country IS NOT NULL AND country <> '' AND postal_code IS NOT NULL AND postal_code <> ''`
- outstanding set = customers with `id NOT IN (complete-address set)`

One outstanding item per customer. Display: e.g. “Customer: &lt;first_name&gt; &lt;last_name&gt; – no address” or “incomplete address”.

**Target on click:** Customers tab; open/select that customer. Record = customer id.

---

### 6. Orders missing shipping cost (in scope)

**Definition:** Orders that have been shipped (shipper and shipping_date set) but shipping_cost is NULL or zero and should be filled for accurate “postal costs by vendor” report.

**Query rule:** Distinct order_id where at least one purchase row has shipper IS NOT NULL and shipping_date IS NOT NULL and (shipping_cost IS NULL or shipping_cost = 0). **In scope for v1.**

**Target on click:** Sales tab; open/select the order. Record = order_id.

---

### 7. Records with validation or context-check issues (in scope)

**Definition:** Records that failed validation or context checks at save time and were not auto-corrected. Each such record appears as an outstanding to-do so the user can fix it (e.g. "Order #123 — select a customer," "Item X — listing description required before List on Etsy").

**Query rule:** When the Outstanding list is built, the app runs validation and context checks (ADR-021) for the relevant records; records (or orders) with unresolved validation/context-check failures appear as outstanding items. One outstanding item per record or per order that has unresolved issues. No separate stored "flag" is required; the app evaluates validation state to build the list.

**Target on click:** Navigate to the tab and record that needs attention (e.g. Sales → order; Inventory → item).

---

### Summary table

| Type                            | Data source                | Query / logic                                                          | One item per       | Click target         |
| ------------------------------- | -------------------------- | ---------------------------------------------------------------------- | ------------------ | -------------------- |
| Paid but not shipped            | purchase                   | order_id where any row has shipping_date/shipper/shipping_cost missing | order_id           | Sales, order         |
| Not yet marked paid             | purchase                   | order_id where all rows have was_paid = 0                              | order_id           | Sales, order         |
| New Etsy not synced             | Etsy API + purchase        | Receipt ids with no purchase.etsy_receipt_id                           | receipt            | Sales, sync or order |
| In stock not listed             | inventory                  | status In stock/Draft and date_listed empty                            | inventory id       | Inventory, item      |
| Customer no/incomplete address  | customer, customer_address | Customer with no complete address                                      | customer id        | Customers, customer  |
| Missing shipping cost           | purchase                   | order with shipper/shipping_date set but shipping_cost null/0          | order_id           | Sales, order         |
| Validation/context-check issues | DB or computed             | records with unresolved validation/context failures                    | record or order_id | Tab and record       |

---

**Sort order (user-configurable):** The outstanding list supports **three sort levels**. The user selects which **field** is 1st, 2nd, and 3rd sort (from a defined list: e.g. date, type, customer name, order ID). **Date** is the **default** for the **first** sort (user can change it). For **each** of the three criteria, the user chooses **ascending or descending**. Values are stored in settings (ADR-017: outstanding_sort_1_field, outstanding_sort_1_direction, outstanding_sort_2_field, outstanding_sort_2_direction, outstanding_sort_3_field, outstanding_sort_3_direction). Default: 1st = date, e.g. descending (newest first). Config/Preferences exposes the sort choices.

---

**was_paid:** The purchase table includes **was_paid** (INTEGER 0/1, default 0) per ADR-017. The query rules above use it as written.

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

| Field key | Label | Source | Sort value |
|-----------|-------|--------|------------|
| `date` | Date | `order_date (from orders table)` for orders; `created_at` for inventory/customers; `creation_tsz` for Etsy receipts | ISO 8601 string (lexicographic sort) |
| `type` | Type | Outstanding type name (e.g. "Paid not shipped", "Not listed") | Alphabetical by type label |
| `customer_name` | Customer | `ship_to_last_name, ship_to_first_name` for orders; `last_name, first_name` for customers; "Etsy order" for type 3 | Alphabetical (last name first) |
| `order_id` | Order ID | `order_id` for orders; `item_number` for inventory; `receipt_id` for Etsy | String sort |
| `age_days` | Age | Days since the `date` field value | Numeric |

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

| ADR-020 term | Implementation | Notes |
|-------------|----------------|-------|
| purchase / purchase row | `orders` table (header) + `order_items` (line items) | Outstanding queries run against `orders`, not a separate `purchase` table |
| order_id (grouping) | `orders.id` | Each `orders` row IS the order |
| was_paid | `orders.was_paid` | |
| shipping_date / shipper / shipping_cost | `orders.shipping_date` / `orders.shipper` / `orders.seller_shipping_cost` | |
| order_status | `orders.order_status` | Values: `active`, `void`, `cancelled` |
| customer_address | `addresses` table | Column names: `first_line`, `second_line`, `state` (not `address_line_1`, `state_province`) |
| etsy_receipt_id | `orders.etsy_receipt_id` | |

### Implemented vs future outstanding types

| API `type` value | ADR-020 type # | Status |
|-----------------|----------------|--------|
| `paid_not_shipped` | Type 1 | Implemented |
| `unpaid` | Type 2 | Implemented |
| `not_listed` | Type 4 | Implemented |
| `missing_address` | Type 5 | Implemented |
| `missing_shipping_cost` | Type 6 | Implemented |
| `etsy_not_synced` | Type 3 | Future (requires Etsy API call at query time) |
| `validation_issue` | Type 7 | Future (requires runtime validation checks) |
