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
- **Add line item:** `Button variant="secondary"` opens modal with `PickList` (ADR-015) — inventory with `status` in `In stock`, `Listed`, or `Reserved`; excludes `Sold` and `Retired`.
- **Remove line item:** Row action with ConfirmDialog if line is last item warning: “Orders should have at least one line item.”
- **Edit quantity / unit price:** Inline edit per ADR-062 or modal; `PATCH` line via order update API.
- On add: `POST` creates `order_items` row; recalculate `orders.subtotal` and `grand_total` server-side.
- On remove: delete `order_items` row; recalculate totals.
- Linking inventory item does **not** auto-change inventory `status` to Sold until user runs **Record sale** or sync — document in tooltip (ADR-060).

**Buyer message (Etsy):** Read-only section below ship-to when `notes` or Etsy receipt gift message is present (ADR-070).

**Ship-to address section:**

| Field                                      | Label            | Editable |
| ------------------------------------------ | ---------------- | -------- |
| `ship_to_first_name` + `ship_to_last_name` | Ship to          | Yes      |
| `ship_to_address_line_1`                   | Address line 1   | Yes      |
| `ship_to_address_line_2`                   | Address line 2   | Yes      |
| `ship_to_city`                             | City             | Yes      |
| `ship_to_state_province`                   | State / Province | Yes      |
| `ship_to_postal_code`                      | Postal code      | Yes      |
| `ship_to_country`                          | Country          | Yes      |

- If customer is linked and has addresses, show "Copy from customer address" button.

**Financials section:**

| Field                  | Label                       | Editable  | Notes                                          |
| ---------------------- | --------------------------- | --------- | ---------------------------------------------- |
| `subtotal`             | Subtotal                    | Read-only | Sum of line totals                             |
| `shipping_total`       | Shipping (buyer pays)       | Yes       | Amount charged to buyer                        |
| `seller_shipping_cost` | Shipping cost (seller pays) | Yes       | Seller's actual cost                           |
| `tax_total`            | Tax                         | Yes       |                                                |
| `discount_total`       | Discount                    | Yes       |                                                |
| `grand_total`          | Grand total                 | Read-only | Computed: subtotal + shipping + tax − discount |

**Shipping section:**

| Field           | Label      | Editable                | Notes                                                      |
| --------------- | ---------- | ----------------------- | ---------------------------------------------------------- |
| `shipper`       | Carrier    | `SelectInput`           | Options: `USPS`, `UPS`, `FedEx`, `DHL`, `Other`            |
| `shipping_date` | Ship date  | `TextInput` type="date" |                                                            |
| Tracking number | Tracking # | `TextInput`             | `tracking_number` column (auto-set when label purchased via EasyPost). |
| Carrier service | Service    | Read-only               | `shipping_carrier_service` — shown when a label has been purchased (e.g., "USPS Ground Advantage"). |
| Postage paid    | Postage    | Read-only               | `shipping_rate_cents` formatted as dollars — shown when a label has been purchased. |

**Package dimensions:**

| Field              | Label       | Editable | Notes                                                        |
| ------------------ | ----------- | -------- | ------------------------------------------------------------ |
| `package_weight_oz` | Weight (oz) | Yes      | Pre-filled from `easypost.default_weight_oz` when null       |
| `package_length_in` | Length (in) | Yes      | Pre-filled from `easypost.default_length_in` when null       |
| `package_width_in`  | Width (in)  | Yes      | Pre-filled from `easypost.default_width_in` when null        |
| `package_height_in` | Height (in) | Yes      | Pre-filled from `easypost.default_height_in` when null       |

Layout: 4-column grid (`grid-cols-2 sm:grid-cols-4`). Saved via `PATCH /api/orders/[id]`. The Rate Shopping Modal reads these values first; if null, falls back to Config defaults (`easypost.default_*` settings).

**Label section (ADR-074):**

Visible when EasyPost is configured (API key set). Contains the integrated shipping label workflow:

| State | Display |
|---|---|
| No label purchased | `<Button variant="accent">Buy & Print Label</Button>` — opens Rate Shopping Modal (ADR-074 §4b). |
| Label purchased, not yet shipped | Label thumbnail preview (PDF first page). `<Button variant="secondary">Print Label</Button>` + `<Button variant="ghost">Void Label</Button>`. Tracking number displayed as clickable link. Copy-to-clipboard button beside tracking number. |
| Label purchased and shipped | Same as above but "Void Label" hidden. |

Legacy label button is always available below the EasyPost section: `<Button variant="ghost">Print address label (no postage)</Button>` — generates HTML label per `shipping-label-carrier-templates.md`.

If EasyPost is not configured, only the legacy button appears (no label section header).

**Notes section:**

| Field   | Label          | Editable         |
| ------- | -------------- | ---------------- |
| `notes` | Internal notes | Yes (`TextArea`) |

**Read-only metadata:**

- `etsy_receipt_id` — shown if present, with note "Synced from Etsy."
- `created_at`, `updated_at` — formatted dates.

---

### Actions

All use `Button` component. Destructive actions require confirmation per ADR-032.

| Action          | Button                                                | Behavior                                                                        |
| --------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| Save changes    | `<Button variant="accent">Save changes</Button>`      | `PATCH /api/orders/[id]` with changed fields                                    |
| Mark paid       | `<Button variant="accent">Mark paid</Button>`         | `POST /api/orders/[id]/mark-paid`                                               |
| Mark shipped    | `<Button variant="accent">Mark shipped</Button>`      | Prompt for carrier + tracking + date, then `POST /api/orders/[id]/mark-shipped` |
| Void order      | `<Button variant="danger">Void order</Button>`        | Confirmation dialog. Sets `order_status = 'void'`                               |
| Print invoice   | `<Button variant="secondary">Print invoice</Button>`  | Opens `/api/reports/invoice/{id}?format=pdf` (path-based, per ADR-036)          |
| Print thank-you | `<Button variant="secondary">Thank-you note</Button>` | Opens `/api/reports/thank-you/{id}?format=pdf` (path-based, per ADR-036)        |
| Link customer   | `<Button variant="ghost">Link customer</Button>`      | Modal with customer search/select. Sets `customer_id` via PATCH                 |
| Buy & print label | `<Button variant="accent">Buy & Print Label</Button>` | Opens Rate Shopping Modal (ADR-074). Only shown when EasyPost configured.     |
| Void label      | `<Button variant="ghost">Void label</Button>`          | ConfirmDialog → `POST /api/orders/[id]/shipping-refund`. Only when label exists and not shipped. |
| Print label (EasyPost) | `<Button variant="secondary">Print Label</Button>` | Opens purchased label PDF for printing. Only when label exists.               |
| Print address label | `<Button variant="ghost">Print address label</Button>` | Legacy HTML label (no postage). Always available.                            |

---

### Mark shipped flow

Instead of a single button click, "Mark shipped" opens a small modal:

- Title: "Ship order {order_number}"
- Fields: Carrier (select, required), Tracking number (text, optional), Ship date (date, default: today).
- Buttons: "Confirm shipment" (accent) + "Cancel" (secondary).
- On confirm: calls `POST /api/orders/[id]/mark-shipped` with carrier, tracking, and date.

**What mark-shipped does:** Sets `shipping_date`, `shipper`, and optionally `tracking_number` on the order. It does **NOT** change `order_status` (which remains `active`). The `order_status` enum is only `active | void | cancelled` — there is no `shipped` status.

**Ship-without-paid override (ADR-021):** The mark-shipped modal must check `was_paid`. If unpaid, show a warning: "This order is not marked paid. Mark as paid first, or choose Ship anyway." If user confirms Ship anyway, set `shipped_without_paid_override = 1` on the order.

---

### Create order flow

Replace the current inline form with a Modal:

- Title: "Create order"
- Fields: Order number (required), Customer (optional, searchable select), Source channel (default: `manual`), `order_status` default `active`, `payment_status` default `unpaid`.
- After create: user adds line items in detail panel (minimum one line before mark-paid/shipped).
- **Canonical enums:** `order_status`: `active` | `void` | `cancelled`; `payment_status`: `unpaid` | `paid` | `refunded` (ADR-017, ADR-071). Never `open` or `pending`.
- Buttons: "Create" (accent) + "Cancel" (secondary).
- On success: select new order, open detail panel.

---

### Line Item Mutation API

> Added 2026-06-09 — specifies the endpoints for managing order line items.

Line items are managed via nested endpoints under the order:

| Method   | Endpoint                              | Description                                    | Body / Notes                                                                                                                                           |
| -------- | ------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST`   | `/api/orders/[id]/items`              | Add a line item to the order                   | `{ "inventory_id": number, "quantity": number, "unit_price": number }`. Server computes `line_total` and recalculates `orders.subtotal` and `grand_total`. |
| `PATCH`  | `/api/orders/[id]/items/[itemId]`     | Update quantity or unit price on a line item    | `{ "quantity?": number, "unit_price?": number }`. Server recalculates `line_total`, `subtotal`, and `grand_total`.                                      |
| `DELETE` | `/api/orders/[id]/items/[itemId]`     | Remove a line item from the order              | Blocked with `400` if it is the last remaining line item (orders must have at least one item). Server recalculates `subtotal` and `grand_total`.         |

**Response format:** All three endpoints return the updated order object (same shape as `GET /api/orders/[id]`), including the recalculated totals and the current line items array. This allows the client to refresh the detail panel with a single response.

**Validation:**
- `inventory_id` must reference an existing inventory item.
- `quantity` must be ≥ 1.
- `unit_price` must be ≥ 0.
- Adding a duplicate `inventory_id` to the same order is allowed (separate line items).

---

### Delete order

- Not exposed in normal UI (orders should be voided, not deleted).
- Void sets `order_status = 'void'` and excludes from active reports.

---

### Database change

Add `tracking_number TEXT` column to `orders` table. Migration: `ALTER TABLE orders ADD COLUMN tracking_number TEXT`.

Add EasyPost columns (ADR-074): `easypost_shipment_id TEXT`, `label_url TEXT`, `label_format TEXT`, `shipping_rate_cents INTEGER`, `shipping_carrier_service TEXT`.

Add package dimension columns:

```sql
ALTER TABLE orders ADD COLUMN package_weight_oz REAL;
ALTER TABLE orders ADD COLUMN package_length_in REAL;
ALTER TABLE orders ADD COLUMN package_width_in REAL;
ALTER TABLE orders ADD COLUMN package_height_in REAL;
```

## Consequences

- **Positive**
  - Users can view and manage all order details from the UI.
  - Shipping workflow captures carrier and tracking data properly.
  - Per-order invoice and thank-you note generation accessible from order context.
  - Customer linking enables relationship tracking.
  - EasyPost integration (ADR-074) provides one-click rate shopping and label purchase.
  - Tracking numbers auto-populate on orders and carry through to thank-you notes and invoices (ADR-013).
- **Negative**
  - Requires database migration for `tracking_number` and EasyPost columns.
  - Master-detail layout adds complexity to the Sales page.
  - Mark-shipped modal is a change from the current single-click pattern.
  - Rate shopping modal adds a multi-step flow for label purchase.
