# Ticket WS-E6 — Migrate Orders to SEMS

| Field | Value |
|-------|-------|
| Workstream | **E** — SEMS rollout, entity 5 of 5 (final). |
| Source ADR | **ADR-079**, **ADR-042**; ADR-031 (order detail), 021 (mark-shipped rule), 039 (tax), 040 (batch), 080 (shipping split), 052/066 (history/repeat badge), 078 (comms). |
| Pattern reference | **`src/app/(app)/vendors/page.tsx`** + `src/components/sems/*`. |
| Recommended model | **Strong model.** Line-item sub-CRUD + split persistence + batch + void read-only + WS-F boundary. |
| Complexity | Large (master-detail page + `OrderDetailPanel` + line items + many actions). |
| Risk | High — must preserve void/cancel-by-status, line items, financial recompute, comms, batch, deep links. |

---

## Goal

Refactor `/orders` to the SEMS scaffold, preserving the order editor, line-item sub-CRUD, financial
recompute, status/payment/shipping actions, comms, batch ops, and the WS-F shipping boundary.

## Standard SEMS rollout rules (as in the Vendors pilot)

1. Full-width list → full-width editor (replaces list) + compact breadcrumb; Region 3 below editor.
   Replace the side-by-side master-detail layout.
2. **List:** keep columns (Order #, Date, Total, **Paid toggle**, **Shipper select**, Shipped) and the
   inline Paid/Shipper edits (immediate `patchWithUndo`), keep Status/Payment/Shipping/Source chips +
   search + sort + pagination. Trailing **Edit/Delete-equivalent** row actions; double-click = edit.
   (Orders are never deleted — the row trailing action is **Edit** + status actions, not Delete.)
3. **Create:** today a top inline quick-add bar (auto order # + customer dropdown + total + optional
   ship-to). Convert to the **Add-New editor** (blank order editor) **or** keep the quick-add bar —
   recommended: Add-New opens a minimal create editor; **note your choice**. Preserve auto-number,
   customer + ship-to address picker, tax auto-calc, manual defaults.
4. Editor uses **`useDirtyTracking` + `useSemsEditorGuard`** + the sticky Save bar; add `data-save-button`;
   keep `useEntityDraft` autosave/recovery + `patchWithUndo`/`If-Match` in `onSave`. Wire
   `registerSaveHandler` so the **3-button guard** has a working Save (today only 2-button discard).
5. **Void/cancel** = status change only (never delete rows); preserve the **void read-only** editor mode
   (all draft fields disabled when `order_status === "void"`).
6. Deep link `?orderId=` + `?sync=etsy` + `?search=` via `controllerRef.openRecord(...)`; keep
   recently-viewed + AppContext `selectedOrderId` sync.
7. `var(--ui-*)` only; no API/schema change.

## Editor fields to preserve

Display-only header (badges): order #, date, status, payment/was_paid, source, etsy_receipt_id,
override-audit badge, timestamps. **Saved draft (`PATCH /api/orders/{id}`):** ship-to snapshot fields
(+ "Copy from customer"), `shipping_total`, `tax_total`, `discount_total`, `discount_reason` (dropdown +
add-new), `notes`. Read-only financials: `subtotal`, `grand_total` (server recompute), and the WS-F
**read-only `seller_shipping_cost` mirror + "Edit in Shipping →" link**. Preserve **tax auto-calc** for
manual orders only.

## Immediate-commit sub-actions — keep OUTSIDE the main dirty draft

- **Line items**: add (modal → pick list), delete (confirm). Mutations are immediate and recompute
  server `subtotal`/`grand_total`. (Inline qty/price edit is API-only today; leave as-is unless trivial.)
- **Mark paid** (`/mark-paid`), **void/cancel** (PATCH status), **mark-shipped** — note WS-F: the
  Shipping tab is the primary home, but Orders retains the batch/single mark-shipped modal; keep it as-is.
- **Reports** (invoice / thank-you PDF), **print queue**, **comms** (`SendCommunicationModal`,
  source-gated: payment reminder = manual+unpaid only; thank-you channel by source).
- **Link customer**, **repeat-customer badge**, **order history is on Customers** (n/a here),
  **ActivityTimeline**.

## Keep as page-level chrome (list mode)

- **Batch multi-select** + `BatchActionsBar` (mark paid, mark shipped, print queue, void) — list mode only.
  Reuse the existing **`batchSelection?: DataTableSelection`** prop on `SemsScreen` (added in WS-E2,
  forwarded to `DataTable.selection`) with `useBatchSelection`; do NOT reinvent checkbox wiring.
- **Sync Etsy** header button + `?sync=etsy` auto-trigger.

## Files

- Edit: `src/app/(app)/orders/page.tsx`, `src/components/sales/OrderDetailPanel.tsx` (becomes the SEMS
  editor body). Reuse `RepeatCustomerBadge`, `SendCommunicationModal`, `ActivityTimeline`,
  `DraftRecoveryBanner`, `src/components/sems/*`, `DataTable`, `FilterChipRow`, `PaginationBar`,
  `BatchActionsBar`, `ConfirmDialog`, `Modal`.
- Do **not** touch the Shipping module (WS-F) — only keep the read-only mirror + link.

## Acceptance criteria

- [ ] `/orders` uses the SEMS scaffold; full-width list with all columns + inline Paid/Shipper edits +
      all chips + search + pagination; row Edit action; double-click-to-edit.
- [ ] Create preserved (auto-number, customer + ship-to picker, tax auto-calc, manual defaults) via the
      chosen Add-New path (documented).
- [ ] Editor saved on the **sticky bar**; `useDirtyTracking` + `useEntityDraft` + `patchWithUndo`/`If-Match`
      preserved; **3-button** guard has a working Save; **void read-only** mode preserved.
- [ ] Line items (add/delete + server recompute), mark paid, void/cancel, mark shipped, reports, print
      queue, comms (source-gated), link customer, repeat badge, activity all preserved.
- [ ] Read-only `seller_shipping_cost` mirror + "Edit in Shipping →" intact; Shipping module untouched.
- [ ] Batch ops + Sync Etsy preserved (list chrome); `?orderId=`/`?sync=etsy`/`?search=` deep links +
      recently-viewed + AppContext sync preserved.
- [ ] `var(--ui-*)` only; no API/schema change; `npm run build` passes; no new lint.

## Escalation triggers (STOP and ask)

- The create-as-editor vs keep-quick-add-bar decision is unclear.
- Line-item recompute / financial preview can't be reconciled with the single Save draft.
- Batch selection can't coexist with the scaffold's row actions.
- Completing the ticket would require touching the Shipping module or an orders API route.

## Kickoff prompt

> Implement `documents/tickets/WS-E6_sems-orders.md`. Read it, **ADR-079**, ADR-031/021/040/080, and the
> **Vendors pilot** first; follow `.cursor/rules/implementer.mdc`. Migrate `/orders` to the SEMS scaffold:
> full-width list with all columns + inline Paid/Shipper edits + chips/search/pagination + row Edit +
> double-click-to-edit; convert create to an Add-New editor (or keep the quick-add bar — note the choice)
> preserving auto-number/customer+ship-to picker/tax auto-calc; make `OrderDetailPanel` the editor body on
> a sticky Save bar with `useDirtyTracking` + `useEntityDraft` + `patchWithUndo`/`If-Match` + working
> 3-button guard + void read-only mode; preserve line items (add/delete + recompute), mark paid,
> void/cancel, mark shipped, reports, print queue, source-gated comms, link customer, repeat badge,
> activity, batch ops, Sync Etsy, the read-only `seller_shipping_cost` mirror + Shipping link, and the
> `?orderId=`/`?sync=etsy`/`?search=` deep links. Do not touch the Shipping module or any API route.
> `var(--ui-*)` only. Run `npm run build`, report changes, confirm each acceptance checkbox, STOP on any
> escalation trigger.
