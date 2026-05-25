# ADR-028: Shared component adoption — wire existing UI primitives into all pages

## Status

Accepted

## Date

2026-05-24

## Context

The frontend has a complete set of shared UI components (`Button`, `DataTable`, `FormField`/`TextInput`/`SelectInput`, `Modal`, `Toast`/`ToastContainer`, `EmptyState`, `LoadingSpinner`, `Badge`) and shared hooks (`useApi`, `useToast`, `usePagination`). However, none of the tab pages use them. Every page hand-rolls `<button>`, `<table>`, `<input>`, and inline error/success/empty handling, producing inconsistent styling, duplicated markup, and missing accessibility.

## Decision

**Replace all hand-rolled UI elements with the existing shared components and hooks.** Every page must adopt the primitives below. No new component APIs are needed; the existing signatures are sufficient.

---

### Component mapping (exact — no ambiguity)

**Buttons → `Button`**

All `<button>` elements across every page must use the `Button` component.

| Current pattern | Replacement |
|-----------------|-------------|
| `<button className="rounded-lg bg-[var(--ui-accent)] ..." onClick={fn} disabled={busy != null}>` | `<Button variant="accent" busy={busyAction === "action-name"} onClick={fn}>` |
| `<button className="rounded-lg border border-[var(--ui-border)] ..." ...>` | `<Button variant="secondary" ...>` |
| Delete/destructive buttons | `<Button variant="danger" ...>` |
| Primary CTA ("Add item", "Create order", "Create customer") | `<Button variant="accent" size="lg" ...>` |
| Inline text-only links ("Link customer", "View all") | `<Button variant="ghost" ...>` |

**Button variants (canonical list):**

- `accent` / `primary` — primary actions (these are aliases; both resolve to accent styling)
- `secondary` — bordered buttons
- `danger` — destructive actions
- `ghost` — borderless text-only for inline links

Busy state: use the `busy` prop instead of `disabled={busyAction != null}` + conditional text (`"Creating..." : "Create"`). The `Button` renders a spinner automatically when `busy={true}`. Text should remain the non-busy label (e.g., always "Create order", never "Creating...").

**Tables → `DataTable`**

All hand-rolled `<table>` elements on Sales, Customers, and Dashboard must use `DataTable<T>`.

- Define `Column<T>[]` with `key`, `header`, and optional `render` for formatted cells (dates, currency, badges).
- Pass `onRowClick` for row selection.
- Pass `selectedId` for highlight.
- Pass `emptyMessage` for empty state text.
- Dashboard recent-orders table, Sales orders table, Customers table, and Outstanding items table all convert.

**Forms → `FormField` + `TextInput` / `SelectInput`**

All `<input>` and `<select>` elements must wrap in `FormField` for visible labels.

- Every input field gets a `FormField` wrapper with `label` and `htmlFor` matching the input `id`.
- Replace `<input placeholder="Order number" ...>` with `<FormField label="Order number" htmlFor="order-number"><TextInput id="order-number" ... /></FormField>`.
- Replace bare `<select>` with `<FormField label="..."><SelectInput ... /></FormField>`.
- **No placeholder-only labels.** Every field has a visible `<label>`.

**Empty states → `EmptyState`**

All plain-text empty messages (e.g., `<p>No local orders yet.</p>`) must use `EmptyState`.

| Page | Current | Replacement |
|------|---------|-------------|
| Sales | `"No local orders yet."` | `<EmptyState message="No local orders yet. Create one or sync Etsy receipts." />` |
| Customers | `"No customers yet."` | `<EmptyState message="No customers yet. Create one from the panel on the right." />` |
| Dashboard | `"No orders yet."` | `<EmptyState message="No orders found for this shop." />` |
| Inventory | `"Create inventory items..."` | `<EmptyState message="Create your first inventory item to get started." />` |

**Loading → `LoadingSpinner`**

All `"Checking connection..."` and skeleton-only states must include `LoadingSpinner`. Dashboard can retain its skeleton rows but add a centered `LoadingSpinner` above them.

---

### Hook adoption

**`useToast` + `ToastContainer` for transient feedback**

- Add `useToast()` to `AppContext` (or the layout). Render `<ToastContainer>` in the app shell layout.
- **Success messages** (currently routed through `setError()` with green-ish text) must use `addToast("message", "success")`.
- **Transient errors** (non-blocking API failures) use `addToast("message", "error")`.
- **Blocking errors** (OAuth failure, connection failure, critical API error) continue using `ErrorPanel`.
- Remove all `setError({ title: "X saved", message: "..." })` success patterns; replace with `addToast`.

**`useApi` for fetch calls**

- Replace the ad-hoc `fetch` + `try/catch` + `setBusyAction` pattern in each page with `useApi()`.
- The hook provides `{ loading, error, get, post, patch, del }` — pages use these instead of raw fetch.
- `busyAction` state can be derived from `loading` returned by the hook.

**`usePagination` for lists**

- Integrate with `DataTable` on pages that can have more than ~20 records (Sales, Customers, Inventory).
- Render page controls (Previous / Next / page indicator) below the table.
- Default page size: 25.
- See ADR-029 for full pagination spec.

---

### Pages to update

1. **Dashboard** — `DataTable` for orders, `EmptyState`, `Badge` (already used), `LoadingSpinner`.
2. **Sales** — `DataTable` for orders, `Button` for all actions, `FormField`+`TextInput` for create form, `EmptyState`, `useToast` for sync success.
3. **Customers** — `DataTable` for customer list, `Button`, `FormField`+`TextInput` for create/edit forms, `EmptyState`, controlled inputs instead of `defaultValue`+`onBlur`.
4. **Inventory** — `Button` for all actions, `FormField`+`TextInput` for all inputs, `EmptyState`.
5. **Outstanding** — Already uses `Badge`, `LoadingSpinner`, `EmptyState`. Add `DataTable` to replace hand-rolled list.
6. **Reports** — `Button`, `FormField`+`SelectInput` for report type picker.
7. **Config** — `Button`, `FormField`+`TextInput` for all settings inputs. `type="password"` for API key.
8. **Tutorial** — No changes needed.

---

### Migration rules

- One page at a time. Each page is a standalone commit.
- The hand-rolled element and the shared component must not coexist on the same page after migration.
- No new CSS class names — use component props only.
- No visual regressions — layout, spacing, and color must match current appearance (the shared components already use the same CSS variables).

## Consequences

- **Positive**
  - Consistent styling across all pages without per-page CSS.
  - Accessibility: visible labels, focus styles, spinner status, and keyboard support built into components.
  - Reduced per-page code (~30-50% fewer lines per page).
  - Toast notifications replace the confusing error-panel-as-success pattern.
- **Negative**
  - Migration touches every page file — risk of regressions during transition.
  - Component props may need minor additions if edge cases arise (e.g., `TextArea` variant of `FormField`).
