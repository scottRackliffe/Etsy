# ADR-016: Dashboard — content, structure, and behavior

## Status

Accepted

## Date

2025-02-15

## Context

The dashboard is the home view of the application. We need a single, unambiguous specification of what it is: what the user sees in each state, what data it shows, and how it behaves, so implementers and reviewers have one source of truth with no ambiguity.

## Decision

The **dashboard** is the application's home view. Its content, structure, and behavior are defined as follows.

**Scope of this ADR:** This describes the dashboard as it exists in the base system (single full page, no tabbed layout yet). When the full tabbed UI (ADR-009) is implemented, the dashboard becomes the content of the "Dashboard" tab; the structure below still applies to that tab's content, with the addition of the shared chrome (tabs, commands panel, outstanding panel) described in ADR-009 and ui-design.md.

---

### 1. Layout (single full page)

- **Header (top, full width)**
  - **Left:** Application title (e.g. "Trudy's Etsy Sales").
  - **Right:** One of:
    - **"Connect Etsy"** button (when not connected) — primary action; navigates to `/api/auth/etsy`.
    - **"Disconnect"** button (when connected) — calls logout (POST `/api/auth/logout` or equivalent); clears session and returns the view to "not connected" state.

- **Main content (below header)**
  - Centered, constrained width (e.g. max-width container).
  - Content depends on connection state and (when connected) on loaded data (see below).

---

### 2. State: Not connected

When the user is **not** authenticated with Etsy (no valid token / not connected):

- **Do not** show the shop selector or the receipts table.
- **Show:**
  - A short, plain-language message: "Connect your Etsy account to view and manage your sales." (Or equivalent approved wording; no other variant without updating this ADR.)
  - A single primary action: **"Connect with Etsy"** (or equivalent), which starts the OAuth flow (e.g. redirect to `/api/auth/etsy`).
- **Optional:** If the OAuth callback returned an error (e.g. user denied, or error query param on the redirect), show that error message clearly (e.g. in an alert or inline message) so the user understands why they are not connected.
- **Loading:** While checking connection (e.g. calling `/api/shop` or auth check), show a brief loading indication (e.g. "Checking connection…"); then show either "not connected" or "connected" content.

---

### 3. State: Connected

When the user **is** authenticated with Etsy (valid token, "connected"):

- **Header:** Show "Disconnect" (as above).

- **Shop selector**
  - Appears at the top of the main content area.
  - **Control:** A dropdown (or equivalent) listing the user's Etsy shop(s) returned from the API (e.g. `GET /api/shop`).
  - **Behavior:** User selects one shop. The selection determines which shop's receipts are shown.
  - **Default:** If the user has at least one shop, one shop is selected by default (e.g. the first in the list).
  - **Persistence:** Selection is in-memory for the session only (no requirement to persist across sessions).

- **Recent orders (receipts) section**
  - **Heading:** e.g. "Recent orders" (or equivalent).
  - **Subheading or caption:** Indicate that the list shows receipts with paid/shipped status (e.g. "N receipt(s) — paid / shipped status below").
  - **Data source:** Receipts for the **selected shop only**, fetched from the Etsy API via the app's API (e.g. `GET /api/receipts?shop_id=&limit=&offset=`). Data is **not** persisted in the application database in the base system; it is fetched on load and when the shop selection changes.
  - **Note (2026-06-09):** The receipts preview table shows live Etsy API data. KPI widgets and charts use persisted `orders` data (synced via ADR-019). The `etsy_receipts` table caches raw receipt JSON for reference but is not the source for dashboard metrics.
  - **Limit:** 100 receipts per request. Pagination: offset parameter optional (e.g. offset=0 for first page; limit=100).

- **Receipts table (when connected)**
  - **Columns (required):**  
    | Column | Meaning | Source / notes |
    |----------|---------|----------------|
    | Date | Order/receipt date | Etsy receipt creation timestamp; display in a human-readable date format (e.g. locale-aware). |
    | Order # | Receipt or order identifier | Etsy `receipt_id` (or equivalent); display as-is or as "Order #" + id. |
    | Ship to | Ship-to address | Buyer name plus a short address (e.g. first line, city, state, zip, country). Two lines acceptable (name; address). |
    | Total | Money amount | Total price; if total shipping cost &gt; 0, show it (e.g. "$X + $Y ship" or equivalent). Use receipt currency for formatting. |
    | Paid | Whether the order was marked paid | Boolean; display as "Yes" / "No" (or equivalent). |
    | Shipped | Whether the order was marked shipped | Boolean; display as "Yes" / "No" (or equivalent). |
  - **Empty state:** If the API returns zero receipts for the selected shop, show a clear empty state (e.g. "No orders yet.").
  - **Loading state:** While fetching receipts for the selected shop, show a loading state (e.g. "Loading orders…"); do not show the table until data is available or the empty state applies.
  - **Errors:** If the receipts request fails, show an appropriate error message (e.g. "Error loading orders" or the API error); do not leave the user with a blank or misleading view.

- **No other content is required** on the dashboard in the base system. Optional: app version or "Help" link; not specified here.

---

### 4. Data and APIs

- **Auth:** Connection state is determined by the app's auth/session records in SQLite (with opaque session id cookie transport). Logout invalidates SQLite auth/session records and clears the session id cookie.
- **Shops:** Shops are obtained from the Etsy API via the app (e.g. `GET /api/shop`). Unauthenticated requests return 401; the UI then shows "not connected."
- **Receipts:** Receipts are obtained per shop via the app (e.g. `GET /api/receipts?shop_id=&limit=&offset=`). Response includes at least: receipt_id, order_id, buyer name, ship-to address fields, total_price, total_shipping_cost, currency_code, was_paid, was_shipped, creation_tsz (or equivalent). Exact field names follow the Etsy API and the app's mapping.

---

### 5. Future: Dashboard tab in full UI

When the tabbed layout (ADR-009) exists:

- The **Dashboard** tab is the **same** content as described above: header (or shared app header), then shop selector (when connected) and recent orders table. The "Connect Etsy" / "Disconnect" actions may live in the shared header or in the Config tab; the dashboard tab still shows the same "not connected" vs "connected" content in its main area.
- The dashboard tab may **additionally** show: summary cards (e.g. orders this week, revenue MTD) and links into the outstanding list, as described in ui-design.md §2. Those additions do not change the core behavior above; they extend it.

## Consequences

- **Positive**
  - One ADR defines exactly what the dashboard is. No ambiguity for implementers or reviewers.
  - Clear separation of "not connected" vs "connected" and exact table columns and states.
  - Easy to test and accept: behavior and content are specified.

- **Negative**
  - Any change to dashboard content or behavior should be reflected in this ADR (or a superseding one).

## Notes

- ADR-007 defines the base system (OAuth, API routes, token storage); the **dashboard UI** is specified here. ADR-007 may reference this ADR for the dashboard.
- ui-design.md §2 describes the dashboard tab's purpose (snapshot, quick stats, link to outstanding); this ADR is the authoritative specification of structure and behavior for the current and near-term dashboard.

### Extensions (updated 2026-05-24)

- **KPI widgets (ADR-024, ADR-038, ADR-064, ADR-066):** In addition to Etsy receipts preview, the dashboard shows local-order KPIs via `GET /api/dashboard`, `GET /api/dashboard/inventory-value`, and `GET /api/dashboard/stats` (ADR-018 §10). Persisted `orders` are authoritative for revenue metrics; receipts are not the long-term data store (ADR-019).
- **Activity feed widget (ADR-037):** The dashboard includes a "Recent Activity" widget showing the most recent activity log entries (e.g. last 20). The widget uses the `GET /api/activity?limit=20` endpoint. Each entry shows timestamp, action description, and an optional link to the related entity. This supplements the summary cards mentioned in section 5 above. **(Superseded by the 2026-06-21 Activity views block below for the exact row count, layout, and width.)**
- **Shared components (ADR-028):** All dashboard UI elements (buttons, loading states, error states, empty states, badges) use the shared component library (`Button`, `LoadingSpinner`, `EmptyState`, `ErrorPanel`, `Badge`). The receipts table uses the `DataTable` component.
- **Setup wizard (ADR-044):** First-run wizard overlays the dashboard when `setup.completed` is not `"true"`.

### Extensions (updated 2026-06-21) — Activity views (WS-B) and Low-quality inventory widget (WS-D)

Source: `documents/PROGRAM_2026-06-21_major-enhancements.md` (workstreams B and D).

#### 6. Activity views — "Recent Activity" and "Activity log" (WS-B)

The dashboard presents **two views of the same activity data** (`activity_log`, served by
`GET /api/activity`). They are not different datasets — only different presentations.

- **Side-by-side row:** The two views sit in one responsive row. **Width split is fixed at
  Recent Activity = 1/3, Activity log = 2/3** on `lg` and up (implemented as a 3-column grid
  with `col-span-1` / `col-span-2`). Below `lg` they stack full width (Recent Activity first).
  The narrower Recent Activity column exists specifically so the Activity log can show **all**
  of its columns without horizontal crowding.

- **Recent Activity (left, 1/3):**
  - Shows the **newest 25 records only** (`GET /api/activity?limit=25`, newest first). It is a
    fixed snapshot — **no pagination, no footer, no "load more."** (This supersedes the earlier
    `limit=20` and any paginated compact behavior.)
  - **Single-spaced** rows. Three columns: **Time | Activity | Originator**, with column
    headers. The **Activity** column truncates with an ellipsis when it overflows and shows the
    full text on hover (native `title`). **Originator** maps `source`: `user`→User,
    `system`→System, `etsy_sync`→Etsy.
  - Rows for entities that still exist link to the record (deep-link per ADR-035). Rows for
    **deleted** records show **no link** (WS-A decision). Header actions: "View all →" (scrolls
    to / focuses the Activity log) and "Refresh".

- **Activity log (right, 2/3):** The full, searchable, filterable, **paginated** view
  (entity-type filter chips, search, page size). Its filter taxonomy and the set of logged
  entity types are specified in **ADR-037** (expanded by WS-A); this ADR fixes only its
  placement and width on the dashboard.

#### 7. Low-quality inventory widget (WS-D)

A dashboard widget listing **current inventory items below the listing-quality threshold**, so
the user can quickly find items needing work.

- **Inclusion:** items whose listing quality score is **below the pass threshold**. Pass =
  **score ≥ 85** (85 passes); therefore the widget lists items with **score < 85**. (The target
  threshold will rise toward ≈98% when the WS-G quality rubric lands; the widget reads whatever
  the current threshold is and does not hard-code 85 beyond this default.)
- **Exclusions:** items with status **Sold, Retired,** or **Inactive** are never shown (out of
  scope). Only active/listable items appear.
- **Presentation:** a **scrollable**, single-spaced list, **sorted lowest score first**.
  Each row shows at minimum: item number, listing title (or description fallback), and the
  quality score; clicking a row deep-links to the inventory detail for that item
  (`/inventory?itemId=<id>`, ADR-035).
- **Data source:** listing quality score per ADR-068 (`GET /api/inventory/[id]/listing-score`
  and/or a list endpoint exposing the score; the exact list endpoint is specified in ADR-018
  when WS-D is implemented). Empty state: a positive message (e.g. "All active items meet the
  quality threshold.").

**Implementation note (WS-D):** the widget reads the existing `listing.min_quality_score` setting
(default 80) so it matches the Inventory list badge and Outstanding; the 85/`listing.quality_threshold`
target will be unified under WS-G.

**Cross-references checked (per .cursorrules §1b):** ADR-037 (activity data + taxonomy — WS-A
will expand), ADR-035 (deep-link targets), ADR-064 (widget pattern), ADR-068 (quality score),
ADR-018 (endpoints), ADR-028 (shared components). No contradictions introduced; ADR-037/018
updates for the expanded activity taxonomy and the WS-D list endpoint are tracked in the program
doc and will be made when those workstreams execute.
