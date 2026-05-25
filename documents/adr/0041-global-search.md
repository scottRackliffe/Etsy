# ADR-041: Global search

## Status
Accepted

## Date
2026-05-24

## Context
Users must navigate to the correct tab (Sales, Inventory, Customers) before they can search for a specific record. This adds friction when the user doesn't know which tab contains the record they're looking for, or when they need to quickly jump to a specific order, item, or customer from any page. A global search accessible from anywhere in the app would let users find any record instantly.

## Decision

### 1. Search trigger

- **Keyboard shortcut:** `Cmd+K` (macOS) / `Ctrl+K` (Windows/Linux) opens the global search modal from any page
- **Header search icon:** A search icon button in the app header (right side, before the Etsy connection status) also opens the modal
- The shortcut is registered globally via a `useEffect` keydown listener on the root layout
- If a modal or dialog is already open, the shortcut is suppressed (does not open search on top of another modal)

### 2. Search modal

**Layout:**
```
┌────────────────────────────────────────────────────┐
│  🔍  Search orders, inventory, customers...    [×] │
├────────────────────────────────────────────────────┤
│                                                    │
│  ORDERS                                            │
│  ┌──────────────────────────────────────────────┐  │
│  │ 📦 ORD-2024-0042  •  John Smith  •  $125.00 │  │
│  │ 📦 ORD-2024-0038  •  Jane Doe    •  $89.50  │  │
│  └──────────────────────────────────────────────┘  │
│  See all 12 results →                              │
│                                                    │
│  INVENTORY                                         │
│  ┌──────────────────────────────────────────────┐  │
│  │ 📋 TCT-0042  •  Vintage brass lamp  •  Listed│  │
│  └──────────────────────────────────────────────┘  │
│  See all 3 results →                               │
│                                                    │
│  CUSTOMERS                                         │
│  ┌──────────────────────────────────────────────┐  │
│  │ 👤 John Smith  •  john@example.com           │  │
│  └──────────────────────────────────────────────┘  │
│  See all 2 results →                               │
│                                                    │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│  Recent: vintage lamp  •  ORD-2024  •  Smith       │
└────────────────────────────────────────────────────┘
```

**Modal behavior:**
- Centered overlay with backdrop (click backdrop to close)
- Width: `max-w-xl` (560px)
- Max height: 70vh with scroll
- Input auto-focuses on open
- Background: `var(--ui-panel-bg)` with `var(--ui-border)` border
- Escape key closes the modal

### 3. Search input behavior

- **Debounce:** 300ms after the user stops typing before sending the API request
- **Minimum query length:** 2 characters (below 2 chars, show recent searches only)
- **Placeholder text:** "Search orders, inventory, customers..."
- **Clear button:** `×` icon appears when input has text; clicking clears and refocuses
- **Loading state:** Subtle spinner replaces the search icon while the API request is in flight

### 4. Search results display

Results are grouped by entity type in this order: **Orders**, **Inventory**, **Customers**.

Each group shows a maximum of **5 results** with a "See all N results →" link if more exist.

If a group has zero results, it is not shown (no empty "Orders (0)" section).

If all groups have zero results, show: "No results for '[query]'"

**Result row format per entity:**

| Entity | Icon | Primary text | Secondary text | Badge |
|---|---|---|---|---|
| Order | 📦 (or order icon) | `order_number` | `ship_to_first_name ship_to_last_name` + `grand_total` formatted | `order_status` badge |
| Inventory | 📋 (or item icon) | `item_number` | `description` (truncated to 50 chars) | `status` badge |
| Customer | 👤 (or person icon) | `first_name last_name` | `email` (or `phone` if no email) | — |

**Badge styling:** Uses the `Badge` component (ADR-028) with the same color coding as list views.

### 5. Search fields per entity

The global search queries the same fields as the per-page search defined in ADR-029:

| Entity | Fields searched |
|---|---|
| Orders | `order_number`, `ship_to_first_name`, `ship_to_last_name`, `notes`, `tracking_number` |
| Inventory | `item_number`, `description`, `listing_title`, `notes`, `category_tags` |
| Customers | `first_name`, `last_name`, `email`, `phone`, `notes` |

All searches use case-insensitive `LIKE '%term%'` matching, consistent with ADR-029.

### 6. API endpoint

`GET /api/search?q=<term>&limit=5`

**Query parameters:**
- `q` (required): search term, minimum 2 characters
- `limit` (optional): max results per entity group, default `5`, max `20`

**Response:**

```json
{
  "ok": true,
  "orders": {
    "items": [
      {
        "id": 42,
        "order_number": "ORD-2024-0042",
        "ship_to_first_name": "John",
        "ship_to_last_name": "Smith",
        "grand_total": 125.00,
        "order_status": "active",
        "order_date": "2026-05-20"
      }
    ],
    "total": 12
  },
  "inventory": {
    "items": [
      {
        "id": 15,
        "item_number": "TCT-0042",
        "description": "Vintage brass lamp with glass shade",
        "status": "Listed"
      }
    ],
    "total": 3
  },
  "customers": {
    "items": [
      {
        "id": 7,
        "first_name": "John",
        "last_name": "Smith",
        "email": "john@example.com"
      }
    ],
    "total": 2
  }
}
```

- Each group includes `total` (total matching count across all pages) for the "See all N results" link
- The server runs three parallel queries (one per entity), each with `LIMIT ?` from the `limit` param
- If `q` is less than 2 characters: `400` with `{ error: { code: "QUERY_TOO_SHORT", message: "Search query must be at least 2 characters" } }`

### 7. Click behavior (navigation)

Clicking a search result navigates to the entity's page with a deep-link query parameter (ADR-035):

| Entity | Navigation target |
|---|---|
| Order | `/sales?orderId=<id>` |
| Inventory | `/inventory?itemId=<id>` |
| Customer | `/customers?customerId=<id>` |

The target page reads the query param, selects/scrolls to the record, highlights it, and cleans the URL (per ADR-035).

The search modal closes immediately on click.

**"See all N results" link:** Navigates to the entity's tab page with the search term pre-filled in the page-level search input: `/sales?q=<term>`, `/inventory?q=<term>`, `/customers?q=<term>`.

### 8. Keyboard navigation within the modal

- **Arrow Down / Arrow Up:** Move through results (highlight moves sequentially across groups)
- **Enter:** Navigate to the highlighted result (same as click)
- **Escape:** Close the modal
- **Tab:** Moves focus from search input to first result, then through results
- The currently highlighted result has a visible focus ring and background highlight (`var(--ui-accent)` at 15% opacity)

### 9. Recent searches

- The last 5 unique search queries are stored in `localStorage` under the key `global_search_recent`
- Stored as a JSON array of strings: `["vintage lamp", "ORD-2024", "Smith"]`
- Displayed below the search input when the input is empty (before the user types)
- Clicking a recent search fills the input and triggers the search
- Each recent search item has a small `×` to remove it from the list
- New searches are added to the front; duplicates are moved to the front; list is capped at 5

### 10. Performance considerations

- The API endpoint uses three separate `SELECT` queries with `LIMIT` (not a single UNION) so each entity query is independently optimized
- Indexes used: existing indexes on `order_number`, `item_number`, `first_name`/`last_name` (ADR-014)
- For `LIKE '%term%'` queries, indexes won't help with leading wildcards — this is acceptable for a single-user local app with expected data volumes under 10,000 records per entity
- The 300ms debounce prevents excessive API calls during typing

## Consequences

- **Positive:** Users can find any record from any page with a single keyboard shortcut; grouped results help users quickly identify the right entity type; deep-link navigation means the user lands exactly on the record they searched for; recent searches reduce repetitive typing.
- **Negative:** `LIKE '%term%'` is O(n) per entity table (no index acceleration for infix matches); the global search endpoint adds a new API surface that queries three tables; stored recent searches in localStorage are device-specific and not synced.

## Notes
- Cross-references: ADR-029 (search fields per entity — global search uses the same fields), ADR-035 (deep-link navigation — click result navigates with query param), ADR-028 (Badge component for status badges in results), ADR-014 (database indexes), ADR-045 (accessibility — modal focus trap, keyboard navigation, ARIA roles)
- The search modal component should be implemented as a shared component (e.g., `SearchModal`) since it is used globally
- Future consideration: full-text search (FTS5 in SQLite) could replace `LIKE` for better performance at scale, but is not needed for expected data volumes
- Keyboard shortcuts: ADR-049 (`Cmd/Ctrl+K` opens this modal; must not steal Cmd+Z from focused inputs)
