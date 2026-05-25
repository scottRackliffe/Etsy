# ADR-059: Empty-State Calls to Action

## Status

Accepted

## Date

2026-05-24

## Context

Empty lists currently show generic messages like "No items" without guiding the user on what to do next. This is a poor experience for both first-time users (who don't know how to get started) and returning users (who need to understand why a filtered view is empty). Every empty state should include an actionable message and relevant buttons.

## Decision

### General rule

Every list page and filtered view MUST use the `EmptyState` shared component (ADR-028) with:

1. A specific, context-aware message (not generic "No data")
2. At least one action button (except Outstanding, which is purely data-driven)
3. Action buttons that directly resolve the empty state

### Empty state definitions per page

| Page            | Condition                 | Message                                                                      | Primary Action                  | Secondary Action                |
| --------------- | ------------------------- | ---------------------------------------------------------------------------- | ------------------------------- | ------------------------------- |
| **Sales**       | No orders exist           | "No orders yet."                                                             | "Sync from Etsy" (if connected) | "Create manual order"           |
| **Sales**       | Filter returns no results | "No orders match your filters."                                              | "Clear filters"                 | —                               |
| **Inventory**   | No items exist            | "Your inventory is empty."                                                   | "Add first item"                | "Import from CSV" (ADR-047)     |
| **Inventory**   | Filter returns no results | "No items match your filters."                                               | "Clear filters"                 | —                               |
| **Customers**   | No customers exist        | "No customers yet. They'll appear when you create orders or sync from Etsy." | "Sync from Etsy" (if connected) | "Add customer"                  |
| **Customers**   | Filter returns no results | "No customers match your filters."                                           | "Clear filters"                 | —                               |
| **Outstanding** | No outstanding items      | "Nothing needs attention right now."                                         | —                               | —                               |
| **Reports**     | No data for criteria      | "No data for the selected date range or filters."                            | "Adjust date range"             | "Clear filters"                 |
| **Dashboard**   | No recent activity        | "No recent activity. Start by adding inventory or syncing orders from Etsy." | "Go to Inventory"               | "Sync from Etsy" (if connected) |

### Etsy connection awareness

- When the app is NOT connected to Etsy, any "Sync from Etsy" button is replaced with "Connect Etsy first" — styled as `variant="secondary"` with a link icon, navigating to the Config tab Etsy Connection section
- When connected, "Sync from Etsy" triggers the sync flow directly (calls `POST /api/sync/etsy`)

### Button styling

- Primary action: `Button variant="accent"` (blue, `--ui-accent`)
- Secondary action: `Button variant="secondary"` (neutral, `--ui-neutral`)
- Buttons are centered below the message text within the `EmptyState` component

### EmptyState component props

```typescript
interface EmptyStateProps {
  message: string;
  primaryAction?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
  icon?: React.ReactNode; // optional contextual icon
}
```

### Cleanup

- Remove any stale reference to "panel on the right" in the Customers empty state message (this was a holdover from the side-panel layout that was deferred to post-v1 per ADR-009)
- Audit all existing `EmptyState` usages to ensure they match the table above

## Consequences

- **Positive:** Users always know what to do next when facing an empty screen. First-time experience is guided rather than confusing. Etsy-connected users get direct sync access from empty states. Filter-related empty states help users understand that data exists but is hidden by their current filters.
- **Negative:** Requires maintaining empty state messages per page — if pages are added or restructured, empty states must be updated. Action buttons in empty states create additional navigation paths to test.

## Notes

- Cross-references: ADR-028 (EmptyState shared component — props and styling), ADR-044 (onboarding wizard — first-time empty states may overlap with onboarding flow), ADR-047 (CSV import — "Import from CSV" action in Inventory empty state), ADR-009 (UI layout — side panel deferred, removing stale "panel on the right" reference)
- The Outstanding page intentionally has no action buttons because its content is purely data-driven (ADR-020) — there is nothing for the user to "do" when outstanding is empty
- Empty states should use the `--ui-muted` color (#9bb0d1) for the message text, with `--ui-title` color for any heading
