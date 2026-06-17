# ADR-024: Frontend component architecture — routing, layout, and component structure

## Status

Accepted

## Date

2026-05-24

## Context

The current application UI is a single monolithic client component (`src/app/page.tsx`, ~3,000 lines) containing all tabs, forms, lists, modals, and state. This makes the codebase difficult to maintain, test, and extend. The UI design (ADR-009, ui-design.md) defines 9 tabs, context-sensitive commands, an outstanding panel, and numerous forms — none of which can scale inside a single file.

This ADR defines how to decompose the frontend into a component architecture using Next.js App Router conventions.

## Decision

### 1. Routing structure (Next.js App Router)

Each top-level tab becomes a route segment under a shared layout shell. The root `page.tsx` redirects to `/dashboard`.

```
src/app/
  layout.tsx                    # Root HTML/body, fonts, metadata
  (app)/
    layout.tsx                  # App shell: header, tab bar
    dashboard/
      page.tsx                  # Dashboard tab content
    sales/
      page.tsx                  # Sales/Orders tab — master-detail layout (ADR-031)
    inventory/
      page.tsx                  # Inventory tab — detail panel with listing fields (ADR-030)
    receipts/
      page.tsx                  # Receipts tab — vendor purchase receipts with inventory linking
    customers/
      page.tsx                  # Customers tab content
    reports/
      page.tsx                  # Reports tab content
    outstanding/
      page.tsx                  # Full-page Outstanding tab
    tutorial/
      page.tsx                  # Tutorial and tips tab
    config/
      page.tsx                  # Config/Settings tab
    listing-coach/
      page.tsx                  # Listing Coach wizard (ADR-072) — new listing flow
  page.tsx                      # Root redirect → /dashboard
```

The `(app)` route group wraps all tabbed pages in a shared layout without adding a URL segment.

**Note (updated 2026-06-16):** The original ADR-024 included `inventory/[id]/page.tsx` and `customers/[id]/page.tsx` detail routes. These are removed. The Listing Workshop panel has been removed from the inventory page; listing fields (title, description, tags, etc.) are now consolidated into the `InventoryDetailPanel` component. A "Regenerate with AI" button replaces the separate workshop modes. Receipts (vendor purchase records) have been extracted into a dedicated `/receipts` tab. ADR-030 and ADR-031 specify that detail views are inline panels on the list page (master-detail layout), not separate routes. This avoids unnecessary page transitions and keeps context visible. Deep-link query parameters (`?itemId=`, `?orderId=`, `?customerId=`) select and scroll to the target record within the list page (ADR-035).

### 2. App shell layout (`(app)/layout.tsx`)

The shared layout renders:

| Area             | Component       | Position                  | Behavior                                                                   |
| ---------------- | --------------- | ------------------------- | -------------------------------------------------------------------------- |
| **Header**       | `<AppHeader />` | Top, full width           | App name, Etsy connection status indicator, shop selector (when connected) |
| **Tab bar**      | `<TabBar />`    | Below header, full width  | 9 tabs as `<Link>` elements; active tab highlighted via `usePathname()`    |
| **Main content** | `{children}`    | Below tab bar, full width | Active tab page content                                                    |

**Note (updated 2026-05-24):** The original ADR-024 included `CommandsPanel` and `OutstandingPanel` as persistent side panels flanking the main content. These are deferred to post-v1 per ADR-009. In v1, context-sensitive actions are placed inline on each page using `Button` components (ADR-028). The Outstanding tab serves as the full-page outstanding list. The `panel_layout` setting and layout swap button are also deferred.

Layout is a CSS grid:

```
header:    full width
tab-bar:   full width
body:      [main-content]
```

On mobile (<768px), the tab bar scrolls horizontally.

### 3. Component hierarchy

#### 3.1 Shell components (`src/components/shell/`)

| Component   | Props | Responsibility                                             |
| ----------- | ----- | ---------------------------------------------------------- |
| `AppHeader` | —     | App title, connection status badge, shop selector dropdown |
| `TabBar`    | —     | Tab links; reads `usePathname()` for active state          |

#### 3.2 Shared UI components (`src/components/ui/`)

| Component        | Purpose                                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DataTable`      | Sortable, paginated table with column definitions; used by Sales, Inventory, Customers, Reports. Supports `search`, `sort_by`, `sort_dir` query params (ADR-029). |
| `FormField`      | Label + input + validation error display; supports text, number, select, textarea                                                                                 |
| `Modal`          | General-purpose dialog; used by `ConfirmDialog` wrapper (ADR-032)                                                                                                 |
| `Button`         | Styled action button with variant (primary, secondary, danger) (ADR-028)                                                                                          |
| `Toast`          | Success/error/info notification banner with auto-dismiss                                                                                                          |
| `EmptyState`     | Placeholder when a list has no data                                                                                                                               |
| `LoadingSpinner` | Consistent loading indicator                                                                                                                                      |
| `ErrorPanel`     | Error display with retry action                                                                                                                                   |
| `Badge`          | Status badges (Paid, Shipped, Draft, Listed, etc.)                                                                                                                |
| `PictureGrid`    | Visual upload grid with drag-and-drop, thumbnail preview, and drag-to-reorder (ADR-033)                                                                           |
| `PickList`       | Item pick list with thumbnail + name + type-to-filter (ADR-015)                                                                                                   |
| `SearchInput`    | Search box with debounce (used in Tutorial tab and item filter)                                                                                                   |
| `PdfPreview`     | Report preview with Print / Export PDF / Export CSV / Cancel actions                                                                                              |
| `ConfirmDialog`  | Confirmation wrapper around `Modal` for destructive actions (ADR-032)                                                                                             |

#### 3.3 Tab page components

Each tab page is a server component that may contain client components for interactive sections.

**Dashboard** (`src/app/(app)/dashboard/page.tsx`)

- `DashboardKpiCards` — Revenue MTD, orders this month, items listed, outstanding count
- `RecentOrdersList` — Last 10 orders with status badges
- `EtsySyncStatus` — Last sync date, sync button, connection health
- `ActivityFeed` — Recent activity log entries (ADR-037)

**Sales** (`src/app/(app)/sales/page.tsx`)

- Master-detail layout (ADR-031): order list on left, detail panel on right
- `OrdersTable` — Filterable order list with search, sort, pagination (ADR-029)
- `OrderDetailPanel` — Full detail view: header, line items, ship-to, financials, shipping, notes, action buttons
- `NewOrderForm` — Manual order entry with `PickList` for item selection
- `MarkPaidButton`, `MarkShippedForm` — Action components with validation

**Inventory** (`src/app/(app)/inventory/page.tsx`)

- Two-panel layout (ADR-030): "Inventory detail" panel + "Listing workshop" panel
- `InventoryTable` — Item list with thumbnail, status, search, sort, pagination (ADR-029)
- `InventoryDetailPanel` — Core field editing: costs, status, dates, condition, notes (ADR-030)
- `PictureGrid` — Visual 10-slot upload grid with drag-and-drop (ADR-033)
- `ConditionSection` — Condition code dropdown, has-issue toggle, notes, condition pictures
- `ListingAuthoringPanel` — Mode toggle (Manual / Generate / Import), form sections, approve/reject
- `PublishPreview` — Preview Etsy listing before publish; approve gate

**Customers** (`src/app/(app)/customers/page.tsx`)

- `CustomersTable` — Customer list with address completeness indicator, search, sort, pagination (ADR-029)
- `CustomerDetailForm` — Edit form with address management
- `AddressCard` — Individual address display/edit
- `CustomerPurchaseHistory` — Orders filtered by customer

**Reports** (`src/app/(app)/reports/page.tsx`)

- `ReportChooser` — Grid/list of available report types
- `ReportDateRange` — From/To date inputs with quick presets (ADR-036)
- `ReportOptionsForm` — Order/customer selection per report type
- `ReportViewer` — PDF preview with Print / Export PDF / Export CSV / Cancel (ADR-013)

**Outstanding** (`src/app/(app)/outstanding/page.tsx`)

- `OutstandingFullList` — Full-page outstanding list with type filtering and auto-refresh
- Items link to target pages via deep-link query params (ADR-035)

**Tutorial** (`src/app/(app)/tutorial/page.tsx`)

- `TutorialSearch` — Search over knowledge base content
- `TutorialIndex` — Browsable topic list
- `TutorialArticle` — Rendered markdown article view
- `TipsFolderLinks` — Links to files in system/tips/ and custom folder

**Config** (`src/app/(app)/config/page.tsx`)

- 8 logical sections (ADR-034):
- `EtsyConnectionCard` — Connect/disconnect, redirect URI, token status
- `BusinessDetailsForm` — Name, address, logo upload
- `ShippingDefaultsForm` — Default carrier and shipping preferences
- `AiSettingsForm` — Provider, model, API key (masked), test connection
- `PublishDefaultsForm` — Etsy publish configuration (taxonomy, shipping profile)
- `DisplayPreferencesForm` — Date format, currency, page size, timezone
- `IconSection` — User icon/avatar settings
- `BackupSection` — Backup directory, schedule, manual backup/restore triggers (ADR-027)

### 4. State management

#### 4.1 Server state (data from API)

Use a lightweight fetch-and-cache pattern:

- Each page fetches its data via `fetch()` calls to the API routes.
- Client components use `useEffect` + `useState` for data fetching (consistent with current pattern).
- Shared data (connection status, shop selection, settings) is lifted to a `<AppProvider>` context in the app shell layout.

#### 4.2 Client state shape (`AppProvider` context)

```typescript
type AppState = {
  isConnected: boolean;
  shops: Shop[];
  selectedShopId: number | null;
  settings: Record<string, string>;
  lastSyncAt: string | null;
  outstandingCount: number;
};
```

The `AppProvider` wraps `{children}` in the app shell layout. It fetches connection status and settings on mount, and exposes them to all tab pages.

#### 4.3 Tab-local state

Each tab page manages its own list/detail state (selected item, form values, pagination). This state does not need to be global.

#### 4.4 Context-in-place navigation (ADR-035)

When the outstanding list navigates to a record:

1. Router pushes to the correct tab route (e.g. `/sales`)
2. URL search params encode the target record (e.g. `?orderId=123`)
3. The target tab page reads search params and auto-selects/scrolls to that record
4. A brief highlight animation draws attention to the target row
5. The URL is cleaned (search params removed) after selection

### 5. File organization

```
src/
  app/
    layout.tsx              # Root layout (HTML, fonts)
    page.tsx                # Redirect to /dashboard
    (app)/
      layout.tsx            # App shell (header, tabs)
      dashboard/page.tsx
      sales/page.tsx
      inventory/page.tsx
      customers/page.tsx
      reports/page.tsx
      outstanding/page.tsx
      tutorial/page.tsx
      config/page.tsx
    api/                    # Existing API routes (unchanged)
  components/
    shell/
      AppHeader.tsx
      TabBar.tsx
    ui/
      DataTable.tsx
      FormField.tsx
      Modal.tsx
      Button.tsx
      Toast.tsx
      EmptyState.tsx
      LoadingSpinner.tsx
      ErrorPanel.tsx
      Badge.tsx
      PictureGrid.tsx
      PickList.tsx
      SearchInput.tsx
      PdfPreview.tsx
      ConfirmDialog.tsx
    dashboard/
      DashboardKpiCards.tsx
      RecentOrdersList.tsx
      EtsySyncStatus.tsx
      ActivityFeed.tsx
    sales/
      OrdersTable.tsx
      OrderDetailPanel.tsx
      NewOrderForm.tsx
      MarkPaidButton.tsx
      MarkShippedForm.tsx
    inventory/
      InventoryTable.tsx
      InventoryDetailPanel.tsx
      PictureImportFlow.tsx
      ConditionSection.tsx
      ListingAuthoringPanel.tsx
      PublishPreview.tsx
    customers/
      CustomersTable.tsx
      CustomerDetailForm.tsx
      AddressCard.tsx
      CustomerPurchaseHistory.tsx
    reports/
      ReportChooser.tsx
      ReportDateRange.tsx
      ReportOptionsForm.tsx
      ReportViewer.tsx
    outstanding/
      OutstandingFullList.tsx
    tutorial/
      TutorialSearch.tsx
      TutorialIndex.tsx
      TutorialArticle.tsx
      TipsFolderLinks.tsx
    config/
      EtsyConnectionCard.tsx
      BusinessDetailsForm.tsx
      ShippingDefaultsForm.tsx
      AiSettingsForm.tsx
      PublishDefaultsForm.tsx
      DisplayPreferencesForm.tsx
      IconSection.tsx
      BackupSection.tsx
  hooks/
    useApi.ts               # Generic fetch wrapper with error handling
    useSettings.ts          # Read/write settings
    useOutstanding.ts       # Fetch outstanding items
    usePagination.ts        # Pagination state helper
    useToast.ts             # Toast notification management
  lib/                      # Existing server-side libraries (unchanged)
  types/
    index.ts                # Shared TypeScript types (Shop, Order, Customer, Inventory, etc.)
```

### 6. Migration strategy (from monolithic page.tsx)

1. Create the routing structure and app shell layout first (empty tab pages).
2. Extract shared UI components (`DataTable`, `FormField`, `Modal`, etc.) from existing inline JSX.
3. Extract shared types from `page.tsx` into `src/types/index.ts`.
4. Move each tab's content into its own page, one tab at a time (Dashboard first, then Sales, etc.).
5. Extract the `AppProvider` context for shared state.
6. Delete the original monolithic `page.tsx` when all tabs are migrated.

Each step is independently deployable; the app works at every intermediate state.

## Consequences

- **Positive:** Maintainable codebase; each component testable in isolation; new features added to the correct file; routing enables deep-linking and browser navigation; tab pages load only their own code.
- **Negative:** Migration effort from monolithic page; requires careful extraction to avoid regressions.

## Notes

- All API routes remain unchanged; only the frontend is restructured.
- The existing `src/lib/` server-side libraries are not affected.
- Component styling continues to use Tailwind CSS utility classes.
- This ADR does not prescribe a specific component library (e.g. Radix, Headless UI); plain HTML + Tailwind is sufficient for v1.
