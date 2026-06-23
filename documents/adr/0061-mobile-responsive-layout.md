# ADR-061: Mobile-Responsive Layout

## Status

Accepted

## Date

2026-05-24

## Context

Mobile responsiveness is mentioned only briefly in existing documents ("tab bar scrolls horizontally on mobile") but no comprehensive mobile layout has been designed. Users managing their Etsy business on a phone or tablet — checking orders, looking up inventory, or reviewing outstanding items — currently face an unoptimized desktop layout. A mobile-responsive design is necessary for usability across devices.

## Decision

### Breakpoints

Per `documents/frontend-architecture.md`:

| Name    | Range      | Tailwind prefix       |
| ------- | ---------- | --------------------- |
| Mobile  | < 768px    | (default / `max-md:`) |
| Tablet  | 768–1024px | `md:`                 |
| Desktop | > 1024px   | `lg:`                 |

### Component-level responsive behavior

#### Tab bar

- **Desktop/Tablet:** Full tab bar, all 8 tabs visible
- **Mobile:** Horizontal scroll with `-webkit-overflow-scrolling: touch`; active tab indicator (underline) always visible; tabs do not wrap to second line
- Tab labels: full text on desktop/tablet; abbreviated on mobile if needed (e.g., "Outstanding" → "Outstanding", "Tutorial & Tips" → "Tips")

#### Header

- **Desktop:** Full app name text + Etsy connection badge + notification indicators
- **Mobile:** Hide app name text; show app icon only (saves horizontal space). Keep connection status badge (compact dot) and print queue icon. Hamburger menu not needed — tabs handle navigation.

#### SEMS entity pages (Orders, Inventory, Customers, Vendors, Expenses, Receipts, …)

All entity screens use the SEMS scaffold (ADR-079): a full-width record list; selecting or adding a
record opens an inline editor that **replaces** the list (no side-by-side master-detail panel).

- **Desktop / Tablet:** Full-width list; the inline editor replaces it, with the list collapsed to a
  breadcrumb header and a sticky Cancel/Save bar.
- **Mobile:** Single column. List first; opening a record shows the full-screen editor with a back
  breadcrumb; the **sticky Save bar stays visible** (ADR-079 §Reconciliation). Long editors stack
  vertically; sections may use accordion headers.
- URL does not change for selection (state managed in-component, "no detail sub-routes" per ADR-024).

#### DataTable

- **Desktop:** Full table with all columns visible
- **Tablet:** Horizontal scroll enabled; no column hiding
- **Mobile:**
  - Horizontal scroll wrapper with `overflow-x: auto`
  - First column (typically `item_number` or `order_number`) is sticky (`position: sticky; left: 0`) with `--ui-card-bg` background to prevent content overlap
  - Minimum column widths enforced to prevent unreadable compression
  - Alternative: card-based layout for tables with many columns (render each row as a card with label:value pairs). Decision per page — Sales and Inventory use card layout on mobile; Customers uses compact table.

#### Forms

- **Desktop:** May use multi-column layout (2-column grid)
- **Tablet:** 2-column grid maintained
- **Mobile:** Single column, full width; all form fields stack vertically
- Submit/action buttons: full width on mobile, right-aligned on desktop

#### PictureGrid (ADR-033)

- **Desktop:** 5-column grid (20 slots, scrollable)
- **Tablet:** 3-column grid
- **Mobile:** 2-column grid (already specified in ADR-033)
- Drag-to-reorder: disabled on mobile; replaced with "Move up" / "Move down" buttons on each picture slot

#### Modals

- **Desktop/Tablet:** Centered overlay with backdrop, max-width 600px
- **Mobile:** Full-screen modal (no backdrop margin); close button in top-right corner; content scrollable

#### Config page

- **Desktop:** Card grid layout (2 columns)
- **Tablet:** 2-column grid maintained
- **Mobile:** Single column stack; each config section as a full-width card

#### Dashboard

- **Desktop:** Widget grid (3 columns)
- **Tablet:** 2-column widget grid
- **Mobile:** Single column, widgets stacked vertically in priority order (most important first)

#### Outstanding page

- **Desktop:** Full table with type filter tabs
- **Mobile:** Card-based layout — each outstanding item as a tappable card showing type badge, entity label, and action description

### Touch targets

- All interactive elements (buttons, links, checkboxes, dropdown triggers, table rows) must have a minimum touch target of **44×44px** per WCAG 2.1 Success Criterion 2.5.5
- Padding is preferred over sizing to meet the 44px minimum — keeps visual size appropriate while expanding the tappable area
- Icon buttons (e.g., delete ×, help ?, edit pencil) must have sufficient padding to reach 44×44px

### Responsive utility classes

Use Tailwind responsive prefixes consistently:

- `hidden md:block` — hide on mobile, show on tablet+
- `md:hidden` — show only on mobile
- `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` — responsive grid columns
- `w-full md:w-auto` — full-width on mobile, auto on tablet+

### Testing

- Test responsive layouts using Chrome DevTools device emulation:
  - **iPhone SE** (375×667) — smallest supported mobile
  - **iPhone 14** (390×844) — standard mobile
  - **iPad** (768×1024) — tablet breakpoint boundary
  - **iPad Pro** (1024×1366) — tablet/desktop boundary
- Verify: no horizontal overflow on mobile, all touch targets ≥ 44px, text is readable without zooming, forms are usable single-column

## Consequences

- **Positive:** App is usable on phones and tablets, which is critical for sellers who check orders on the go. Master-detail toggle pattern is a well-established mobile UX pattern. Card layouts on mobile improve scanability for dense data. WCAG touch target compliance improves accessibility for all users.
- **Negative:** Adds responsive variants to every component, increasing CSS complexity and testing surface. Mobile list/detail toggle requires managing "which view am I in" state. Some desktop features (drag-to-reorder pictures, side-by-side panels) are degraded on mobile. Card-based table alternatives require additional component variants.

## Notes

- Cross-references: ADR-024 (frontend architecture — breakpoint definitions, no detail sub-routes), ADR-033 (PictureGrid — mobile 2-column grid, mobile reorder buttons), ADR-028 (shared components — all shared components must be responsive), ADR-045 (accessibility — 44px touch targets), ADR-030 (inventory two-panel — desktop layout that stacks on mobile), ADR-031 (order detail — master-detail that toggles on mobile)
- The mobile layout does not introduce any new routes or pages — all responsive behavior is CSS/state-driven within existing page components
- Print queue panel on mobile: renders as a full-screen overlay instead of a dropdown (same content and actions)
- Future consideration: a dedicated mobile app or PWA could provide a better mobile experience, but responsive web is the v1 approach
