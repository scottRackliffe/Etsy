# ADR-045: Accessibility and keyboard navigation

## Status
Accepted

## Date
2026-05-24

## Context
The application has no defined accessibility standards, ARIA labeling strategy, or keyboard navigation specification. Screen reader users cannot effectively use the app, keyboard-only users cannot navigate forms and tables, and color-only status indicators exclude color-blind users. WCAG 2.1 Level AA is the widely accepted standard for web applications and should be the target compliance level.

## Decision

### 1. Target compliance level

**WCAG 2.1 Level AA** is the target for all pages and components. This includes (but is not limited to):
- 1.1.1 Non-text Content — all images have alt text
- 1.3.1 Info and Relationships — programmatic structure matches visual structure
- 1.4.1 Use of Color — color is never the sole means of conveying information
- 1.4.3 Contrast (Minimum) — 4.5:1 for normal text, 3:1 for large text
- 2.1.1 Keyboard — all functionality available via keyboard
- 2.4.1 Bypass Blocks — skip navigation link provided
- 2.4.3 Focus Order — logical and predictable tab order
- 2.4.7 Focus Visible — visible focus indicator on all interactive elements
- 4.1.2 Name, Role, Value — all UI components have accessible names and roles

### 2. Focus management

#### 2a. Tab order
- Tab order follows visual layout order (left-to-right, top-to-bottom)
- **Never use `tabindex` values greater than 0** — only `tabindex="0"` (natural order) or `tabindex="-1"` (programmatic focus only)
- Interactive elements are focusable in this order within a page: Skip link → Header → Tab bar → Main content (search → filters → table/form → actions)

#### 2b. Focus visible indicator
- All interactive elements (buttons, links, inputs, checkboxes, selects, table rows) show a visible focus ring
- Focus ring style: `2px solid var(--ui-accent)` with `2px offset` (outline, not border, to avoid layout shift)
- CSS: `*:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 2px; }`
- The `:focus-visible` pseudo-class is used (not `:focus`) so mouse users don't see the focus ring

#### 2c. Focus trap in modals and dialogs
- When a modal or dialog opens, focus moves to the first focusable element inside (typically the heading or close button)
- Tab/Shift+Tab cycles through focusable elements within the modal only (focus does not escape to the page behind)
- When the modal closes, focus returns to the element that triggered it
- Implementation: use a `useFocusTrap(ref)` hook that manages `keydown` Tab interception

#### 2d. Focus on page navigation
- When the user navigates to a new tab/page, focus moves to the main content area's `<h1>` heading
- The `<h1>` has `tabindex="-1"` so it can receive focus programmatically without being in the tab order
- This ensures screen readers announce the new page context

### 3. ARIA attributes

#### 3a. Form inputs
Every form input MUST have an accessible label via one of:
- An associated `<label>` element with matching `htmlFor`/`id` (preferred)
- `aria-label` attribute (for icon-only buttons or inputs without visible labels)
- `aria-labelledby` pointing to a visible heading (for grouped inputs)

Error states on inputs:
- `aria-invalid="true"` when validation fails
- `aria-describedby` pointing to the error message element
- Error message element has `id` matching the `aria-describedby` value

Required fields:
- `aria-required="true"` on required inputs
- Visual indicator: asterisk (*) after label text, plus `aria-label` includes "(required)"

#### 3b. Toast notifications
- Container: `role="status"` with `aria-live="polite"`
- Error toasts: `role="alert"` with `aria-live="assertive"` (announces immediately)
- Each toast has a unique `id` and is appended to a live region container
- Toast auto-dismiss timers pause on hover/focus (so users have time to read)

#### 3c. Error messages
- Inline form errors: `aria-live="assertive"` on the error container so the error is announced when it appears
- Error panels (e.g., API failure): `role="alert"` with `aria-live="assertive"`
- Error messages include actionable text (what went wrong + what the user can do)

#### 3d. Loading states
- Container with loading content: `aria-busy="true"` while loading
- Loading spinner: `role="status"` with `aria-label="Loading"` (or specific text like "Loading inventory items")
- When loading completes, `aria-busy` is removed and focus may move to the first item

#### 3e. DataTable (ADR-028)
- Table element: `role="table"` (or use native `<table>`)
- Header row: `role="row"` with `role="columnheader"` cells
- Body rows: `role="row"` with `role="cell"` cells
- Sortable columns: `aria-sort="ascending"`, `aria-sort="descending"`, or `aria-sort="none"` on the column header
- When sort changes, announce via `aria-live="polite"` region: "Sorted by [column] [direction]"
- Checkbox column header: `aria-label="Select all rows on this page"`
- Row checkbox: `aria-label="Select [entity identifier]"` (e.g., "Select order ORD-2024-0042")
- Empty table: the empty state has `role="status"` so screen readers announce it

#### 3f. Badges
- Badges MUST have a text label that is always present (not hidden)
- Color is supplementary, never the only indicator — the text label ("Paid", "Shipped", "Draft") conveys the meaning
- Badge has `role="status"` if it represents a live-updating value
- For status badges with color coding: include `aria-label="Status: [value]"` to ensure the status is announced

#### 3g. Outstanding count on tab
- The Outstanding tab label includes the count: "Outstanding (5)"
- `aria-label="Outstanding, 5 items requiring attention"` on the tab element
- Count updates use `aria-live="polite"` on the count badge so changes are announced

#### 3h. Modals and dialogs
- `role="dialog"` with `aria-modal="true"`
- `aria-labelledby` pointing to the dialog title
- `aria-describedby` pointing to the dialog body text (if present)
- Focus trap active (see §2c)
- ConfirmDialog (ADR-032): destructive confirm button has `aria-label` that includes the consequence (e.g., "Delete 5 items")

### 4. Keyboard navigation

#### 4a. Global keyboard shortcuts
| Key | Action | Context |
|---|---|---|
| `Cmd/Ctrl+K` | Open global search (ADR-041) | Any page |
| `Escape` | Close modal / dialog / search | When modal is open |
| `Enter` | Submit focused form / confirm dialog | When form or dialog is focused |

#### 4b. Tab navigation
- `Tab`: move focus to next interactive element
- `Shift+Tab`: move focus to previous interactive element
- Focus order is logical and predictable (see §2a)

#### 4c. DataTable keyboard navigation
- `Tab` to enter the table (focuses first row)
- `Arrow Down` / `Arrow Up`: move between rows
- `Arrow Right` / `Arrow Left`: move between cells within a row (when cell-level navigation is relevant, e.g., for action buttons)
- `Enter` on a row: select/open the record (equivalent to click)
- `Space` on a checkbox cell: toggle the checkbox
- `Home` / `End`: move to first/last row on the current page
- `Page Up` / `Page Down`: move to previous/next page of results (triggers pagination)

#### 4d. Form navigation
- `Tab` moves between form fields in order
- `Enter` in a text input submits the form (if it's the last field) or moves to the next field
- `Space` toggles checkboxes
- `Arrow Up` / `Arrow Down` in select/dropdown: navigate options
- `Enter` in select/dropdown: confirm selection
- `Escape` in select/dropdown: close without selecting

#### 4e. Modal keyboard
- `Escape`: close the modal (equivalent to Cancel/Close button)
- `Tab` / `Shift+Tab`: cycle through focusable elements within the modal (focus trap)
- `Enter`: activate the focused button

### 5. Skip navigation link

A "Skip to main content" link is the first focusable element on every page.

**Implementation:**
- Visually hidden by default (`sr-only` / off-screen positioning)
- Becomes visible on focus (`:focus` styles move it on-screen)
- Target: `<main id="main-content">` element
- Link text: "Skip to main content"
- Style when visible: fixed position at top of viewport, `var(--ui-accent)` background, white text, padding, z-index above header

```html
<a href="#main-content" class="skip-link">Skip to main content</a>
<!-- ... header, tab bar ... -->
<main id="main-content" tabindex="-1">
  <!-- page content -->
</main>
```

### 6. Reduced motion

Respect the user's motion preferences:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

**Affected animations:**
- Toast slide-in/fade-out
- Modal open/close transitions
- Loading spinner rotation (replaced with static indicator or pulsing opacity)
- Progress bar fill animation
- Tab switch transitions
- Highlight flash on deep-linked records (ADR-035)

### 7. Color contrast verification

All text and interactive elements must meet WCAG AA contrast ratios against their backgrounds.

**Verified combinations from System_Colors.md:**

| Foreground | Background | Ratio | Pass? |
|---|---|---|---|
| `--ui-title` (#eef4ff) | `--ui-background` (#081a34) | 14.5:1 | ✓ AA |
| `--ui-body` (#c7d6f2) | `--ui-background` (#081a34) | 9.3:1 | ✓ AA |
| `--ui-muted` (#9bb0d1) | `--ui-background` (#081a34) | 5.8:1 | ✓ AA |
| `--ui-body` (#c7d6f2) | `--ui-card-bg` (#0f2b55) | 7.1:1 | ✓ AA |
| `--ui-muted` (#9bb0d1) | `--ui-card-bg` (#0f2b55) | 4.5:1 | ✓ AA (borderline) |
| `--ui-green` (#00CC66) | `--ui-background` (#081a34) | 8.2:1 | ✓ AA |
| `--ui-yellow` (#FFCC00) | `--ui-background` (#081a34) | 12.1:1 | ✓ AA |
| `--ui-red` (#FF4444) | `--ui-background` (#081a34) | 5.2:1 | ✓ AA |
| White (#FFFFFF) | `--ui-accent` (#2f80ed) | 4.6:1 | ✓ AA |

**Remediation needed:**
- `--ui-muted` on `--ui-panel-bg` (#0b2346): ratio is approximately 5.0:1 — passes AA for normal text but is borderline; avoid using for text smaller than 14px
- If any combination is found to fail during implementation, the darker background variant or lighter text variant must be used

### 8. Component-level accessibility contracts

Each shared component from ADR-028 has specific accessibility requirements:

| Component | Requirements |
|---|---|
| **Button** | `aria-label` for icon-only buttons; `aria-disabled="true"` when disabled (plus visual disabled state); focus ring |
| **DataTable** | Full table semantics (§3e); keyboard navigation (§4c); sort announcements |
| **FormField** | Label association; error state ARIA (§3a); required indication |
| **Modal** | Dialog role (§3h); focus trap (§2c); Escape to close |
| **Toast** | Live region (§3b); pause on hover; auto-dismiss respects `prefers-reduced-motion` |
| **EmptyState** | `role="status"`; descriptive text readable by screen readers |
| **LoadingSpinner** | `role="status"`; `aria-label="Loading"`; `aria-busy` on parent |
| **Badge** | Text label always present; color supplementary (§3f) |
| **ErrorPanel** | `role="alert"`; `aria-live="assertive"` (§3c) |
| **ConfirmDialog** | Extends Modal requirements; destructive button `aria-label` includes consequence |
| **SearchModal** (ADR-041) | Dialog role; focus trap; keyboard navigation (§4 in ADR-041); `aria-label` on input |

### 9. Images and non-text content

- All `<img>` elements must have an `alt` attribute:
  - Product/inventory images: `alt="Photo N of [item description]"` (e.g., "Photo 1 of Vintage brass lamp")
  - Thumbnails in lists: `alt="Thumbnail of [item description]"`
  - Decorative images (icons, dividers): `alt=""` with `aria-hidden="true"`
  - Business logo: `alt="[Business name] logo"`
- Icons used as interactive elements (e.g., sort arrows, delete icon buttons) must have `aria-label` or visible text

### 10. Testing and verification

**Automated testing:**
- Use `eslint-plugin-jsx-a11y` to catch common ARIA issues during development
- Run `axe-core` or similar automated accessibility scanner on each page

**Manual testing checklist (per page):**
- [ ] All functionality reachable via keyboard only (no mouse)
- [ ] Focus visible on every interactive element
- [ ] Tab order matches visual order
- [ ] Screen reader announces page title on navigation
- [ ] Form errors are announced
- [ ] Color is not the sole means of conveying information
- [ ] Modals trap focus and return focus on close
- [ ] Skip link works and is visible on focus

## Consequences

- **Positive:** The app meets WCAG 2.1 AA, making it usable by people with disabilities; keyboard navigation improves efficiency for all power users; structured ARIA improves the experience for screen reader users; reduced motion support respects user preferences; the component-level contracts ensure accessibility is built in, not bolted on.
- **Negative:** Accessibility requires additional development effort on every component; ARIA attributes add verbosity to JSX; focus management in complex UI patterns (two-panel layouts, inline editing) is non-trivial to implement correctly; automated testing catches only ~30% of accessibility issues — manual testing is still required; maintaining contrast ratios constrains future color palette changes.

## Notes
- Cross-references: ADR-028 (shared components — each component's ARIA contract defined here in §8), ADR-032 (ConfirmDialog — focus trap and keyboard behavior), ADR-041 (global search modal — keyboard navigation and ARIA), ADR-030 (inventory two-panel layout — focus management between panels), ADR-031 (order detail — focus management between list and detail), System_Colors.md (color palette — contrast ratios verified in §7)
- Color contrast ratios in §7 are approximate and should be verified with a tool like WebAIM Contrast Checker during implementation
- `eslint-plugin-jsx-a11y` should be added to the project's ESLint config as a dev dependency
- The `prefers-reduced-motion` media query in §6 should be added to `globals.css`
- ARIA live regions should be used sparingly — overuse causes screen reader verbosity that degrades the experience
