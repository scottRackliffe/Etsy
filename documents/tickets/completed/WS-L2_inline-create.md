# Ticket WS-L2 — Inline inventory create (basics + hero photo)

| Field | Value |
|-------|-------|
| Workstream | **L** — listing consolidation, 2 of 6. |
| Source ADR | **ADR-085** (§6), ADR-079 (SEMS), ADR-030 (inventory detail), ADR-049 (⌘N). |
| Recommended model | Budget/mid model OK — mechanical, pattern already exists. |
| Complexity | Medium. |
| Risk | Low-medium. |
| Depends on | WS-E5 (inventory already on SEMS). Independent of L1 but pairs with L3. |

---

## Goal

Replace the "Add New routes to `/listing-coach`" behavior on Inventory with the **standard inline SEMS
create** used by every other entity: a blank inline editor capturing **basic data + the hero photo**,
then Save. After save, the item opens in the detail editor where the lifecycle button (Generate →
Quality → Publish) takes over.

## What to build

1. In `src/app/(app)/inventory/page.tsx`, change the SEMS `onAddNew` (currently
   `() => router.push("/listing-coach")`) to open a **blank inline editor** via the SEMS controller
   (`openRecord(null)` / the scaffold's create path), matching Vendors/Customers.
2. Wire **⌘N** to the same create action (it currently maps to the Coach redirect).
3. **Create form scope** (keep minimal per ADR-085 §6): `item_number` (auto-suggest via
   `GET /api/inventory/next-number`), `description`, `condition_code`, `purchase_cost` (optional),
   and a **single hero photo** upload (paste/drag/file-picker → `picture_1`). Everything else
   (full Etsy fields, all listing content, remaining photos) is filled later in the detail editor /
   Generate step. Do not require price.
4. On create: `POST /api/inventory` then store the hero photo via the existing pictures API; then
   open the new item in the detail editor (so the user lands on the lifecycle button).
5. Preserve duplicate detection (`check-duplicate`) on description blur in create mode, and the
   3-button dirty guard (`useDirtyTracking` + `useSemsEditorGuard`).

## Do NOT

- Do not delete the `/listing-coach` route/components yet (L6).
- Do not change the detail editor's existing field groups (L3 adds the ported affordances).

## Files

- Edit: `src/app/(app)/inventory/page.tsx`, `src/components/inventory/InventoryDetailPanel.tsx`
  (create-mode field subset if needed).
- Reuse: `src/components/sems/*`, `PictureGrid` (single-slot/hero usage), `useEntityDraft`,
  `DuplicateWarning`.

## Acceptance criteria

- [ ] "Add new item" and **⌘N** open a blank inline editor (no navigation to `/listing-coach`).
- [ ] Create captures item_number + description + condition + optional cost + hero photo; **price not required**.
- [ ] Saving creates the item, stores the hero photo, and opens the detail editor on the lifecycle button.
- [ ] Duplicate detection + 3-button dirty guard work in create mode.
- [ ] `var(--ui-*)` only; no API/schema change; `npm run build` passes; no new lint.

## Escalation triggers (STOP and ask)

- The SEMS scaffold can't open a blank create editor for Inventory without a scaffold change beyond
  what WS-E5 added.
- Storing the hero photo before the item has an id requires an API/flow change.

## Kickoff prompt

> Implement `documents/tickets/WS-L2_inline-create.md`. Read it + **ADR-085 §6**, ADR-079, and the
> Vendors/Customers SEMS create flow; follow `.cursor/rules/implementer.mdc`. Switch Inventory Add-New
> + ⌘N from the `/listing-coach` redirect to an inline SEMS create capturing basics + a hero photo
> (no price required), then open the new item in the detail editor. Keep duplicate detection + the
> 3-button guard. Don't delete the Coach yet. Run `npm run build`; confirm each acceptance checkbox;
> STOP on any escalation trigger.
