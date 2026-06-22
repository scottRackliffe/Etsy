# Ticket WS-E6b — Orders editor: preserve draft on sub-action refresh

| Field | Value |
|-------|-------|
| Workstream | **E** — follow-on to WS-E6. |
| Source ADR | **ADR-079**, **ADR-042**; ADR-031 (order detail). |
| Pattern reference | Inventory E5 merge in `InventoryDetailPanel.tsx` + `mergeServerUpdate` / baseline
  pattern from WS-E5. |
| Recommended model | Mid/strong model — subtle state merge, easy to get wrong. |
| Complexity | Medium. |
| Risk | Medium — must refresh server state for badges/totals without silently discarding unsaved
  ship-to/notes/discount edits. |
| Depends on | WS-E6 (done). |

---

## Problem

After WS-E6, immediate-commit sub-actions still refresh the order editor from the server, which
**replaces the entire draft** and can wipe in-progress edits to fields saved only via the sticky
Save bar (ship-to snapshot, `shipping_total`, `tax_total`, `discount_*`, `notes`).

Two mechanisms cause this today:

1. **`editorRefreshTrigger`** in `orders/page.tsx`: `updateOrderInList()` bumps the trigger →
   `OrderEditorShell` calls `panelRef.reload()` → `loadOrder()` → `setDraft(orderToDraft(...))`.
   Triggered after mark paid, mark shipped, void, batch ops, and any `onOrderUpdated` from the
   panel.
2. **Inside `OrderDetailPanel`**: `addLineItem` / `removeLineItem` (and `linkCustomer`) call
   `setDraft(orderToDraft(data.order))` directly after the mutation.

Example failure: user edits **Notes** (unsaved) → clicks **Mark paid** or **Add line item** → notes
edit is lost without warning.

This is the same **draft-reset hazard** class fixed for Inventory in WS-E5 (3-way merge / update
baseline only on same-record refresh). Orders never got that merge.

## Goal

On same-order server refresh from a sub-action, **merge** server updates into the live draft: keep
fields the user has changed since baseline; adopt server values for untouched fields (e.g. new
`subtotal`/`grand_total` after line-item add, `was_paid` after mark paid, refreshed badges data).

Record switch (`orderId` change) must still **full reset** draft + baseline as today.

## Proposed approach (implementer may refine — flag in report if different)

Mirror Inventory E5:

1. In `OrderDetailPanel`, track **`baseline`** (last saved server snapshot) separately from **`draft`**
   (live edits). `isDirty` = draft differs from baseline (today it compares draft to `order` prop —
   align with baseline after merge).
2. **`useEffect([orderId])`**: record switch → reset draft + baseline from fetched order.
3. **`mergeServerUpdate(newOrder)`** (new helper):
   - Update `order` state and list row via `onOrderUpdated`.
   - For each draft field in `DraftFields`, if draft[field] === baseline[field], adopt
     `orderToDraft(newOrder)[field]`; else keep draft[field].
   - Set baseline to `orderToDraft(newOrder)`.
4. Replace full draft resets with `mergeServerUpdate`:
   - `addLineItem`, `removeLineItem`, `linkCustomer` success paths.
   - `loadOrder` when invoked as **reload** (not initial open) — or split `loadOrder` vs
     `reloadOrder` so reload uses merge.
5. In `orders/page.tsx`, prefer passing the updated order into the panel (callback) instead of
   blind `reload()` where the panel already has the new order from the mutation response. If
   `editorRefreshTrigger` remains, it must call a panel **`mergeServerUpdate`** (expose on
   `OrderDetailPanelHandle`) rather than full `loadOrder` reset — **or** remove redundant trigger
   when the panel already merged. Document the choice.

Fields in the saved draft (merge scope): all keys in `orderToDraft` / `DraftFields` (ship-to
fields, totals the user can edit, discount, notes). Read-only display fields (`subtotal`,
`grand_total`, `was_paid`, status badges) always come from server on merge.

## Do NOT

- Do not add a warn/block dialog — merge silently (same product rule as Inventory E5).
- Do not change PATCH payload, line-item APIs, or mark-paid/shipped rules.
- Do not touch Shipping module.

## Files

- Edit: `src/components/sales/OrderDetailPanel.tsx`, `src/app/(app)/orders/page.tsx`.
- Reuse pattern from: `src/components/inventory/InventoryDetailPanel.tsx` (WS-E5 merge).

## Acceptance criteria

- [ ] Unsaved edits to ship-to / notes / discount / editable totals survive **mark paid**, **add/remove
      line item**, and **link customer** on the same order.
- [ ] After those sub-actions, server-derived values update correctly (line-item subtotal/grand_total,
      paid badge, line-item list) without requiring a manual Save of unrelated fields first.
- [ ] Switching to a different order still fully resets the editor.
- [ ] Sticky Save + 3-button guard + void read-only mode unchanged.
- [ ] `var(--ui-*)` only; no API/schema change; `npm run build` passes; no new lint.

## Escalation triggers (STOP and ask)

- Merge cannot reconcile tax auto-calc (manual orders) with user-edited `tax_total` without a
  product rule call.
- `OrderEditorShell` badges (`record` from `SemsScreen`) stay stale after mark paid and cannot
  be fixed without a scaffold change — propose minimal `SemsScreen` sync or lift badges into panel.

## Kickoff prompt

> Implement `documents/tickets/WS-E6b_orders-subaction-draft-merge.md`. Read it + ADR-079/031; follow
> `.cursor/rules/implementer.mdc`. Study Inventory E5 merge in `InventoryDetailPanel.tsx`. Add
> baseline + `mergeServerUpdate` to `OrderDetailPanel`; stop full `setDraft(orderToDraft)` on
> sub-actions; reconcile `editorRefreshTrigger`/`reload()` in `orders/page.tsx` so same-order
> refreshes merge rather than reset. Record switch = full reset. No warn dialog. Run `npm run build`;
> confirm each acceptance checkbox; STOP on escalation triggers.
