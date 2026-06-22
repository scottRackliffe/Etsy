# Ticket WS-E3 — Migrate Receipts to SEMS

| Field | Value |
|-------|-------|
| Workstream | **E** — SEMS rollout, entity 2 of 5. |
| Source ADR | **ADR-079**, **ADR-042**; ADR-018 §31 (receipts API), ADR-076 (VendorPicker). |
| Pattern reference | **`src/app/(app)/vendors/page.tsx`** + `src/components/sems/*`. |
| Recommended model | **Sonnet-tier** — mostly additive; the screen currently lacks list search/filter/pagination and uses a non-standard API list shape, so there's net-new wiring. |
| Complexity | Medium-Large (832-line monolith; expandable rows + OCR + line-item linking). |
| Risk | Medium — must preserve OCR create, line-item linking, bidirectional unlink, delete guards; adds missing list infra + deep link. |

---

## Goal

Refactor `/receipts` to the SEMS scaffold, preserving the OCR→review create flow, the line-item
inventory-linking sub-UI, VendorPicker OCR hints, and receipt↔purchase bidirectional unlink.

## Standard SEMS rollout rules (as in the Vendors pilot)

1. Full-width list → full-width editor (replaces list) + compact breadcrumb; Region 3 below editor.
2. **Add list infra it lacks (ADR-029):** search box, filter chips, sort, **pagination**. NOTE: the list
   API returns **`{ receipts: [] }`**, not the standard `{ items, pagination }` — either adapt the
   client mapping or update the route to the standard envelope (prefer adapting the client to avoid API
   churn; if you change the route, keep it backward-compatible). Use `DataTable`.
3. Pinned **"+ Add new receipt (manual)"** first affordance + a separate **"Scan receipt"** button
   (OCR is a distinct create path — see below). Trailing **Edit/Delete** row actions; double-click = edit.
   Replace the expandable-row pattern with the editor.
4. Editor uses **`useDirtyTracking` + `useSemsEditorGuard`** + the sticky Cancel/Save bar. The receipt
   **header** fields become the dirty draft.
5. Delete: add a **`ConfirmDialog`**; preserve the **409 `HAS_LINKED_ITEMS`** rule + the disabled-when-linked behavior.
6. **Deep link `?receiptId=`** is emitted by the activity log but **not handled today** — wire it via
   `controllerRef.openRecord(...)` (mirror Vendors `?vendorId=`).
7. `var(--ui-*)` only.

## Editor fields (make existing records fully editable)

Header draft: `vendor_id`/`vendor_name` (VendorPicker), `purchase_date`, `reference_number`,
`shipping_price`, `notes`. **Today only vendor is editable on existing receipts** (date/reference/notes
are create-only) — the refactor should make the full header editable in the SEMS editor (the PATCH API
already supports it). `receipt_image`: show the stored image if present.

## Immediate-commit sub-actions — keep OUTSIDE the main dirty draft (Region 3 / editor body)

- **Line items** (`receipt_items`): add/edit/remove description + cost.
- **Inventory linking per item:** "Link existing" (inline pick list w/ filter + sort), "Create item"
  (POST inventory → auto-link), "Unlink". These mutate `purchases` + inventory and stay explicit actions
  (`PATCH /api/receipts/[id]/items/[itemId]`). Preserve the **bidirectional unlink** (deleting the
  purchase from inventory clears `receipt_items.inventory_id`).
- **VendorPicker** OCR hint + fuzzy match + inline vendor create.

## OCR create path (preserve)

"Scan receipt" → file picker → `POST /api/receipts/ocr` → opens the **Add-New editor pre-filled** with
the OCR draft (vendor hint, date, reference, notes, line items) + image preview. Manual "Add new
receipt" opens a blank editor with one empty line-item row. On save → `POST /api/receipts`.
**Decide + note:** whether to finally persist the OCR `receipt_image` and `shipping_price` on save
(currently captured but never sent) — recommended: persist both.

## Files

- Edit: `src/app/(app)/receipts/page.tsx` (decompose the editor/line-items into the SEMS editor;
  optionally extract a `ReceiptEditor` component).
- Reuse: `VendorPicker`, `src/components/sems/*`, `DataTable`, `ConfirmDialog`, `FilterChipRow`,
  `PaginationBar`.

## Acceptance criteria

- [ ] `/receipts` uses the SEMS scaffold; full-width list with **search + filter chips + pagination**,
      Add-New (manual) first affordance + separate **Scan receipt** button, Edit/Delete row actions,
      double-click-to-edit.
- [ ] Receipt header fully editable in the editor via the sticky Save bar (`useDirtyTracking` +
      `useSemsEditorGuard`); 3-button guard works on dirty navigation.
- [ ] OCR create opens a pre-filled editor; manual create opens a blank editor; both save correctly.
- [ ] Line-item add/edit/remove + link existing / create item / unlink + bidirectional unlink preserved
      as immediate actions.
- [ ] Delete uses ConfirmDialog and keeps the 409 `HAS_LINKED_ITEMS` rule.
- [ ] `?receiptId=` deep link opens the record.
- [ ] List API shape handled (mapped to items/pagination); `var(--ui-*)` only; `npm run build` passes; no new lint.

## Escalation triggers (STOP and ask)

- Changing the list route envelope risks other callers — confirm before editing the API.
- The OCR-image / shipping_price persistence decision is unclear.
- Line-item linking side-effects can't be cleanly separated from header Save.

## Kickoff prompt

> Implement `documents/tickets/WS-E3_sems-receipts.md`. Read it, **ADR-079**, and the **Vendors pilot**
> first; follow `.cursor/rules/implementer.mdc`. Migrate `/receipts` to the SEMS scaffold: add list
> search/filter/pagination (mapping the `{receipts:[]}` response), Add-New (manual) + a separate Scan
> receipt button, Edit/Delete row actions, double-click-to-edit; make the full receipt header editable
> via `useDirtyTracking` + the sticky Save bar with `useSemsEditorGuard`; preserve OCR→review create,
> line-item add/edit/remove, inventory link/create/unlink + bidirectional unlink, VendorPicker OCR hints,
> the 409 delete guard (now via ConfirmDialog), and wire the missing `?receiptId=` deep link. `var(--ui-*)`
> only. Run `npm run build`, report changes, confirm each acceptance checkbox, STOP on any escalation trigger.
