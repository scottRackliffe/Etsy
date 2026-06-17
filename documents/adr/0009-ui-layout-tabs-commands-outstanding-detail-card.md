# ADR-009: UI layout — tabs, commands panel, outstanding panel, context in place, intuitive design

## Status

Accepted

## Date

2025-02-15

## Context

The application needs a clear, world-class UI that supports Dashboard, Sales, Inventory, Customers, Reports, and Config without feeling crowded or confusing. Users should see what needs attention (outstanding items) and act on it quickly. The experience must feel intuitive—no manual required to understand where to go or what to do.

## Decision

**v1 implementation note (2026-05-24):** The structural decisions below (tabs, intuitive design, context-in-place on outstanding click) remain in force. **Side commands panel, side outstanding panel, and layout flip are deferred to post-v1** — see "Implementation status" at end of this ADR. v1 uses full-width content, inline actions (ADR-028), and the Outstanding **tab** with deep links (ADR-035).

**Layout**

- **Tabs (top):** Primary navigation. Full tab set: **Dashboard**, **Sales**, **Inventory**, **Receipts**, **Customers**, **Reports**, **Tutorial and tips**, **Outstanding**, **Config** (see [ui-design.md](../ui-design.md) §2 for purpose and content of each). One tab active at a time; main content area shows that section’s list/form/report.
- **Commands (left) / Outstanding (right) or the reverse:** ⚠️ **Deferred to post-v1.** Which side is which is configurable (Config). An **icon in the UI flips** the layout: **left** = commands, **right** = outstanding (to-do's), or the reverse. **Commands (one side):** A **panel** on the left or right (same side app-wide). Context-sensitive: only commands that apply to the current tab (and selection) are shown. One action per command; labels use verbs (e.g. “Add item”, “Mark shipped”). Global actions (e.g. Connect Etsy, Refresh) available where appropriate.
- **Outstanding side panel (opposite side):** ⚠️ **Deferred to post-v1.** We support **both** (1) a **panel** on the other side from commands, visible on every tab, and (2) a dedicated **Outstanding tab** (full-page) showing the same list. Same data-driven items only (no user-added manual tasks). **What counts as outstanding** is defined in [ui-design.md](../ui-design.md) §4 (e.g. orders paid but not shipped, orders not yet marked paid, new Etsy orders not synced, inventory In stock but not Listed, customers with no or incomplete address). Implement the list from those definitions so the panel and tab stay in sync.
- **Context in place on click:** Clicking an item in the Outstanding panel (or in the full-page Outstanding tab) **puts context in place**: the app navigates to the correct tab and opens/selects the correct record so the user can act immediately (e.g. Mark shipped, View order). We do not use a separate detail card overlay for this; the main content area shows the right tab and record.

**Intuitive design (guiding principle)**

- Tabs use clear, everyday names; order follows workflow (overview → day-to-day work → reports → settings).
- Commands are obvious and only show when relevant; avoid nested menus for core actions.
- Outstanding panel is clearly labeled; one row = one item; click = go to correct tab and record, ready for action.
- Config controls which side is commands vs outstanding; an icon in the UI flips the layout (left = commands, right = outstanding to-do's, or the reverse).
- Lists and forms use plain-language labels; primary action is easy to spot; errors and success messages are short and actionable.
- Processes match how users think (e.g. “I have an order” → Sales tab).
- Consistency: same pattern everywhere (select in center → act via commands or outstanding click → context in place); same style of buttons, cards, and feedback across tabs. When in doubt: fewer steps, clearer labels, predictable behavior.

## Consequences

- **Positive**
  - Single, consistent layout across the app; users learn once and apply everywhere.
  - Outstanding items are always visible; clicking one puts the user in context (correct tab, correct record) ready to act.
  - Intuitive-design principle gives a clear bar for every feature and future change.
- **Negative**
  - Layout and behavior are fixed; future “alternate layouts” would need to be justified against this ADR.

## Notes

- Full UI flows, command lists, and processes are in [documents/ui-design.md](../ui-design.md). This ADR records the structural and behavioral decisions (tabs, panels, context in place on outstanding click, intuitive design).
- **Config persistence:** User preferences (e.g. which side is commands vs outstanding, default shipper, business details) are **stored** so they persist across sessions—e.g. in the database (settings table or key-value) or in app-controlled local storage; see ADR-008 (all app data in database). Implementation chooses where; the important point is that layout and defaults persist.

### v1 layout summary (updated 2026-06-09)

v1 layout uses: Header + Tab bar + Main content (full width). Commands panel and Outstanding side panel are planned for post-v1. **Receipts tab added 2026-06-16** — dedicated tab for vendor purchase receipts (scan, manual entry, link items to inventory). Separate from Inventory because receipts represent vendor purchases, not inventory items.

### Implementation status (updated 2026-05-24)

- **Commands panel (deferred to post-v1):** The side commands panel is not implemented in v1. Context-sensitive actions are placed inline on each tab page using the `Button` component (ADR-028). The commands-panel concept remains a design goal for a future iteration when the page layouts stabilize and the action inventory is complete.
- **Outstanding side panel (deferred to post-v1):** The persistent side panel is not implemented in v1. The full-page **Outstanding tab** fulfills the outstanding-list requirement. Clicking an item in the Outstanding tab navigates to the correct tab and selects the correct record via URL deep linking (ADR-035). This satisfies the "context in place" requirement without the side panel.
- **Panel layout flip (deferred):** Since neither side panel exists in v1, the panel_layout setting and flip icon are deferred.
- **All other decisions in this ADR remain in effect:** tab names, tab order, intuitive design principles, and the "context in place" behavior.
