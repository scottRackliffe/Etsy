# ADR-029: Search, filter, sort, and pagination across all list views

## Status

Accepted

## Date

2026-05-24

## Context

No list view in the application supports search, filtering, sorting, or pagination. The Inventory, Sales, and Customers pages load up to 100 records and display them in unsearchable, unsortable tables. With even modest data volume (100+ inventory items, 200+ orders), users cannot find records without scrolling. The `usePagination` hook exists but is unused; the API layer already supports `limit`/`offset` pagination.

## Decision

**Add search, filter, sort, and pagination to every list view.** The implementation is split into client-side (fast, no API changes) and server-side (API-backed) tiers depending on expected data volume.

---

### Search bar

Every page with a record list gets a search input above the table.

| Page            | Search fields                                                                                | Behavior                                                                |
| --------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Inventory**   | `item_number`, `description`, `listing_title`, `category_tags`                               | Client-side filter on loaded records; server-side search when paginated |
| **Sales**       | `order_number`, ship-to name (`ship_to_first_name` + `ship_to_last_name`), `etsy_receipt_id` | Client-side filter; server-side when paginated                          |
| **Customers**   | `first_name`, `last_name`, `email`, `phone`                                                  | Client-side filter                                                      |
| **Outstanding** | `summary` text across all types                                                              | Client-side filter (data is already fetched in full)                    |
| **Dashboard**   | No search (live Etsy data, read-only snapshot)                                               | —                                                                       |

**Search input spec:**

- Positioned above the table, full width or alongside filter controls.
- Uses `FormField` with `label="Search"` and `TextInput`.
- Debounced: 300ms delay before filtering.
- Case-insensitive substring match across the specified fields.
- Clears with an `×` button inside the input.

---

### Filters

| Page            | Filter controls                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Inventory**   | Status chip group: `All`, `Draft`, `In stock`, `Listed`, `Sold`, `Reserved`, `Retired`. Default: `All`. (Values per ADR-002, ADR-017.) |
| **Sales**       | Payment chip group: `All`, `Paid`, `Unpaid`. Shipping chip group: `All`, `Shipped`, `Not shipped`. Source: `All`, `Etsy`, `Manual`.    |
| **Customers**   | Active toggle: `All` / `Active only` (default: Active only, based on `is_active`).                                                     |
| **Outstanding** | Already implemented with type chip groups — no changes.                                                                                |
| **Reports**     | Report type dropdown (already exists). Add date range filter (see ADR-036).                                                            |

**Filter chip spec:**

- Horizontal row of pill-shaped buttons (similar to Outstanding page's existing filter chips).
- Selected chip: filled accent background. Unselected: border-only.
- Multiple filter dimensions shown in separate rows (e.g., Payment row + Shipping row for Sales).
- Clicking a chip applies immediately (no "Apply" button).
- Filter state stored in component state and optionally reflected in URL query params.

---

### Column sorting

All `DataTable` instances support sortable columns.

**DataTable enhancement:**

- Add optional `sortable?: boolean` to `Column<T>`.
- Clicking a sortable column header cycles: ascending → descending → unsorted.
- Sort indicator: `▲` / `▼` appended to header text.
- Only one column sorted at a time.
- Default sort per page:

| Page        | Default sort column            | Direction                                |
| ----------- | ------------------------------ | ---------------------------------------- |
| Inventory   | `updated_at` (or `created_at`) | Descending (newest first)                |
| Sales       | `order_date`                   | Descending                               |
| Customers   | `last_name`                    | Ascending                                |
| Outstanding | `date`                         | Descending (already server-side default) |
| Dashboard   | `creation_tsz`                 | Descending (already server-side default) |

**Sort implementation:**

- Client-side for the current page of data.
- When paginated server-side, pass `sort_by` and `sort_dir` query params to the API. API list endpoints must support these params (add to `/api/inventory`, `/api/orders`, `/api/customers`).

---

### Pagination

Integrate `usePagination` hook with all list views.

**Page size:** 25 records per page (configurable via settings key `ui.page_size`, default `25`).

**Pagination controls spec:**

- Rendered below the `DataTable`.
- Layout: `← Previous` | `Page X of Y` | `Next →`
- Previous disabled on page 1; Next disabled on last page.
- Total count shown: `"Showing 1–25 of 142 records"`.

**API changes required:**

- `/api/inventory` (GET): already supports `limit`/`offset`. Add `search`, `status`, `sort_by`, `sort_dir` query params.
- `/api/orders` (GET): already supports `limit`/`offset`. Add `search`, `payment_status`, `shipping_status`, `source_channel`, `customer_id`, `sort_by`, `sort_dir` query params.
- `/api/customers` (GET): already supports `limit`/`offset`. Add `search`, `is_active`, `sort_by`, `sort_dir` query params.
- All list endpoints return the canonical API pagination envelope (ADR-018): `{ items: T[], pagination: { limit, offset, total, has_more } }`.

> **Reconciliation note (2026-06-09):** A prior version of this ADR described a flat `{ items, total, limit, offset }` shape. That was incorrect — the canonical nested format from ADR-018 is the only valid response shape. Implementations must use `{ items, pagination: { limit, offset, total, has_more } }`.

**Context changes:**

- `AppContext` currently loads all records on mount with `limit=100`. Change to load first page only (`limit=25, offset=0`).
- Each page manages its own pagination state via `usePagination`.
- Selecting a record that is not on the current page (e.g., from Outstanding deep link) triggers a targeted fetch by ID.

---

### URL state sync

Search, filter, and sort state should be reflected in the URL query string so that:

- Browser back/forward navigates filter state.
- Outstanding deep links can include filter context.
- Bookmarkable filtered views.

Example: `/inventory?q=vase&status=in_stock&sort_by=item_number&sort_dir=asc&page=2`

> **Reconciliation note (2026-06-09):** URL params use `sort_by` and `sort_dir` (not `sort` / `dir`) to match ADR-018 query param conventions. Search text uses `q` for the URL param (mapped to the `search` API param server-side).

**Status filter slug encoding:** URL query params use slug format (e.g., `status=in_stock`, `status=listed`) which the server maps to display format values (`In stock`, `Listed`) before querying the database. The mapping is case-insensitive and replaces underscores with spaces, with initial capital.

**`shipping_status` filter for Sales:** Values: `shipped` (orders where `shipping_date IS NOT NULL`), `not_shipped` (orders where `shipping_date IS NULL`). Used in the Shipping chip group on the Sales page.

**`customer_id` filter for Sales:** When present (e.g., `/sales?customer_id=7`), filters orders to those belonging to the specified customer. Supports deep-link from Customer purchase history → Sales list (ADR-052).

Use `useSearchParams()` from Next.js to read/write query params. Update params on filter/search/sort/page change with `router.replace()` (no history push for every keystroke — only on debounced search commit, filter click, sort click, or page change).

## Consequences

- **Positive**
  - Users can find any record instantly regardless of data volume.
  - Consistent UX pattern across all list views.
  - Pagination prevents loading thousands of records into memory.
  - URL state enables deep linking and bookmarks.
- **Negative**
  - API endpoints need additional query param handling.
  - Context must change from "load everything" to "load page" pattern.
  - More complex state management per page (search + filter + sort + page).
