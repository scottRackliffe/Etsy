# ADR-079: Standard Entity Management Screen (SEMS) — one consistent form/list pattern

## Status

Accepted

_Implemented WS-E1–E6 (2026-06-21): scaffold built, piloted on Vendors, then rolled out to all
entities (Customers, Receipts, Expenses, Inventory, Orders). Editor presentation locked (see
§2/§Notes)._

## Date

2026-06-21

## Context

Every entity screen (Inventory, Sales, Customers, Vendors, Receipts, Expenses, …) is structured
differently today. Although each collects different fields, the **scaffolding** should be
identical so the app feels consistent and predictable, and so a less-experienced implementer can
build any new entity screen by following one template. The owner also wants a **strict
dirty-form guard** everywhere and a **consistent Save location** (today the Save control is in
different places, and the unsaved-changes popup offers no Save).

This ADR establishes the **Standard Entity Management Screen (SEMS)** and reconciles it with the
existing frontend ADRs (024, 028, 029, 030, 031, 032, 042, 061, 062).

Program reference: `archive/audits/PROGRAM_2026-06-21_major-enhancements.md` workstream **E** (LOCKED
approach: define standard → reconcile ADRs → **pilot on Vendors** → debug → roll out).

## Decision

All entity management screens follow **one** structure with **three** regions and **one** set of
interaction rules. Detail editing remains **inline** (no detail sub-routes — consistent with
ADR-024); the change is the *standardized scaffold*, not a return to routed detail pages.

---

### 1. Region 1 — Record list (always visible, full width)

- **Full-width, single-spaced** list of all records for the entity (not a narrow master column).
  Uses the shared `DataTable` (ADR-028) with the search/filter/sort/pagination behaviors of
  ADR-029.
- **Filter bar:** entity-appropriate filters arranged in **one or two horizontal rows** (search
  box + the entity's relevant filters/chips). Filters are **not** stacked vertically unless a
  grouping has explicit meaning. (This corrects today's vertically stacked filters.)
- **First row = "Add New":** the very first row of the list is a persistent **"+ Add New
  &lt;Entity&gt;"** affordance that opens a blank editor (Region 2). This removes the need for a
  separate always-open create panel and keeps creation consistent everywhere.
- **Existing record rows:** show the entity's key columns, and at the **end of each row** two
  trailing icon actions: **Edit** (pencil) and **Delete** (trash). **Double-clicking a row =
  Edit** (opens that record in the editor).
- **Row order:** "Add New" pinned first; records follow per the active sort (ADR-029).

### 2. Region 2 — Editor (Add / Edit)

- Opens **inline** as a **full-width editor panel that replaces the list**, with the list collapsing
  to a **compact breadcrumb header** ("← All &lt;entities&gt; / &lt;record&gt;") while editing.
  **(LOCKED 2026-06-21 in the WS-E1 Vendors pilot — used for all entities.)** Implemented by
  `SemsScreen` (`src/components/sems/SemsScreen.tsx`); the editor body + sticky action bar by
  `SemsEditor`.
- **All fields** for the entity, laid out to **remove dead space** — a readable, efficient grid
  (e.g. responsive multi-column `FormField` groups, ADR-028). **All current validation,
  required-field, and dropdown behaviors are preserved** (ADR-021, entity ADRs).
- **Consistent Save placement (canonical):** every editor has a **sticky action bar** with the
  **primary `Save` button right-aligned** and a **`Cancel` button to its left**. The action bar is
  **pinned to the bottom of the editor region** and remains visible while scrolling a long form.
  No entity places Save anywhere else.
- **Cancel** discards edits (subject to the dirty guard, Section 4) and returns to the list.
- **Save** validates, persists via the entity's API (`POST` for new, `PATCH` for existing),
  shows a success toast, marks the form clean, and returns to the list with the record selected.

### 3. Region 3 — (Optional) record context

Entities that today show supplementary panels (e.g. activity history per ADR-037, purchase
history, notes) render them **below the editor** as clearly separated groupings. These are
read-mostly and do not change the scaffold.

---

### 4. Interaction rules — dirty-form guard (strict, app-wide)

Extends ADR-042. The guard applies to **every** SEMS editor and any other form with unsaved
changes.

- **Dirty detection:** per ADR-042 §2 (`useDirtyTracking`, deep-equality vs saved snapshot).
- **Blocking:** while a form is dirty, the user **cannot** leave it — in-app navigation, tab
  switches, deep-link selection of another record, opening "Add New", or closing the editor —
  **without resolving** via the unsaved-changes dialog. Browser unload uses the native
  `beforeunload` warning (best-effort; content not customizable).
- **Unsaved-changes dialog — THREE choices (updated; supersedes ADR-042 §3 two-button form):**
  1. **Save changes** (primary): runs the same validate-and-save as the editor's Save button.
     - On success → toast **"Changes saved."**, clear dirty flag, then proceed with the original
       navigation.
     - On **validation failure** → the dialog closes and the form stays open with field-level
       errors shown (navigation is cancelled); a toast explains "Fix the highlighted fields to
       save." (This resolves the original reason ADR-042 omitted Save: validation edge cases are
       handled by keeping the user on the form.)
  2. **Discard changes:** revert to saved snapshot, clear dirty flag, toast **"Changes
     cancelled."**, then proceed with the original navigation.
  3. **Keep editing:** dismiss the dialog, cancel the navigation, return focus to the form at the
     prior location.
- **Outcome reporting (owner requirement 1.5.a/1.5.b):** the user always sees one of: *changes
  saved* message, *changes cancelled* message, or is *returned to the form location prior to the
  attempted navigation*. The dirty flag is set clean after Save or Discard.

### 5. Delete behavior

- Delete uses **ConfirmDialog** (ADR-032) and follows **referential-integrity rules (ADR-022)**:
  - Entities that support deactivation use **soft-delete** (e.g. `is_active = 0` or a status
    change) — Vendors (ADR-076), Customers/Inventory where blocked by references.
  - Where a hard delete with cascade to children is the agreed behavior (e.g. receipts → receipt
    items, ADR-017), delete the record and its children transactionally.
  - If a record cannot be deleted due to references, show the standard 409 guidance (e.g. "retire
    instead"), never a raw error.

### 6. Rollout plan (locked)

1. Build the SEMS scaffold as reusable components (list + editor + action bar + dirty guard
   wrapper).
2. **Pilot on Vendors** (smallest, self-contained; ADR-076).
3. Fix imperfections; update this ADR + affected ADRs with any refinements.
4. Roll out entity-by-entity: Customers → Receipts → Expenses → Inventory → Sales (Inventory and
   Sales are the largest; do them last). Each migration preserves that entity's fields/validation.

---

## Reconciliation with existing ADRs (.cursorrules §1b)

- **ADR-024 (frontend architecture):** SEMS is the standard for **management screens**. Detail
  editing stays **inline (no detail sub-routes)** — consistent with ADR-024. What changes: the
  scaffold becomes list-first/full-width with "Add New" as the first row and a standardized
  inline editor + sticky Save bar, rather than per-screen bespoke master-detail. ADR-024 to be
  annotated to reference ADR-079 as the canonical screen pattern.
- **ADR-030 (inventory detail) / ADR-031 (order detail):** their **field definitions, validation,
  and entity-specific behavior remain authoritative**; their **screen scaffolding now follows
  SEMS**. (ADR-031 shipping content also moves out per ADR-080.) To be annotated.
- **ADR-042 (unsaved changes):** §3 dialog updated from two buttons to **three** (Save changes /
  Discard changes / Keep editing) with the validation-failure handling above. See ADR-042 edit.
- **ADR-028 (shared components):** SEMS is built from `DataTable`, `Button`, `FormField`,
  `SelectInput`, `Modal`, `ConfirmDialog`, `Toast`, `EmptyState`.
- **ADR-029 (search/filter/sort/pagination):** the list region uses these behaviors; filter bar
  is horizontal (1–2 rows).
- **ADR-032 (confirm dialogs):** delete + the unsaved-changes dialog use ConfirmDialog.
- **ADR-062 (inline editing on lists):** still allowed for quick edits, but full edits use the
  SEMS editor; the two must not conflict (inline edit commits immediately and is not "dirty" in
  the editor sense).
- **ADR-061 (responsive):** SEMS must degrade to a single-column stack on small screens (list
  then editor); sticky Save bar remains visible.
- **ADR-059 (empty states), ADR-060 (help tooltips):** reused inside SEMS.

## Consequences

- **Positive**
  - One predictable pattern across the whole app; far easier to build/maintain new entity screens
    and to hand to a less-skilled implementer.
  - Strict, uniform dirty guard prevents lost work and gives the long-requested Save-in-popup.
  - Consistent Save location removes "where do I save?" confusion.
- **Negative**
  - Large migration: every entity screen is refactored (phased; piloted on Vendors first).
  - Some entity-specific affordances must be fitted into the standard scaffold.
  - Temporary inconsistency while rollout is in progress (mitigated by entity-by-entity order).

## Notes

- The exact editor presentation was decided during the Vendors pilot and is now **LOCKED**:
  full-width editor panel that **replaces** the list, with the list collapsing to a compact
  breadcrumb header while editing. All entities use this.
- **Implementation (WS-E1, 2026-06-21):**
  - Scaffold: `src/components/sems/SemsScreen.tsx` (Region 1 list + Add-New first affordance +
    trailing Edit/Delete actions + double-click-to-edit + guarded mode switch), `SemsEditor.tsx`
    (Region 2 body + Region 3 context slot + sticky Cancel/Save action bar), `useSemsEditorGuard.ts`
    (wires `isDirty`/save/discard into the unsaved-changes guard).
  - The 3-button dialog lives in `src/components/ui/UnsavedChangesDialog.tsx`; `UnsavedChangesContext`
    gained `registerSaveHandler()` and renders its own `ToastContainer` (mirrors `UndoRedoProvider`).
    When no save handler is registered the dialog falls back to its original 2-button form, so
    non-SEMS dirty forms are unchanged.
  - Pilot: Vendors screen refactored to the scaffold (Add-New first row, full-width editor, sticky
    Save bar, `useDirtyTracking`), preserving all fields, name-required validation, ZIP lookup,
    deactivate/reactivate, purchase history, and the `?vendorId=` deep link.
- **Cross-references to annotate at implementation:** ADR-024, ADR-030, ADR-031, ADR-042 (done
  here), ADR-028/029/032/061/062, ui-design.md, `.cursorrules` (frontend pattern + "what's
  built").
