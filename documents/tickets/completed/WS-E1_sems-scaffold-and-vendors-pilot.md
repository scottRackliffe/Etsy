# Ticket WS-E1 — SEMS scaffold + 3-button dirty dialog + Vendors pilot

| Field | Value |
|-------|-------|
| Workstream | **E** — Standard Entity Management Screen (LOCKED in `archive/audits/PROGRAM_2026-06-21_major-enhancements.md`). This is **phase 1 of N** (scaffold + pilot). |
| Source ADR | **ADR-079** (authoritative — read in full). Reconciles ADR-024, 028, 029, 030, 031, **042** (2-button → 3-button), 032, 059, 060, 061, 062. |
| Recommended model | **T3 / stronger** (`gpt-5.3-codex` or `claude-opus-4-8-thinking-high`) for THIS ticket — the dirty-guard/3-button dialog flow is subtle and becomes the template for the whole app. The **follow-on rollout tickets (WS-E2..E6) are Sonnet-tier** once this locks the pattern. |
| Complexity | Medium-Large (new reusable scaffold components + context change + full refactor of one screen). |
| Risk | Medium-High — changes the **app-wide** unsaved-changes dialog (every form uses `UnsavedChangesContext`). Must preserve existing 2-button behavior for non-SEMS forms (graceful fallback). |
| Sequencing | Do first in WS-E. After it merges and the editor presentation is **locked in ADR-079**, generate WS-E2..E6. |

---

## Goal

1. Build a **reusable SEMS scaffold** (list region + inline editor + sticky Save bar + dirty guard)
   that any entity screen can adopt, per ADR-079.
2. Upgrade the app-wide unsaved-changes dialog from **2 buttons** to **3** (Save changes / Discard
   changes / Keep editing) with the validation-failure handling in ADR-079 §4 — **without breaking**
   forms that don't register a save handler.
3. **Pilot the scaffold on the Vendors screen** (`src/app/(app)/vendors/page.tsx`), preserving every
   current field, validation, ZIP lookup, deactivate/reactivate, purchase-history panel, and the
   `?vendorId=` deep link.
4. **Lock the editor presentation** in ADR-079 (recommended default below) so WS-E2..E6 can follow it.

**Read ADR-079 in full first. This ticket is the build plan; the ADR is the spec.**

---

## Locked decisions (from ADR-079 — do not deviate)

- **List-first, full-width** record list (not a narrow master column). Shared `DataTable` (ADR-028)
  with ADR-029 search/filter/sort/pagination.
- **Filter bar is horizontal** (1–2 rows: search box + the entity's chips/filters). No vertical
  stacking.
- **First row = "+ Add New &lt;Entity&gt;"** — a persistent pinned first row that opens a **blank**
  editor. This replaces any separate always-open create panel (Vendors' right-hand "Add vendor"
  panel is removed).
- **Row actions:** each existing row shows the entity's key columns and **trailing Edit (pencil) +
  Delete (trash) icon actions**. **Double-click a row = Edit.**
- **Editor presentation (LOCK THIS, recommended default):** a **full-width editor panel below the
  list**; while editing, the **list collapses to a compact header** (e.g. "Vendors · editing
  &lt;name&gt;" with a Back-to-list affordance). Use the SAME presentation for all entities. Record
  this choice in ADR-079 §Notes/§2.
- **Sticky action bar (canonical Save location):** every editor has a bottom **sticky action bar**
  with **`Cancel` (left) and primary `Save` (right)**, visible while scrolling a long form. No entity
  puts Save anywhere else.
- **Save** = validate → persist (`POST` new / `PATCH`-or-`PUT` existing per the entity API) → success
  toast → mark clean → return to list with the record selected. **Cancel** = discard (subject to the
  dirty guard) → return to list.
- **Dirty guard (strict, app-wide)** per ADR-079 §4 / ADR-042: while dirty, the user cannot leave
  (nav, tab switch, deep-link selecting another record, opening Add New, closing the editor) without
  resolving via the 3-button dialog. Browser unload uses native `beforeunload` (best-effort).
- **3-button dialog outcomes** (ADR-079 §4):
  1. **Save changes** (primary) → run the editor's validate+save. On success: toast **"Changes
     saved."**, clear dirty, then proceed with the original navigation. On **validation failure**:
     close the dialog, **cancel** the navigation, keep the form open with field errors, toast "Fix the
     highlighted fields to save."
  2. **Discard changes** → revert to saved snapshot, clear dirty, toast **"Changes cancelled."**, then
     proceed with the navigation.
  3. **Keep editing** → dismiss, cancel navigation, return focus to the form.
- **Delete** uses `ConfirmDialog` (ADR-032) + referential-integrity rules (ADR-022). Vendors =
  **soft-delete** (deactivate), with reactivate. Never show a raw error; show standard 409 guidance.

---

## Reuse map (do NOT reinvent)

| Need | Reuse |
|------|-------|
| Dirty detection | `src/hooks/useDirtyTracking.ts` (`current/setCurrent/isDirty/markClean/resetBaseline`) — replace the Vendors manual `editDirty` boolean with this. |
| App-wide guard + dialog | `src/context/UnsavedChangesContext.tsx` (`isDirty/setFormDirty/confirmLeave/registerOnDiscard`) — **extend** it (see below). |
| Nav interception | `confirmLeave()` is already called by `TabBar`, deep-links, global search, recently-viewed, outstanding. Keep those call sites working. |
| Beforeunload | `src/hooks/useBeforeUnload.ts`. |
| List + columns | `src/components/ui/DataTable.tsx` (`SortState`, `columns`, `onRowClick`, `keyboardNav`, `selectedId`). |
| Filters/pagination | `FilterChipRow`, `PaginationBar`, `usePagination`, `useDebouncedValue`. |
| Form fields | `FormField`, `SelectInput`, `DropdownWithAddNew`. |
| Confirm/delete | `ConfirmDialog` (keep 2-button for deletes). |
| Buttons/toast/empty | `Button`, `useToast`, `EmptyState`, `Modal`. |
| Vendor API | `/api/vendors` (GET list), `/api/vendors/:id` (GET/PUT/DELETE), `/api/vendors` POST, `/api/vendors/:id/purchases`, `/api/vendors/categories`. **No API changes in this ticket.** |

---

## Files to create

1. `src/components/sems/SemsScreen.tsx` — the orchestrator that manages **mode** (`list` | `editing`),
   collapses the list to a compact header while editing, and renders the list region and editor
   region. Suggested contract (implementer may refine, keep behaviors as AC):
   ```ts
   type SemsScreenProps<T> = {
     entityLabel: string;              // "Vendor"
     entityLabelPlural: string;        // "Vendors"
     columns: DataTableColumn<T>[];    // key columns (Edit/Delete actions appended by the scaffold)
     data: T[];
     getId: (row: T) => number;
     getRowTitle: (row: T) => string;  // for compact header + ConfirmDialog
     sort: SortState; onSortChange: (s: SortState | null) => void;
     filters?: React.ReactNode;        // horizontal filter bar content (search + chips)
     pagination: { page; pageSize; total; onPageChange };
     // editor:
     renderEditor: (ctx: { record: T | null; close: () => void }) => React.ReactNode;
     onDelete?: (row: T) => void;      // opens ConfirmDialog; soft/hard per entity
     emptyState?: React.ReactNode;
   };
   ```
   - Renders the pinned **"+ Add New &lt;Entity&gt;"** first row → calls `renderEditor({record:null})`.
   - Appends trailing **Edit/Delete** icon actions to each row; **double-click row = Edit**.
   - Switching record / Add New / closing while dirty must route through `confirmLeave()`.
2. `src/components/sems/SemsEditor.tsx` — full-width editor shell: optional summary/header slot,
   `children` (the entity's fields), and a **sticky bottom action bar** (`Cancel` left, `Save` right).
   Props: `title`, `isDirty`, `busy`, `saveDisabled`, `onSave`, `onCancel`. Sets/clears the global
   dirty flag and registers save+discard handlers via the hook below.
3. `src/components/sems/useSemsEditorGuard.ts` — wires an editor instance into
   `UnsavedChangesContext`: registers the editor's `save` (returns `Promise<boolean>`) and `discard`
   handlers, sets `setFormDirty(isDirty)`, and unregisters on unmount. (Builds on `registerOnDiscard`
   + the new `registerSaveHandler`.)
4. `src/components/ui/UnsavedChangesDialog.tsx` — the **3-button** dialog (Save changes / Discard
   changes / Keep editing), built from `Modal` + `Button` (mirrors `ConfirmDialog` styling). Primary =
   Save changes (accent). Shows a busy state on Save.

## Files to edit

5. `src/context/UnsavedChangesContext.tsx` — extend:
   - Add `registerSaveHandler(handler: () => Promise<boolean>): () => void` (single active editor;
     store in a ref).
   - Replace the inline `ConfirmDialog` with `UnsavedChangesDialog`. If a save handler **is**
     registered → show 3 buttons; if **not** → show 2 buttons (Discard / Keep editing) so existing
     non-SEMS dirty forms behave exactly as today (**back-compat is an AC**).
   - `confirmLeave()` keeps returning `Promise<boolean>` (true = proceed). New internal flow:
     - **Save changes** → `await saveHandler()`. `true` → toast "Changes saved." (via existing toast
       mechanism), run discard cleanup not needed, `setFormDirty(false)`, resolve **true**. `false`
       (validation failed) → close dialog, resolve **false** (stay), toast "Fix the highlighted
       fields to save."
     - **Discard changes** → run `discardHandlers`, `setFormDirty(false)`, toast "Changes cancelled.",
       resolve **true**.
     - **Keep editing** → resolve **false**.
   - Keep `registerOnDiscard` working. Use the app toast (`useToast`) — if the provider can't use the
     hook directly, wire a minimal toast call consistent with the codebase.
6. `src/app/(app)/vendors/page.tsx` — **refactor to SEMS** (the pilot):
   - Remove the separate right-hand "Add vendor" panel; creation now via the **Add New** first row.
   - One editor (Add or Edit) rendered through `SemsScreen.renderEditor` using `SemsEditor`'s sticky
     Save bar. **Drop the manual `editDirty` boolean**; use `useDirtyTracking` over the vendor form
     object.
   - Preserve **all** fields + layout density, **name-required** validation, **ZIP lookup**
     (city/state autofill + warning), **deactivate/reactivate**, **purchase history** (render below the
     editor as Region 3), summary badges, and the **`?vendorId=` deep link** (selecting a vendor while
     dirty must route through `confirmLeave`).
   - Delete (Deactivate) via `ConfirmDialog` as today; keep reactivate.
   - Filters stay horizontal (search + status chips) — already close; ensure single row.

## Docs to update

- `documents/adr/0079-standard-entity-management-screen.md` — **lock** the editor presentation
  (full-width panel below list; list collapses to compact header) in §2/§Notes; note the scaffold
  components exist and the Vendors pilot is complete.
- `documents/adr/0042-unsaved-changes-guard-and-draft-recovery.md` — confirm §3 reflects the 3-button
  dialog (the ADR text already describes it; ensure consistency with the implemented component +
  the 2-button fallback for forms without a save handler).
- `documents/adr/0024-frontend-component-architecture.md` — annotate: SEMS (`src/components/sems/*`)
  is the canonical management-screen scaffold; detail editing stays inline (no sub-routes).
- `documents/ui-design.md` — note the standard list+editor pattern.
- `.cursorrules` — add `src/components/sems/*` to the frontend pattern notes and mark WS-E1
  (SEMS scaffold + Vendors pilot) under "what's built".

## Acceptance criteria

- [ ] New `src/components/sems/` scaffold exists (`SemsScreen`, `SemsEditor`, `useSemsEditorGuard`) and
      a 3-button `UnsavedChangesDialog`.
- [ ] Vendors screen uses the scaffold: full-width list, horizontal filter bar, pinned **+ Add New
      Vendor** first row opening a blank editor; existing rows show trailing **Edit/Delete** icons;
      **double-click row = edit**.
- [ ] Vendor editor shows all current fields with a **sticky bottom action bar** (Cancel left, Save
      right) that stays visible while scrolling; **Save** validates (name required), persists, toasts
      success, clears dirty, returns to list with the record selected; **Cancel** returns to list.
- [ ] Dirty guard: editing a vendor then attempting to switch records / open Add New / switch tabs /
      follow a `?vendorId=` deep link shows the **3-button** dialog. **Save changes** persists then
      proceeds (or, on validation failure, stays on the form with field errors + toast); **Discard
      changes** reverts + proceeds + toast "Changes cancelled."; **Keep editing** stays put.
- [ ] **Back-compat:** a dirty form that does NOT register a save handler (any non-SEMS form still on
      the old flow) shows the **2-button** dialog (Discard / Keep editing) and behaves as before.
- [ ] Vendor ZIP lookup, deactivate/reactivate, purchase-history panel, summary badges, and
      `?vendorId=` deep link all still work.
- [ ] Soft-delete (Deactivate) via `ConfirmDialog`; referential rules unchanged; no raw errors.
- [ ] `var(--ui-*)` colors only; standard error envelope unaffected; no API/schema changes.
- [ ] `npm run build` passes; no new lint; existing dirty-guard call sites (TabBar, global search,
      recently-viewed, outstanding deep links) still compile and function.

## Out of scope (separate WS-E rollout tickets, generated after this locks the pattern)

- Migrating **Customers (E2) → Receipts (E3) → Expenses (E4) → Inventory (E5) → Orders (E6)** to SEMS.
- Any field/validation/API changes to any entity.
- Inline list-cell quick-edit (ADR-062) changes — leave as-is; ensure it doesn't conflict with SEMS
  (inline edits commit immediately and are not "dirty" in the editor sense).

## Escalation triggers (STOP and ask)

- Making the provider use `useToast` causes a provider-ordering problem (toast provider mounted below
  `UnsavedChangesProvider`) — confirm the toast wiring approach before proceeding.
- The 2-button fallback can't be cleanly preserved for existing callers — surface it rather than
  changing their behavior.
- Any vendor field/validation can't be represented in the standardized editor without losing behavior.

## Kickoff prompt

> Implement ticket `documents/tickets/WS-E1_sems-scaffold-and-vendors-pilot.md`. Read it AND **ADR-079**
> (`documents/adr/0079-standard-entity-management-screen.md`) in full first, and follow
> `.cursor/rules/implementer.mdc`. Build the reusable SEMS scaffold (`src/components/sems/SemsScreen`,
> `SemsEditor`, `useSemsEditorGuard`), add a 3-button `UnsavedChangesDialog`, and **extend
> `UnsavedChangesContext`** with a registered async save handler — keeping the existing **2-button
> behavior as a fallback** for forms that don't register one. Then **refactor the Vendors screen** to
> the scaffold (Add New as first row, full-width list, sticky Cancel/Save bar, `useDirtyTracking`),
> preserving every field, name-required validation, ZIP lookup, deactivate/reactivate, purchase
> history, and the `?vendorId=` deep link. Lock the editor presentation (full-width panel below the
> list; list collapses to a compact header) in ADR-079. Use `var(--ui-*)` colors only; no API/schema
> changes. Update the listed docs, then run `npm run build`. Report what you changed and confirm each
> acceptance-criteria checkbox. STOP and ask if any escalation trigger fires.
