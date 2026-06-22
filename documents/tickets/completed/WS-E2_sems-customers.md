# Ticket WS-E2 — Migrate Customers to SEMS

| Field | Value |
|-------|-------|
| Workstream | **E** — SEMS rollout, entity 1 of 5 (after the WS-E1 scaffold + Vendors pilot). |
| Source ADR | **ADR-079** (scaffold spec), **ADR-042** (3-button guard), ADR-003/053/065/066/052 (customer model, merge, notes, repeat badge, history). |
| Pattern reference | **`src/app/(app)/vendors/page.tsx`** (the locked SEMS pilot) + `src/components/sems/*`. |
| Recommended model | **Sonnet-tier with care** — mechanical scaffold swap, but the current screen uses **per-field blur-save**, which must be converted to a single draft + sticky Save (the subtle part). |
| Complexity | Large (~1,300-line page, 6 sub-panels). |
| Risk | Medium-High — replaces blur-save with batch save; must preserve undo/409, merge, addresses, notes, history, deep links. |

---

## Goal

Refactor the Customers screen to the SEMS scaffold (`SemsScreen` + `SemsEditor` + `useSemsEditorGuard`),
matching the Vendors pilot, **preserving every existing behavior**.

## Standard SEMS rollout rules (apply exactly as in the Vendors pilot)

1. **Layout:** full-width list (Region 1) → full-width editor that **replaces** the list with a compact
   breadcrumb header (Region 2); read-mostly context panels render **below the editor** (Region 3).
   Remove the separate always-open "Add customer" sidebar.
2. **List:** keep `DataTable` columns, horizontal filter bar (search + Active/Inactive chips), sort,
   pagination. Add the pinned **"+ Add new customer"** first affordance, trailing **Edit/Delete** row
   actions, and **double-click = edit**. Single click selects/highlights only.
3. **Editor dirty model:** **replace per-field blur-save** and the manual dirty flag with a single
   form object tracked by **`useDirtyTracking`**, and wire **`useSemsEditorGuard({ isDirty, onSave,
   onDiscard })`**. Save is the **sticky Cancel/Save bar** (`SemsEditor`); `data-save-button` is on the
   Save button (⌘S). On successful Save → toast, mark clean, `done()` back to the list with the row
   selected. **Keep the `If-Match` + undo (`patchWithUndo`) behavior inside `onSave`.**
4. **3-button guard:** because `useSemsEditorGuard` registers a save handler, leaving a dirty editor
   shows Save changes / Discard changes / Keep editing automatically. Remove the screen's local
   2-button `ConfirmDialog` for row switching (the scaffold handles it).
5. **Delete:** keep `ConfirmDialog` + the existing **409-if-orders** referential rule; never show a raw
   error.
6. **Deep link:** `?customerId=` opens the record through `controllerRef.current.openRecord(...)`
   (mirror the Vendors pilot), preserving fetch-if-not-on-page + URL clean.
7. **Colors `var(--ui-*)` only; no API/schema changes.**

## Immediate-commit sub-actions — keep OUTSIDE the main dirty draft

These persist immediately today and must stay explicit actions (NOT folded into the editor's
Save/dirty draft), rendered in the editor or Region 3:
- **Ship-to addresses** (add / set-default / delete) → `/api/customers/[id]/addresses`, `/api/addresses/[id]`.
- **Pinned note** (`customers.notes`) — keep its dedicated Save control (separate from the main draft) OR fold into the main editor draft; **pick one and note it** (recommended: fold `notes` into the main editor draft for consistency).
- **Interaction notes** (typed add/delete) → `/api/customers/[id]/notes`, `/api/customer-notes/[id]`.
- **Order history** timeline (read-only, deep-links to `/orders?orderId=`).
- **Activity timeline**, **repeat-customer badge**.

## Fields to preserve (editor)

Main editor (today PATCHes per field): `first_name`*, `last_name`*, `phone` (formatPhone on blur),
`address_1`*, `address_2`, `city`*, `state` (2-char), `postal_code`* (ZIP lookup on blur), `country`
(2-char, default US). **Email** stays **create-only** (not in the edit form) unless you decide
otherwise — note the decision. Preserve ZIP lookup autofill + invalid-postal warning, phone formatting.

## Create flow

"Add new customer" opens a blank editor with the full field set **including the required `email`**
(create-only field). Preserve: **duplicate check** (`/api/customers/check-duplicate` + `DuplicateWarning`)
and **"Copy as new"** (prefill + clone billing + ship-to addresses). "Copy as new" from a selected
record opens the Add-New editor pre-filled.

## Keep as page-level chrome (above `SemsScreen`, list mode)

- **Merge customers** + **Find duplicates** buttons and their modals (`CustomerMergeModal`,
  `CustomerDuplicatesModal`).
- **Batch select + delete** (`BatchActionsBar`) — list mode only. (The Vendors pilot had no batch;
  add batch affordances in the list region without breaking the scaffold, or surface as a list toolbar.)

## Files

- Edit: `src/app/(app)/customers/page.tsx`, `src/components/customers/CustomerDetailEditor.tsx`
  (fold into the SEMS editor or keep as the editor body).
- Reuse: `CustomerOrderHistory`, `CustomerMergeModal`, `CustomerDuplicatesModal`, `RepeatCustomerBadge`,
  `ActivityTimeline`, `customer-detail-draft.ts`, `customer-merge-fields.ts`.

## Acceptance criteria

- [ ] Customers uses `SemsScreen`/`SemsEditor`/`useSemsEditorGuard`; full-width list, Add-New first row,
      Edit/Delete row actions, double-click-to-edit, compact breadcrumb while editing.
- [ ] Main editor saved via the **sticky Save bar** (no per-field blur-save); `useDirtyTracking` drives
      dirty; `If-Match`/undo preserved in `onSave`.
- [ ] Leaving a dirty editor shows the **3-button** dialog with a working Save path.
- [ ] Create (incl. required email), duplicate check, "Copy as new" (+ address clone), ZIP lookup,
      phone formatting all work.
- [ ] Ship-to addresses, pinned note, typed interaction notes, order history, activity timeline, repeat
      badge all preserved (as immediate-commit sub-actions / Region 3).
- [ ] Merge, Find duplicates, and batch delete preserved (list-mode chrome).
- [ ] `?customerId=` deep link opens the editor; delete keeps the 409 rule + ConfirmDialog.
- [ ] `var(--ui-*)` only; no API/schema change; `npm run build` passes; no new lint.

## Escalation triggers (STOP and ask)

- Converting blur-save to batch save would change observed save semantics in a way that affects undo or
  autosave/draft-recovery behavior.
- Batch selection can't coexist with the scaffold's row actions without UX conflict.
- The pinned-note vs main-draft decision is unclear.

## Kickoff prompt

> Implement `documents/tickets/WS-E2_sems-customers.md`. Read it, **ADR-079**, and the **Vendors pilot
> (`src/app/(app)/vendors/page.tsx`)** first; follow `.cursor/rules/implementer.mdc`. Migrate the
> Customers screen to `SemsScreen`/`SemsEditor`/`useSemsEditorGuard`, converting per-field blur-save to a
> single `useDirtyTracking` draft + sticky Save (keep `If-Match`/undo in onSave), preserving every field,
> create+duplicate-check+copy-as-new, ZIP lookup, phone formatting, ship-to addresses, typed notes,
> pinned note, order history, activity, repeat badge, merge/duplicates, batch delete, and the
> `?customerId=` deep link. `var(--ui-*)` only; no API/schema changes. Run `npm run build`, report
> changes, confirm each acceptance checkbox, and STOP on any escalation trigger.
