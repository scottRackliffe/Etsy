# ADR-031: Order detail view and editing

## Status

Accepted

## Date

2026-05-24

## Context

The Sales page displays orders in a table but provides no way to view order details. Clicking an order only highlights the row and shows a one-line summary. There is no view for line items, shipping address, tracking number, customer association, shipping costs, discounts, notes, or order status changes. Users cannot edit order fields, add tracking numbers, or link orders to customers. The backend API (`GET /api/orders/[id]`, `PATCH /api/orders/[id]`) already supports full CRUD, but the frontend does not expose it.

## Decision

**Add a full order detail panel to the Sales page with editable fields, line items, and action buttons.** The page adopts a master-detail layout: order list on the left/top, detail panel on the right/bottom.

---

### Page layout

```
┌─────────────────────────────────────────────────────────┐
│ Sales / Orders          [Search] [Filter chips] [Sync]  │
├────────────────────────┬────────────────────────────────┤
│ Order list (DataTable) │ Order detail panel             │
│ with pagination        │ (selected order)               │
│                        │                                │
│                        │ ┌────────────────────────────┐ │
│                        │ │ Order header + status      │ │
│                        │ ├────────────────────────────┤ │
│                        │ │ Line items table           │ │
│                        │ ├────────────────────────────┤ │
│                        │ │ Ship-to address            │ │
│                        │ ├────────────────────────────┤ │
│                        │ │ Financials                 │ │
│                        │ ├────────────────────────────┤ │
│                        │ │ Actions                    │ │
│                        │ └────────────────────────────┘ │
└────────────────────────┴────────────────────────────────┘
```

On screens < `lg`, panels stack vertically.

---

### Order detail panel — sections (exact)

**Order header:**

- Order number (prominent, large text).
- Source channel badge: `Etsy` (accent) or `Manual` (neutral).
- Order date (formatted).
- Customer name (linked — click navigates to Customers tab with `?customerId=`).
- Status badges: payment (`Paid` / `Unpaid`), shipping (`Shipped` / `Not shipped`), order status (`Active` / `Void` / `Cancelled`).

**Line items section:**

- Table (using `DataTable`) showing order items from `GET /api/orders/[id]` response.
- Columns: Item (inventory `item_number` or `description`), Quantity, Unit price, Line total.
- Footer row: Subtotal.
- If no line items: `EmptyState` with message "No line items. Add items from inventory."
- "Add item" button: opens a modal with inventory pick list (filtered to `in_stock` items per ADR-015).

**Ship-to address section:**

| Field | Label | Editable |
|-------|-------|----------|
| `ship_to_first_name` + `ship_to_last_name` | Ship to | Yes |
| `ship_to_address_line_1` | Address line 1 | Yes |
| `ship_to_address_line_2` | Address line 2 | Yes |
| `ship_to_city` | City | Yes |
| `ship_to_state_province` | State / Province | Yes |
| `ship_to_postal_code` | Postal code | Yes |
| `ship_to_country` | Country | Yes |

- If customer is linked and has addresses, show "Copy from customer address" button.

**Financials section:**

| Field | Label | Editable | Notes |
|-------|-------|----------|-------|
| `subtotal` | Subtotal | Read-only | Sum of line totals |
| `shipping_total` | Shipping (buyer pays) | Yes | Amount charged to buyer |
| `seller_shipping_cost` | Shipping cost (seller pays) | Yes | Seller's actual cost |
| `tax_total` | Tax | Yes | |
| `discount_total` | Discount | Yes | |
| `grand_total` | Grand total | Read-only | Computed: subtotal + shipping + tax − discount |

**Shipping section:**

| Field | Label | Editable | Notes |
|-------|-------|----------|-------|
| `shipper` | Carrier | `SelectInput` | Options: `USPS`, `UPS`, `FedEx`, `DHL`, `Other` |
| `shipping_date` | Ship date | `TextInput` type="date" | |
| Tracking number | Tracking # | `TextInput` | New field: `tracking_number` (requires DB column addition) |

**Notes section:**

| Field | Label | Editable |
|-------|-------|----------|
| `notes` | Internal notes | Yes (`TextArea`) |

**Read-only metadata:**

- `etsy_receipt_id` — shown if present, with note "Synced from Etsy."
- `created_at`, `updated_at` — formatted dates.

---

### Actions

All use `Button` component. Destructive actions require confirmation per ADR-032.

| Action | Button | Behavior |
|--------|--------|----------|
| Save changes | `<Button variant="accent">Save changes</Button>` | `PATCH /api/orders/[id]` with changed fields |
| Mark paid | `<Button variant="primary">Mark paid</Button>` | `POST /api/orders/[id]/mark-paid` |
| Mark shipped | `<Button variant="primary">Mark shipped</Button>` | Prompt for carrier + tracking + date, then `POST /api/orders/[id]/mark-shipped` |
| Void order | `<Button variant="danger">Void order</Button>` | Confirmation dialog. Sets `order_status = 'void'` |
| Print invoice | `<Button variant="secondary">Print invoice</Button>` | Opens `/api/reports/invoice?order_id={id}&format=pdf` (per ADR-036) |
| Print thank-you | `<Button variant="secondary">Thank-you note</Button>` | Opens `/api/reports/thank-you-note?order_id={id}&format=pdf` (per ADR-036) |
| Link customer | `<Button variant="ghost">Link customer</Button>` | Modal with customer search/select. Sets `customer_id` via PATCH |

---

### Mark shipped flow

Instead of a single button click, "Mark shipped" opens a small modal:

- Title: "Ship order {order_number}"
- Fields: Carrier (select, required), Tracking number (text, optional), Ship date (date, default: today).
- Buttons: "Confirm shipment" (accent) + "Cancel" (secondary).
- On confirm: calls `POST /api/orders/[id]/mark-shipped` with carrier, tracking, and date.

---

### Create order flow

Replace the current inline form with a Modal:

- Title: "Create order"
- Fields: Order number (required), Customer (optional, searchable select), Grand total, Source channel (default: Manual).
- Buttons: "Create" (accent) + "Cancel" (secondary).
- On success: select new order, open detail panel.

---

### Delete order

- Not exposed in normal UI (orders should be voided, not deleted).
- Void sets `order_status = 'void'` and excludes from active reports.

---

### Database change

Add `tracking_number TEXT` column to `orders` table. Migration: `ALTER TABLE orders ADD COLUMN tracking_number TEXT`.

## Consequences

- **Positive**
  - Users can view and manage all order details from the UI.
  - Shipping workflow captures carrier and tracking data properly.
  - Per-order invoice and thank-you note generation accessible from order context.
  - Customer linking enables relationship tracking.
- **Negative**
  - Requires database migration for `tracking_number`.
  - Master-detail layout adds complexity to the Sales page.
  - Mark-shipped modal is a change from the current single-click pattern.
