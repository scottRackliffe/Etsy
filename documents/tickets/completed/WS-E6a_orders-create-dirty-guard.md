# Ticket WS-E6a — Orders create form: SEMS dirty guard

> **Status: DONE — merged 2026-06-22.** Orders create form wired into the SEMS dirty guard.

| Field | Value |
|-------|-------|
| Status | **OPEN** — Tier 1, queue **#5** |
| Workstream | **E** — follow-on to WS-E6. |
| Source ADR | **ADR-079** (SEMS), **ADR-042** (3-button unsaved dialog). |
| Pattern reference | `InventoryCreateForm` in `src/app/(app)/inventory/page.tsx` (create path). |
| Recommended model | Budget model — small, mechanical. |
| Complexity | Small. |
| Risk | Low — UX consistency only; no API/schema change. |
| Depends on | WS-E6 (done). |

---

## Problem

WS-E6 migrated `/orders` to SEMS and added `OrderCreateForm` for Add-New create. The **edit**
path is correct (`OrderEditorShell` → `SemsEditor` + `useSemsEditorGuard` + working Save on the
3-button dialog). The **create** path is inconsistent with other SEMS entities:

- No `useDirtyTracking`
- No `useSemsEditorGuard`
- Not wrapped in `SemsEditor` (plain div + Cancel / Create order buttons)

If the user starts filling in order number, customer, total, or ship-to and navigates away (tab
change, deep link, ⌘K search, breadcrumb), they get no **Save changes / Discard changes / Keep
editing** dialog — unlike Inventory and Customers create.

## Goal

Bring `OrderCreateForm` to the same SEMS create pattern as Inventory/Customers: dirty tracking,
3-button guard with a working Save path, sticky Save bar via `SemsEditor`.

## What to build

1. Refactor `OrderCreateForm` in `src/app/(app)/orders/page.tsx` (or extract to a small component
   in the same file — match Inventory style):
   - `useDirtyTracking` over the create fields (order number, customer, ship-to, total).
   - `useSemsEditorGuard({ isDirty, onSave: save, onDiscard: discard })` where `save()` runs the
     existing POST create logic and returns `Promise<boolean>`; `discard()` resets to empty defaults.
   - Wrap body in `SemsEditor` with `saveLabel="Create order"`, `onSave` → save then `done()` on
     success, `onCancel` → `requestClose` from `renderEditor`.
2. Thread `requestClose` from `SemsScreen` `renderEditor({ record, requestClose, done })` into
   `OrderCreateForm` (today only `done` is passed).
3. Preserve all existing create behavior: auto-number fetch, customer + ship-to picker, tax
   auto-calc preview, POST payload, `onCreated` + deferred `openRecord(newOrder)`.

## Do NOT

- Do not change create API or validation rules.
- Do not touch `OrderDetailPanel` or the edit-path guard (already correct).
- Do not touch Shipping module or any API route.

## Files

- Edit: `src/app/(app)/orders/page.tsx` only (unless a tiny extract improves readability — stay in
  one file if possible, per Inventory precedent).

## Acceptance criteria

- [ ] Create mode uses `SemsEditor` sticky bar with **Create order** as the primary save action.
- [ ] Leaving a dirty create form shows the **3-button** dialog; **Save changes** runs create and
      succeeds or stays on validation error; **Discard** clears the form; **Keep editing** stays.
- [ ] Auto-number, customer + ship-to picker, tax auto-calc, and post-create `openRecord` unchanged.
- [ ] Edit path (`OrderEditorShell`) unchanged.
- [ ] `var(--ui-*)` only; no API/schema change; `npm run build` passes; no new lint.

## Escalation triggers (STOP and ask)

- Create cannot return `Promise<boolean>` without blocking on validation (e.g. missing order number).

## Kickoff prompt

> Implement `documents/tickets/WS-E6a_orders-create-dirty-guard.md`. Read it + ADR-079/042; follow
> `.cursor/rules/implementer.mdc`. Match the Inventory create pattern: `useDirtyTracking` +
> `useSemsEditorGuard` + `SemsEditor` on `OrderCreateForm`; thread `requestClose` from
> `renderEditor`; preserve auto-number/customer/ship-to/tax/create-then-open behavior. Edit path
> untouched. `var(--ui-*)` only. Run `npm run build`; confirm each acceptance checkbox.
