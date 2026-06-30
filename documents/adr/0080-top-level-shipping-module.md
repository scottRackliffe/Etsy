# ADR-080: Top-level Shipping module (split shipping out of Sales)

## Status

Accepted

_Implemented: WS-F, 2026-06-21._

## Date

2026-06-21

## Context

Shipping is currently embedded inside the Sales order-detail panel (ADR-031): the Shipping
section (carrier, ship date, tracking), Package dimensions, the Label section, and the EasyPost
**Rate Shopping Modal** (ADR-074) all live there. The owner wants shipping pulled out into its
own **top-level menu** so Sales focuses on the sale itself and shipping has a dedicated,
uncluttered workspace. The rate-shopping modal currently works well and must be preserved
as-is.

Program reference: `archive/audits/PROGRAM_2026-06-21_major-enhancements.md` workstream **F**.

Owner direction (verbatim intent): "Sales will not include shipping, and Shipping will only
include the Shipping fields, the package dimensions, and the shipping shopping modal (which is
working perfectly). Not sure where the Financials fields go — these seem to be summary numbers
that should be calculated when all data has been entered."

## Decision

Create a **new top-level "Shipping" tab/module** that owns all shipping operations for orders.
Sales no longer renders shipping UI. **No database schema change** — all shipping fields remain
on the `orders` table (ADR-017); only the **UI ownership** moves.

---

### 1. What moves to the Shipping module

From the Sales order-detail panel (ADR-031), the following move **out of Sales** and into the
Shipping module:

- **Shipping section:** `shipper`, `shipping_date`, `tracking_number`, `shipping_carrier_service`
  (read-only), `shipping_rate_cents` / "Postage paid" (read-only).
- **Package dimensions:** `package_weight_oz`, `package_length_in`, `package_width_in`,
  `package_height_in` (with the same Config `easypost.default_*` pre-fill behavior).
- **Label section + Rate Shopping Modal (ADR-074):** Buy & Print Label, Print/Void Label,
  legacy no-postage address label, and the EasyPost rate-shopping modal — **unchanged behavior**,
  just relocated.
- **Seller shipping cost:** `seller_shipping_cost` becomes **editable in the Shipping module**
  (it is a shipping cost; auto-populated from `shipping_rate_cents` when a label is purchased).
- **"Mark as shipped" action:** moves here, **retaining** the business rule from ADR-021 —
  blocked until the order is paid unless the user explicitly chooses "Ship anyway," which sets
  `shipped_without_paid_override` (audit flag).

### 2. What stays in Sales (ADR-031)

Sales order-detail keeps everything about the **sale**:

- Header + status badges, buyer message, line items.
- **Ship-to address** (editable) — it is order data; the Shipping module shows it **read-only**
  as context for label creation.
- **Financials** — `subtotal`, `shipping_total` (buyer pays), `tax_total`, `discount_total`,
  `grand_total`. These remain in Sales as the order's revenue summary (mostly computed).
  **`seller_shipping_cost` is shown read-only in Sales Financials** (set in Shipping), so the
  cost still appears in the order's financial picture without being editable in two places.
- Mark-as-paid, void/cancel, notes.

Resolution of the owner's "where do Financials go" question: **Financials stay in Sales as
computed/summary numbers.** Only the seller's *shipping cost input* moves to Shipping; its value
is mirrored read-only into the Sales Financials block.

### 3. Shipping module layout

A list-first master view (aligned with the forthcoming Standard Entity Management Screen,
ADR-079; until that lands, uses current shared components):

- **Order list** of orders relevant to shipping, single-spaced, full width, with columns: order #,
  customer, ship-to city/state, paid status, **shipping status**, carrier/service (if any),
  tracking (if any), ship date (if any).
- **Shipping status filter chips:** `Needs label` (no label, not shipped) · `Label purchased`
  (label bought, not shipped) · `Shipped` · `All`. Plus search by order #/customer (ADR-029).
- **Selected-order shipping panel** (right/inline): the relocated Shipping section, Package
  dimensions, seller shipping cost, Label section + Rate Shopping Modal, read-only ship-to, and
  the **Mark as shipped** action.
- Void/cancelled orders are excluded by default.

### 4. Routing and navigation

- **New route/tab:** `/shipping`. Canonical tab bar order (13, per `TabBar.tsx`):
  **Dashboard · Orders · Shipping · Inventory · Receipts · Customers · Communications · Vendors ·
  Expenses · Reports · Outstanding · Tutorial & tips · Settings** (Shipping placed immediately
  after Orders). ui-design.md §1/§2 and ADR-024 reflect this list.
- **Deep link:** `/shipping?orderId={id}` selects that order's shipping panel (ADR-035 — already
  added). Shipping-related activity rows (ADR-037 `shipping` entity_type) link here once this
  module ships; before that they link to `/orders?orderId=`.

### 5. APIs

**No new endpoints required.** Shipping reads/writes orders via the existing
`GET/PATCH /api/orders/[id]` and the EasyPost endpoints already defined in ADR-018 §30
(`/api/orders/[order_id]/shipping-rates`, `…/shipping-buy`, `…/shipping-label`,
`…/shipping-refund`, `…/mark-shipped`, and `/api/shipping/*`). Only the **calling UI** changes.

---

## Consequences

- **Positive**
  - Sales becomes simpler and sale-focused; shipping gets a dedicated, list-driven workspace
    with status filters across all orders (easier batch fulfillment).
  - Zero schema/API churn — lower risk; the proven rate-shopping modal is reused verbatim.
- **Negative**
  - Shipping context (ship-to) is now split across two screens (editable in Sales, read-only in
    Shipping) — mitigated by clear read-only mirroring.
  - Adds a top-level tab (minor nav growth).

## Notes

- **Cross-references to update when WS-F is implemented (.cursorrules §1b):** ADR-031 (remove
  Shipping/Package/Label sections from the order-detail spec; point to ADR-080; keep
  `seller_shipping_cost` as read-only mirror in Financials), ADR-024 (add `/shipping` tab and
  route; note shipping no longer in order detail), ADR-074 (the EasyPost workflow's UI home is the
  Shipping module, not Sales), ADR-009 + ui-design.md (tab bar), ADR-021 (mark-shipped rule
  unchanged, now invoked from Shipping), ADR-035 (`/shipping?orderId=` — done), ADR-037 (`shipping`
  activity links — done), `.cursorrules` (tab list, "what's built"). **No ADR-017 change.**
