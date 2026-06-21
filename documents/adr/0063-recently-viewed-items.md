# ADR-063: Recently-viewed items list

## Status

Accepted

## Date

2026-05-24

## Context

There is no way to quickly return to records the user was just working on. Users frequently switch between a small set of items, orders, or customers, and navigating back via search or scrolling is inefficient.

## Decision

### Data structure

- Recently-viewed items are stored in `localStorage` under the key `etsy_recently_viewed`.
- Maximum 20 entries. When a 21st is added the oldest is evicted.
- Each entry:
  ```json
  {
    "entityType": "order" | "inventory" | "customer",
    "id": 123,
    "label": "ITEM-042 — Vintage Fiesta Pitcher",
    "timestamp": 1716580800000
  }
  ```
- `label` is a human-readable summary: item number + description for inventory, order number for orders, full name for customers.

### When entries are added

- User selects or opens a record in a detail panel (Inventory, Sales, or Customers page).
- User navigates to a record via a deep link (ADR-035).
- Etsy sync or bulk operations do NOT add entries.

### Deduplication

- If an entity with the same `entityType` and `id` already exists in the list, it is moved to the top with an updated `timestamp` and `label` (in case the label changed). No duplicates are ever stored.

### UI

- A clock icon button in `AppHeader` (right side, next to Etsy connection status).
- Clicking the icon opens a dropdown panel (max-height 400 px, scrollable).
- Entries are grouped by `entityType` (Inventory, Orders, Customers) with section headers.
- Within each group, entries are sorted most-recent-first.
- Each entry shows the `label` and a relative timestamp ("2 min ago", "yesterday").
- Clicking an entry navigates to the correct page with the appropriate deep-link query param:
  - Inventory → `/inventory?itemId=<id>`
  - Orders → `/orders?orderId=<id>`
  - Customers → `/customers?customerId=<id>`
- A "Clear history" text button at the bottom of the dropdown clears all entries from `localStorage` and closes the dropdown.
- If the list is empty, the dropdown shows "No recently viewed items."

### Storage constraints

The recently-viewed list stores the 20 most recent items in localStorage. Items are deduplicated by entity type + ID. Viewing the same entity again moves it to the top of the list.

Each entry stores: `{ type: 'inventory'|'order'|'customer', id: number, label: string, timestamp: number }`.

> **Reconciliation note (2026-06-09):** Formalized max items (20), deduplication rule, and entry shape for implementation clarity.

### No server-side storage

- This is purely a client-side convenience feature. No API endpoints, no database tables.
- Data does not sync across browsers or devices (acceptable for a single-user local app).

## Consequences

- **Positive:** Fast navigation back to recent work; zero server overhead; simple implementation.
- **Negative:** Lost on browser data clear; no cross-device sync (irrelevant for this single-user local app).

## Notes

- Cross-ref: ADR-035 (deep-link navigation), ADR-024 (AppHeader component).
- The `label` should be updated if the user renames/changes the record — on next view the label is refreshed.
- Consider a React context (`RecentlyViewedContext`) to manage state and expose `addRecentlyViewed(entityType, id, label)` to all pages.
