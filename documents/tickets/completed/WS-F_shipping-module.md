# WS-F — Split Shipping into a top-level module

**Status:** ready for implementation
**Size:** ▪▪▪ large
**Created:** 2026-06-21
**Authoritative spec:** **ADR-080** (read it fully first). Supporting: ADR-031 (order detail),
ADR-074 (EasyPost), ADR-021 (mark-shipped rule), ADR-035 (`/shipping?orderId=`), ADR-024 (nav),
ADR-029 (list filters), ui-design.md §1/§2.

**Process:** follow `.cursor/rules/implementer.mdc`. **No DB schema change. No new API
endpoints** (ADR-080 §5). Only UI ownership moves. When done: `npm run build`, report changes,
confirm each acceptance box. **STOP and ask** if you hit any escalation trigger.

---

## 1. Goal (ADR-080)

Create a **new top-level `/shipping` tab** that owns all shipping operations for orders. Remove
the shipping UI from the Sales order-detail panel. All shipping fields stay on the `orders` table;
the proven EasyPost **RateShoppingModal** is reused **verbatim**.

## 2. What moves vs. stays

**Moves out of `sales/OrderDetailPanel.tsx` into the Shipping module** (ADR-080 §1):
- Shipping section: `shipper`, `shipping_date`, `tracking_number`, `shipping_carrier_service`
  (read-only), `shipping_rate_cents` / "Postage paid" (read-only).
- Package dimensions: `package_weight_oz`, `package_length_in`, `package_width_in`,
  `package_height_in` (keep the Config `easypost.default_*` pre-fill behavior).
- Label section + **RateShoppingModal** (Buy & Print / Print / Void / legacy address label) —
  unchanged behavior.
- `seller_shipping_cost` — becomes **editable here** (auto-populated from `shipping_rate_cents`
  on label purchase).
- **"Mark as shipped"** action — moves here, **retaining the ADR-021 rule** (blocked until paid
  unless "Ship anyway" → sets `shipped_without_paid_override`).

**Stays in Sales** (ADR-080 §2):
- Header/status, buyer message, line items, **editable ship-to**, Financials, mark-as-paid,
  void/cancel, notes.
- In Sales **Financials**, show `seller_shipping_cost` **read-only** (it is now set in Shipping).

## 3. Shipping module layout (ADR-080 §3)
- List-first master view (use current shared components — `DataTable`/`FilterChipRow`/etc.):
  order #, customer, ship-to city/state, paid status, **shipping status**, carrier/service,
  tracking, ship date.
- **Shipping status filter chips:** `Needs label` · `Label purchased` · `Shipped` · `All`
  (derive from `label_url`/`shipping_date`); search by order #/customer (ADR-029).
- Selected-order **shipping panel**: relocated Shipping section + Package dims + seller shipping
  cost + Label section + RateShoppingModal + **read-only ship-to** + Mark-as-shipped.
- Exclude void/cancelled by default.
- Deep link `/shipping?orderId={id}` selects that order (ADR-035 pattern — mirror how
  `/orders?orderId=` works in `orders/page.tsx`).

## 4. Files to create / edit (stay within this list)
**Create:**
- `src/app/(app)/shipping/page.tsx` — the new module (list + shipping panel + deep-link handling).
- `src/components/shipping/ShippingPanel.tsx` — the relocated shipping UI (extract from
  `OrderDetailPanel.tsx`). Reuse `@/components/sales/RateShoppingModal` by import (do not fork it).

**Edit:**
- `src/components/sales/OrderDetailPanel.tsx` — remove the shipping/package/label sections + the
  mark-shipped action + RateShoppingModal usage; add a **read-only** `seller_shipping_cost` row in
  Financials.
- `src/components/shell/TabBar.tsx` — add **Shipping** tab immediately after Sales/Orders.
- `src/lib/activity-display.ts` — change the `shipping` deep-link target from `/orders?orderId=`
  to `/shipping?orderId=` (the `order` case stays `/orders`). *(This file is otherwise idle right
  now — safe to edit.)*
- Docs: ADR-080 (flip Status note to implemented if you wish), ADR-031, ADR-024, ADR-074,
  `documents/ui-design.md`, `.cursorrules` (tab list + "what's built").

## 5. DO NOT TOUCH (active in a parallel WS-H/AICOST chat — will cause conflicts)
- `src/lib/sqlite.ts`, `migrations/*` (no schema change is needed here anyway).
- `src/lib/inventory.ts`, `src/lib/records.ts`, `src/lib/listing-*.ts`, `src/lib/ai-config.ts`.
- `src/components/inventory/**`, `src/app/(app)/inventory/page.tsx`.
- `src/app/(app)/settings/page.tsx`.
- In `.cursorrules`: only edit the **tab/nav list** and **"what's built/pending"** lines. Do NOT
  edit the inventory-columns block or the settings-keys block (being edited elsewhere).
- Reports "Sales"/brand text; `/api/*` routes; DB tables; entity_type enums; code identifiers.

## 6. Acceptance criteria
- [ ] New `/shipping` tab renders; appears in the tab bar right after Sales.
- [ ] Sales order-detail no longer shows Shipping/Package/Label sections or Mark-as-shipped;
      `seller_shipping_cost` shows read-only in Sales Financials.
- [ ] Shipping module lists orders with the status filter chips + search; selecting an order shows
      the full relocated shipping panel with read-only ship-to.
- [ ] RateShoppingModal (buy/print/void) works exactly as before, now from Shipping.
- [ ] Mark-as-shipped retains the ADR-021 paid/override rule.
- [ ] `/shipping?orderId=` deep link selects the order; `shipping` activity rows link to
      `/shipping?orderId=`.
- [ ] No schema/API changes; `npm run build` passes; no lint errors.
- [ ] Docs updated (ADR-080/031/024/074, ui-design.md, `.cursorrules` tab list + what's built).
