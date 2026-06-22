# Ticket WS-E5 — Migrate Inventory to SEMS

| Field | Value |
|-------|-------|
| Workstream | **E** — SEMS rollout, entity 4 of 5. **Largest + riskiest surface.** |
| Source ADR | **ADR-079**, **ADR-042**; ADR-030 (inventory detail), 033/026 (pictures), 081/082 (lifecycle/quality), 083/084 (shot list/measure), 038 (profit), 072 (Coach create). |
| Pattern reference | **`src/app/(app)/vendors/page.tsx`** + `src/components/sems/*`. |
| Recommended model | **Strong model (top tier).** This is the hybrid form with **multiple autonomous mutation zones** + create externalized to Listing Coach. Do **not** delegate to a budget model. |
| Complexity | Very Large (37 inventory API routes; detail panel + 6 sub-panels). |
| Risk | **High** — draft-reset-after-side-mutation hazard; many immediate-commit subsystems. |

---

## Goal

Refactor `/inventory` to the SEMS scaffold while preserving the full detail editor, all picture/AI
subsystems, lifecycle/quality controls, profit/costs, CSV import, batch ops, and deep links. Because of
the risk profile, **prioritize behavior preservation over aggressive cleanup.**

## ⚠️ Critical hazard to design around first

Pictures, condition pictures, shot list, measurement, other-costs, vendor purchases, AI lifecycle
(generate/quality), and inline list edits **all persist immediately and independently of the main form
Save**, and several of them refresh `selectedItem`, which **resets the detail draft via a `useEffect` on
the `item` prop**. In the current always-visible layout this can silently wipe an unsaved draft.
**The SEMS migration must define a clear rule:** the main editor's dirty draft (text fields) is the only
thing the dirty guard tracks; sub-actions are explicit immediate commits that must **not** clobber a
dirty main draft without the user knowing. Decide and document the interaction (e.g., merge server
updates into the draft baseline without discarding user edits, or warn). **Flag this in your plan before coding.**

## Standard SEMS rollout rules (as in the Vendors pilot)

1. Full-width list → full-width editor (replaces list) + compact breadcrumb. Today list + detail +
   picture/AI panels are a single vertical stack always shown together; SEMS collapses the list when
   editing. Region 3 (below editor) hosts pictures/AI/activity panels.
2. **List:** keep all columns (Item #, Description, Category, Status, Price, **Margin**, **Quality**),
   keep Status/Category/**Listing-phase** chips + search + pagination + the **client-side Quality sort**.
   Trailing **Edit/Delete** row actions; double-click = edit. Preserve inline status/price edits (immediate
   PATCH) in list mode.
3. **Create:** "Add New Item" / ⌘N currently **redirects to `/listing-coach`** (canonical create path).
   **Keep that** — Add-New routes to Listing Coach rather than opening a blank inline editor (note this
   deviation from the generic Add-New pattern; it's intentional per ADR-072).
4. Editor uses **`useDirtyTracking` + `useSemsEditorGuard`** + the sticky Save bar. Keep `data-save-button`,
   `useEntityDraft` autosave/recovery, `patchWithUndo` + `If-Match` inside `onSave`. Wire
   `registerSaveHandler` so the **3-button guard** gets a working Save path (today only 2-button discard).
5. Delete: keep `ConfirmDialog` + skip-items-with-orders rule; batch delete preserved.
   **Batch:** reuse the existing **`batchSelection?: DataTableSelection`** prop on `SemsScreen` (added
   in WS-E2, forwarded to `DataTable.selection`) with `useBatchSelection`; render `BatchActionsBar`
   above `SemsScreen` in list mode. Do NOT reinvent checkbox wiring.
6. Deep link `?itemId=` via `controllerRef.openRecord(...)`; keep recently-viewed tracking + AppContext
   `selectedItem` sync.
7. `var(--ui-*)` only; no API/schema change.

## Editor field groups to preserve

Identity, Financials (+ profit/margin/ROI read-only row + **OtherCostsManager**), Dates, Condition,
Etsy listing details (when-made, taxonomy picker, materials, weight/dims), Listing content
(title/description/tags + strategy/story/clarity/attributes/pricing-notes/checklist) with
**`ListingLifecycleControls`** on top. Preserve all UI required-field markers + server validation.

## Immediate-commit subsystems — keep as Region-3 panels, OUTSIDE the dirty draft

- **PictureGrid** (20 slots, upload/drag/reorder/delete + video), **ConditionPictureGrid** (5 slots).
- **ShotListPanel** (AI generate/regenerate), **MeasurementPhotoPanel** (measure → confirm → annotate;
  may write dimension fields server-side).
- **ListingLifecycleControls** (Evaluate Data / Generate Listing / Evaluate Quality), **Generate listing
  content**, listing quality.
- **OtherCostsManager** (per-item costs), **vendor purchase CRUD** ("Where I bought this").
- **ActivityTimeline**, **CSV import** (`InventoryImportModal`, ⌘⇧I).

## Files

- Edit: `src/app/(app)/inventory/page.tsx`, `src/components/inventory/InventoryDetailPanel.tsx`.
- Reuse (do not rewrite): `PictureGrid`, `ConditionPictureGrid`, `ShotListPanel`, `MeasurementPhotoPanel`,
  `OtherCostsManager`, `ListingQualityScore`, `InventoryImportModal`, `TaxonomyCategoryPicker`,
  `VendorPicker`, `ActivityTimeline`, `useEntityDraft`, `src/components/sems/*`.

## Acceptance criteria

- [ ] `/inventory` uses the SEMS scaffold; full-width list with all columns + Status/Category/Phase chips
      + search + pagination + Quality client-sort; Edit/Delete row actions; double-click-to-edit; inline
      status/price edits preserved in list mode.
- [ ] **Add New / ⌘N still routes to Listing Coach** (documented intentional deviation).
- [ ] Full detail editor preserved; Save on the **sticky bar**; `useDirtyTracking` + `useEntityDraft`
      (autosave/recovery) + `patchWithUndo`/`If-Match` preserved; **3-button** guard has a working Save.
- [ ] **Draft-reset hazard addressed**: sub-action server refreshes do not silently discard unsaved main-draft edits.
- [ ] Pictures (main + condition + video), shot list, measurement, lifecycle/quality, generate content,
      other-costs, vendor purchases, activity, CSV import all preserved as immediate-commit panels.
- [ ] Batch select/status/retire/delete preserved (list mode); `?itemId=` deep link + recently-viewed +
      AppContext sync preserved.
- [ ] `var(--ui-*)` only; no API/schema change; `npm run build` passes; no new lint.

## Escalation triggers (STOP and ask)

- The draft-reset-vs-immediate-commit interaction needs a product decision (warn vs merge vs block).
- Collapsing the list while editing breaks batch selection, keyboard nav, or picture drag-drop.
- A picture/AI sub-action's concurrency (`If-Match`) conflicts with the main save baseline.
- The ticket can't be completed without touching an inventory API route.

## Kickoff prompt

> Implement `documents/tickets/WS-E5_sems-inventory.md`. Read it, **ADR-079**, ADR-030/081/082/083/084,
> and the **Vendors pilot** first; follow `.cursor/rules/implementer.mdc`. **First produce a short plan**
> for the draft-reset-vs-immediate-commit hazard (§"Critical hazard") and STOP for confirmation if it
> needs a product decision. Then migrate `/inventory` to the SEMS scaffold preserving: all list
> columns/chips/search/pagination/Quality-sort/inline edits; Add-New routing to Listing Coach; the full
> detail editor on a sticky Save bar with `useDirtyTracking` + `useEntityDraft` + `patchWithUndo`/`If-Match`
> + working 3-button guard; and all immediate-commit panels (pictures/condition/video, shot list,
> measurement, lifecycle/quality, generate content, other-costs, vendor purchases, activity, CSV import),
> batch ops, `?itemId=` deep link, recently-viewed + AppContext sync. `var(--ui-*)` only; no API/schema
> changes. Run `npm run build`, report changes, confirm each acceptance checkbox, STOP on any escalation trigger.
