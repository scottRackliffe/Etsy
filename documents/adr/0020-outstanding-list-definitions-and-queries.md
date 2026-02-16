# ADR-020: Outstanding list — definitions and query rules (no ambiguity)

## Status

Accepted

## Date

2025-02-15

## Context

The outstanding panel and full-page Outstanding tab (ADR-009) show a data-driven list of “what needs attention.” Each item type must be defined so an implementer can query the database (and, where needed, compare with Etsy data) with no ambiguity. No user-added manual tasks; all items are derived from data (ADR-009, ui-design §4).

## Decision

The outstanding list is the **union** of the following item types. Each type has an exact definition and a query rule (SQL or equivalent). The list is ordered by priority (implementation may choose sort order; e.g. by date, then by type). The panel may show a capped number (e.g. top 20); the full-page Outstanding tab shows the full list. Clicking an item puts context in place (navigate to tab and select record) per ADR-009.

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

**Target on click:** Sales tab; optionally open a “Sync from Etsy” flow or show a list of unsynced receipts. Or: navigate to Sales and highlight “Sync from Etsy” command. Implementation may show a detail that says “Sync to import this order.”

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

**Query rule:** Required address fields for “complete”: at least address_line_1, city, country, postal_code (per ADR-003 and typical shipping). So:
- Customers with no addresses: `customer` id not in (select customer_id from customer_address).
- Customers with only incomplete addresses: customer_id in (select customer_id from customer_address group by customer_id having every row missing at least one of address_line_1, city, country, postal_code). Simpler rule: list `customer` where id NOT IN (select customer_id from customer_address where address_line_1 IS NOT NULL AND address_line_1 <> ’’ AND city IS NOT NULL AND city <> ’’ AND country IS NOT NULL AND country <> ’’ AND postal_code IS NOT NULL AND postal_code <> ’’). So: customers who do not have at least one address with non-empty address_line_1, city, country, postal_code.

One outstanding item per customer. Display: e.g. “Customer: &lt;first_name&gt; &lt;last_name&gt; – no address” or “incomplete address”.

**Target on click:** Customers tab; open/select that customer. Record = customer id.

---

### 6. Optional future: orders missing shipping cost

**Definition:** Orders that have been shipped (shipper and shipping_date set) but shipping_cost is NULL or zero and should be filled for accurate “postal costs by vendor” report.

**Query rule:** Distinct order_id where at least one purchase row has shipper IS NOT NULL and shipping_date IS NOT NULL and (shipping_cost IS NULL or shipping_cost = 0). **In scope for v1.**

**Target on click:** Sales tab; open/select the order. Record = order_id.

---

### 7. Records with validation or context-check issues (in scope)

**Definition:** Records that failed validation or context checks at save time and were not auto-corrected. Each such record appears as an outstanding to-do so the user can fix it (e.g. "Order #123 — select a customer," "Item X — listing description required before List on Etsy").

**Query rule:** Implementation may store a flag or run validation/context checks and list failures. Per ADR-021: every validation or context-check failure either auto-corrects or creates an outstanding item. One outstanding item per record (or per order) that has unresolved validation/context issues.

**Target on click:** Navigate to the tab and record that needs attention (e.g. Sales → order; Inventory → item).

---

### Summary table

| Type | Data source | Query / logic | One item per | Click target |
|------|-------------|----------------|--------------|--------------|
| Paid but not shipped | purchase | order_id where any row has shipping_date/shipper/shipping_cost missing | order_id | Sales, order |
| Not yet marked paid | purchase | order_id where all rows have was_paid = 0 | order_id | Sales, order |
| New Etsy not synced | Etsy API + purchase | Receipt ids with no purchase.etsy_receipt_id | receipt | Sales, sync or order |
| In stock not listed | inventory | status In stock/Draft and date_listed empty | inventory id | Inventory, item |
| Customer no/incomplete address | customer, customer_address | Customer with no complete address | customer id | Customers, customer |
| Missing shipping cost | purchase | order with shipper/shipping_date set but shipping_cost null/0 | order_id | Sales, order |
| Validation/context-check issues | DB or computed | records with unresolved validation/context failures | record or order_id | Tab and record |

---

**Sort order (user-configurable):** The outstanding list supports **three sort levels**. The user selects which **field** is 1st, 2nd, and 3rd sort (from a defined list: e.g. date, type, customer name, order ID). **Date** is the **default** for the **first** sort (user can change it). For **each** of the three criteria, the user chooses **ascending or descending**. Values are stored in settings (ADR-017: outstanding_sort_1_field, outstanding_sort_1_direction, outstanding_sort_2_field, outstanding_sort_2_direction, outstanding_sort_3_field, outstanding_sort_3_direction). Default: 1st = date, e.g. descending (newest first). Config/Preferences exposes the sort choices.

---

**was_paid:** The purchase table includes **was_paid** (INTEGER 0/1, default 0) per ADR-017. The query rules above use it as written.

## Consequences

- **Positive:** Implementer can build the outstanding list with exact queries; no ambiguity.
- **Negative:** “New Etsy not synced” requires an Etsy API call; implementer must cache or fetch when the Outstanding view loads (and respect rate limits per ADR-011).

## Notes

- Panel and full-page tab show the same data; only the count or cap may differ (e.g. panel top 20, tab full list).
- Sort order is user-configurable: three levels, date default first; see "Sort order (user-configurable)" above and ADR-017 settings keys.
