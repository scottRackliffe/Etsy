# ADR-069: Sample/demo data for new users

## Status
Accepted

## Date
2026-05-24

## Context
New users see an empty application with no data. They cannot explore the workflow, understand the UI, or evaluate whether the app meets their needs without first entering real data. Sample data lets them explore immediately.

## Decision

### Entry points

1. **First-run wizard (ADR-044):** Step 4 includes a "Load sample data to explore" button. This is optional — the user can skip it.
2. **Config page:** A "Load Sample Data" button in a "Sample Data" section. Clicking it shows a `ConfirmDialog` (ADR-032): "This will add sample items, customers, and orders. Your existing data will not be affected." with actions "Load Sample Data" (primary) and "Cancel".

### Sample dataset

The dataset is defined in ``fixtures/sample-data.sql` (placeholder — seed route may inline SQL until fixture is populated)` and contains:

#### 10 inventory items
All `item_number` values are prefixed with `SAMPLE-` (e.g., `SAMPLE-001`, `SAMPLE-002`, …, `SAMPLE-010`).

| # | Description | Status | Condition | Purchase Cost | Sale Revenue |
|---|------------|--------|-----------|---------------|-------------|
| SAMPLE-001 | Vintage Fiesta Ware Pitcher, Red | Listed | Excellent | 18.00 | 65.00 |
| SAMPLE-002 | Art Deco Rhinestone Brooch | In stock | Mint/Near Mint | 12.00 | 45.00 |
| SAMPLE-003 | Depression Glass Candy Dish, Pink | Listed | Very Good | 8.50 | 35.00 |
| SAMPLE-004 | Mid-Century Teak Salad Bowl Set | Sold | Good | 25.00 | 80.00 |
| SAMPLE-005 | Bakelite Bangle Bracelet, Butterscotch | Draft | Excellent | 30.00 | 95.00 |
| SAMPLE-006 | Carnival Glass Marigold Bowl | Listed | Very Good | 15.00 | 55.00 |
| SAMPLE-007 | Vintage Pyrex Mixing Bowl, Primary Blue | Reserved | Excellent | 10.00 | 40.00 |
| SAMPLE-008 | Sterling Silver Charm Bracelet | In stock | Good | 45.00 | 120.00 |
| SAMPLE-009 | Milk Glass Hobnail Vase | Retired | Fair/As-Is | 5.00 | NULL |
| SAMPLE-010 | Cast Iron Doorstop, Flower Basket | Draft | Good | 22.00 | 60.00 |

Each item includes realistic `date_purchased`, `category_tags`, and `notes`. Items with status `Listed` have populated `listing_title`, `listing_description`, `listing_tags`, `listing_draft_state = 'approved'`, and `listing_draft_source = 'manual'`. The `Sold` item (SAMPLE-004) has `date_of_sale` and `shipping_date` set.

#### 5 customers

| # | Name | Email | City/State |
|---|------|-------|-----------|
| 1 | Margaret Chen | margaret.chen@example.com | Portland, OR |
| 2 | Robert Williams | robert.w@example.com | Austin, TX |
| 3 | Susan Park | susan.park@example.com | Chicago, IL |
| 4 | James Thompson | james.t@example.com | Savannah, GA |
| 5 | Linda Martinez | linda.m@example.com | Denver, CO |

Each customer has a full address (using the flat address fields on `customers`). Customers 1 and 2 also have entries in the `addresses` table (ship-to addresses).

#### 8 orders with line items

| Order # | Customer | Status | Payment | Source | Items |
|---------|----------|--------|---------|--------|-------|
| SAMPLE-ORD-001 | Margaret Chen | active | paid | manual | SAMPLE-004 (Sold teak bowl) |
| SAMPLE-ORD-002 | Robert Williams | active | paid | etsy | SAMPLE-001 (Listed pitcher — simulates an Etsy order) |
| SAMPLE-ORD-003 | Susan Park | active | unpaid | manual | SAMPLE-006 (Listed carnival glass) |
| SAMPLE-ORD-004 | Margaret Chen | active | paid | manual | SAMPLE-003 (Listed candy dish) — repeat customer |
| SAMPLE-ORD-005 | James Thompson | active | paid | etsy | SAMPLE-007 (Reserved pyrex bowl) |
| SAMPLE-ORD-006 | Linda Martinez | void | paid | manual | SAMPLE-002 (In stock brooch — voided order) |
| SAMPLE-ORD-007 | Robert Williams | active | unpaid | manual | SAMPLE-008 (In stock charm bracelet) |
| SAMPLE-ORD-008 | Susan Park | cancelled | unpaid | manual | SAMPLE-010 (Draft doorstop — cancelled) |

Orders include realistic `order_date`, `subtotal`, `shipping_total`, `tax_total`, `grand_total` values. Order SAMPLE-ORD-001 has `tracking_number` and `shipping_date` set. Ship-to address fields are populated from the customer's address.

#### 2 other costs

| Inventory Item | Cost Type | Amount | Note |
|---------------|-----------|--------|------|
| SAMPLE-001 | cleaning | 5.00 | Professional cleaning before listing |
| SAMPLE-004 | repair | 12.00 | Minor crack repair on one bowl |

#### Pictures
- Picture paths are set to placeholder values (`/placeholders/sample-1.jpg`, etc.).
- No actual image files are included. The UI renders the standard placeholder/missing-image icon for these paths.
- Thumbnail paths are `NULL`.

### API endpoints

#### Load sample data
`POST /api/seed/sample-data`

- Inserts all sample records from the fixture file.
- Idempotent guard: if any record with `item_number LIKE 'SAMPLE-%'` already exists, returns `409 { ok: false, error: { code: "SAMPLE_DATA_EXISTS", message: "Sample data is already loaded.", user_message: "Sample data has already been loaded. Remove it first from Config if you want to reload." } }`.
- On success returns `201`:
  ```json
  {
    "ok": true,
    "items_created": 10,
    "customers_created": 5,
    "orders_created": 8
  }
  ```

#### Remove sample data
`DELETE /api/seed/sample-data`

- Removes all inventory items where `item_number LIKE 'SAMPLE-%'`.
- Cascade removal:
  1. Delete `order_items` referencing those inventory items.
  2. Delete `orders` that have no remaining `order_items` after step 1.
  3. Delete `other_costs` referencing those inventory items.
  4. Delete `customers` that have no remaining `orders` after step 2 AND whose `email LIKE '%@example.com'` (safety check — don't delete real customers).
  5. Delete `addresses` for those deleted customers (cascade).
  6. Delete the inventory items themselves.
- On success returns `204`.
- If no sample data found, returns `404 { ok: false, error: { code: "NO_SAMPLE_DATA", message: "No sample data found to remove." } }`.

### Activity log
- Loading sample data logs: `action = 'system.sample_data_loaded'`, `source = 'user'`, `detail_json = { items: 10, customers: 5, orders: 8 }`.
- Removing sample data logs: `action = 'system.sample_data_removed'`, `source = 'user'`.

### Config UI
- Section heading: "Sample Data"
- Subtitle: "Load example inventory, customers, and orders to explore the application."
- Two buttons:
  - "Load Sample Data" (primary, disabled if sample data already exists)
  - "Remove Sample Data" (danger variant, only shown if sample data exists)
- Status text below buttons: "Sample data is loaded." or "No sample data loaded."

## Consequences
- **Positive:** Immediate hands-on exploration for new users; realistic variety of statuses, conditions, and order states demonstrates the full workflow; easy to remove when real data is entered.
- **Negative:** Sample data may confuse users who forget to remove it (mitigated by `SAMPLE-` prefix and prominent "Remove" button); fixture file must be maintained as schema evolves.

## Notes
- Cross-ref: ADR-044 (first-run wizard), ADR-032 (ConfirmDialog for destructive actions), ADR-037 (activity log entries).
- The ``fixtures/sample-data.sql` (placeholder — seed route may inline SQL until fixture is populated)` file must be updated whenever the schema changes (new columns, renamed tables, etc.).
- All sample customer emails use the `@example.com` domain (RFC 2606 reserved) to ensure they are clearly fake.
- The delete logic uses both the `SAMPLE-` prefix AND `@example.com` email as guards to prevent accidental deletion of real data.
