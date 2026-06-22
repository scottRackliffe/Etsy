# Ticket WS-D3 — Split "awaiting shipment" dashboard KPI (paid vs unpaid)

> **Status: DONE — merged 2026-06-22.** Awaiting-shipment dashboard KPI split into paid vs unpaid.

| Field | Value |
|-------|-------|
| Status | **OPEN** — Tier 1, queue **#4** |
| Workstream | **D** — dashboard UX (owner req **1.i**). |
| Source ADR | **ADR-016** (dashboard KPIs), ADR-031 (order status/payment/shipping fields). |
| Recommended model | Budget/mid model. |
| Complexity | Small. |
| Risk | Low — additive KPI fields + UI. |
| Depends on | None. |

---

## Problem

The dashboard has a single **"Awaiting shipment"** KPI (`unshipped_orders` = paid + not shipped).
The owner wanted this **split**:

1. **Paid, awaiting shipment** — ready to pack/ship.
2. **Unpaid, not yet shipped** — waiting on payment before (or while) fulfillment.

Today unpaid orders appear only under a separate **Unpaid orders** KPI (all unpaid, not just
unshipped). There is no explicit "unpaid and awaiting shipment" slice on the dashboard.

## Goal

Replace or augment the single awaiting-shipment tile so both populations are visible at a glance,
each linking to the appropriate filtered list.

## Locked metrics (active orders only, `order_status = 'active'`)

| Metric | SQL intent |
|--------|------------|
| `awaiting_shipment_paid` | `payment_status = 'paid'` AND (`shipping_date` IS NULL OR empty) — **same as today's `unshipped_orders`** |
| `awaiting_shipment_unpaid` | `payment_status != 'paid'` AND (`shipping_date` IS NULL OR empty) |

## Locked UX

- In **Needs attention**, show **two** KPI tiles (or one combined tile with two labeled counts —
  prefer **two tiles** for clarity):
  - **"Ready to ship"** (paid, unshipped) → link `/shipping` (or `/orders?…` if shipping list is empty).
  - **"Unpaid, not shipped"** → link `/orders` with payment=unpaid + shipping=not_shipped filters
    (add query params if missing; document params in report).
- Retire or relabel the old single **"Awaiting shipment"** tile to avoid duplicate numbers.
- Preserve tone/warning colors when counts > 0.

## What to build

1. Extend `getOrderKpis()` / `GET /api/dashboard` with `awaiting_shipment_unpaid` (and rename or
   alias `unshipped_orders` → `awaiting_shipment_paid` in the API response; keep backward compat or
   update dashboard consumer only).
2. Update dashboard KPI row in `src/app/(app)/dashboard/page.tsx`.
3. Ensure target pages honor filter query params (minimal: document if user must click filters manually).

## Do NOT

- Change mark-shipped or mark-paid business rules.
- Merge unpaid-shipped into payment-reminder link (that is **WS-D2**).

## Files

- Edit: `src/lib/dashboard.ts`, `src/app/api/dashboard/route.ts` (if separate from lib),
  `src/app/(app)/dashboard/page.tsx`.
- Optional: `src/app/(app)/orders/page.tsx` (read filter query params).

## Acceptance criteria

- [ ] Dashboard shows distinct counts for paid-unshipped vs unpaid-unshipped active orders.
- [ ] Each count links to a sensible filtered view (shipping or orders).
- [ ] Numbers reconcile with manual SQL on a sample DB.
- [ ] `npm run build` passes; no new lint.

## Kickoff prompt

> Implement `documents/tickets/WS-D3_dashboard-shipment-split-kpi.md`. Split awaiting-shipment into
> paid-ready-to-ship vs unpaid-not-shipped KPIs on the dashboard; extend `getOrderKpis` and wire links.
> Run `npm run build`.
