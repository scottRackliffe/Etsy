# ADR-009: UI layout — tabs, commands panel, outstanding panel, detail card, intuitive design

## Status

Accepted

## Date

2025-02-15

## Context

The application needs a clear, world-class UI that supports Dashboard, Sales, Inventory, Customers, Reports, and Config without feeling crowded or confusing. Users should see what needs attention (outstanding items) and act on it quickly. The experience must feel intuitive—no manual required to understand where to go or what to do.

## Decision

**Layout**

- **Tabs (top):** Primary navigation. One row of tabs: Dashboard, Sales, Inventory, Customers, Reports, Config. One tab active at a time; main content area shows that section’s list/form/report.
- **Commands (one side):** A **panel** on the left or right (same side app-wide). Context-sensitive: only commands that apply to the current tab (and selection) are shown. One action per command; labels use verbs (e.g. “Add item”, “Mark shipped”). Global actions (e.g. Connect Etsy, Refresh) available where appropriate.
- **Outstanding (opposite side):** A **panel** (not a full tab) on the other side from commands. Lists things that need attention: unshipped orders, new orders, items to list, incomplete customers (data-driven; optional manual tasks). Visible on every tab so the user always sees what’s pending.
- **Detail card on click:** Clicking an item in the Outstanding panel opens a **detail card** (overlay/modal or slide-out), not navigation to another tab. The card shows key details and quick actions (e.g. Mark shipped, View order). User can dismiss the card (X or click outside) and stay on the current tab.

**Intuitive design (guiding principle)**

- Tabs use clear, everyday names; order follows workflow (overview → day-to-day work → reports → settings).
- Commands are obvious and only show when relevant; avoid nested menus for core actions.
- Outstanding panel is clearly labeled; one row = one item; click = detail card.
- Detail card shows the most important info and buttons that say what they do; clear way to close.
- Lists and forms use plain-language labels; primary action is easy to spot; errors and success messages are short and actionable.
- Processes match how users think (e.g. “I have an order” → Sales tab).
- Consistency: same pattern everywhere (select in center → act via commands or outstanding detail card); same style of buttons, cards, and feedback across tabs. When in doubt: fewer steps, clearer labels, predictable behavior.

## Consequences

- **Positive**
  - Single, consistent layout across the app; users learn once and apply everywhere.
  - Outstanding items are always visible and actionable via the detail card without leaving the current tab.
  - Intuitive-design principle gives a clear bar for every feature and future change.
- **Negative**
  - Layout and behavior are fixed; future “alternate layouts” would need to be justified against this ADR.

## Notes

- Full UI flows, command lists, and processes are in [documents/ui-design.md](../ui-design.md). This ADR records the structural and behavioral decisions (tabs, panels, detail card, intuitive design).
