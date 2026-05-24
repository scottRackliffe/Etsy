# ADR-024: Frontend component architecture — routing, layout, and component structure

## Status

Accepted

## Date

2026-05-24

## Context

The current application UI is a single monolithic client component (`src/app/page.tsx`, ~3,000 lines) containing all tabs, forms, lists, modals, and state. This makes the codebase difficult to maintain, test, and extend. The UI design (ADR-009, ui-design.md) defines 8 tabs, context-sensitive commands, an outstanding panel, and numerous forms — none of which can scale inside a single file.

This ADR defines how to decompose the frontend into a component architecture using Next.js App Router conventions.

## Decision

### 1. Routing structure (Next.js App Router)

Each top-level tab becomes a route segment under a shared layout shell. The root `page.tsx` redirects to `/dashboard`.

```
src/app/
  layout.tsx                    # Root HTML/body, fonts, metadata
  (app)/
    layout.tsx                  # App shell: header, tab bar, commands panel, outstanding panel
    dashboard/
      page.tsx                  # Dashboard tab content
    sales/
      page.tsx                  # Sales/Orders tab content
    inventory/
      page.tsx                  # Inventory tab content
      [id]/
        page.tsx                # Inventory item detail/edit
    customers/
      page.tsx                  # Customers tab content
      [id]/
        page.tsx                # Customer detail/edit
    reports/
      page.tsx                  # Reports tab content
    outstanding/
      page.tsx                  # Full-page Outstanding tab
    tutorial/
      page.tsx                  # Tutorial and tips tab
    config/
      page.tsx                  # Config/Settings tab
  page.tsx                      # Root redirect → /dashboard
```

The `(app)` route group wraps all tabbed pages in a shared layout without adding a URL segment.

### 2. App shell layout (`(app)/layout.tsx`)

The shared layout renders:

| Area | Component | Position | Behavior |
|------|-----------|----------|----------|
| **Header** | `<AppHeader />` | Top, full width | App name, Etsy connection status indicator, shop selector (when connected) |
| **Tab bar** | `<TabBar />` | Below header, full width | 8 tabs as `<Link>` elements; active tab highlighted via `usePathname()` |
| **Commands panel** | `<CommandsPanel />` | Left or right (configurable via `panel_layout` setting) | Context-sensitive commands for the active tab; rendered via tab-specific command config |
| **Outstanding panel** | `<OutstandingPanel />` | Opposite side from commands | Data-driven to-do list; clicking navigates to correct tab/record (context in place) |
| **Main content** | `{children}` | Center | Active tab page content |

Layout is a CSS grid:
```
header:    full width
tab-bar:   full width
body:      [commands] [main-content] [outstanding]
```

Panel sides are swappable via setting (`panel_layout`). An icon button in the header toggles the layout. On mobile (<768px), panels collapse to slide-out drawers.

### 3. Component hierarchy

#### 3.1 Shell components (`src/components/shell/`)

| Component | Props | Responsibility |
|-----------|-------|----------------|
| `AppHeader` | — | App title, connection status badge, shop selector dropdown, layout swap icon |
| `TabBar` | — | Tab links; reads `usePathname()` for active state |
| `CommandsPanel` | `tab: string` | Renders command buttons for the current tab; receives tab identifier from layout |
| `OutstandingPanel` | — | Fetches and displays outstanding items; handles click → navigation |
| `LayoutSwapButton` | — | Toggles `panel_layout` setting |

#### 3.2 Shared UI components (`src/components/ui/`)

| Component | Purpose |
|-----------|---------|
| `DataTable` | Sortable, paginated table with column definitions; used by Sales, Inventory, Customers, Reports |
| `FormField` | Label + input + validation error display; supports text, number, select, textarea |
| `Modal` | Confirmation dialogs (delete, ship-without-paid override, disconnect) |
| `Toast` | Success/error/info notification banner with auto-dismiss |
| `EmptyState` | Placeholder when a list has no data |
| `LoadingSpinner` | Consistent loading indicator |
| `Badge` | Status badges (Paid, Shipped, Draft, Listed, etc.) |
| `PictureGrid` | Display/reorder/remove picture slots (used in Inventory detail) |
| `PickList` | Item pick list with thumbnail + name + type-to-filter (ADR-015) |
| `SearchInput` | Search box with debounce (used in Tutorial tab and item filter) |
| `PdfPreview` | Report preview with Print / Export PDF / Export CSV / Cancel actions |

#### 3.3 Tab page components

Each tab page is a server component that may contain client components for interactive sections.

**Dashboard** (`src/app/(app)/dashboard/page.tsx`)
- `DashboardKpiCards` — Revenue MTD, orders this month, items listed, outstanding count
- `RecentOrdersList` — Last 10 orders with status badges
- `EtsySyncStatus` — Last sync date, sync button, connection health

**Sales** (`src/app/(app)/sales/page.tsx`)
- `OrdersTable` — Filterable order list (date, status, paid/shipped)
- `OrderDetailCard` — Expanded view of selected order with line items
- `NewOrderForm` — Manual order entry with `PickList` for item selection
- `MarkPaidButton`, `MarkShippedForm` — Action components with validation

**Inventory** (`src/app/(app)/inventory/page.tsx`)
- `InventoryTable` — Item list with thumbnail, status, listing state
- `InventoryDetailForm` — Full edit form (item info, condition, costs)
- `PictureImportFlow` — Directory picker → preview → confirm → assign slots
- `ConditionSection` — Condition code dropdown, has-issue toggle, notes, condition pictures
- `ListingAuthoringPanel` — Mode toggle (Manual / Generate / Import), form sections, approve/reject
- `PublishPreview` — Preview Etsy listing before publish; approve gate

**Customers** (`src/app/(app)/customers/page.tsx`)
- `CustomersTable` — Customer list with address completeness indicator
- `CustomerDetailForm` — Edit form with address management
- `AddressCard` — Individual address display/edit
- `CustomerPurchaseHistory` — Orders filtered by customer

**Reports** (`src/app/(app)/reports/page.tsx`)
- `ReportChooser` — Grid/list of available report types
- `ReportOptionsForm` — Date range, order/customer selection per report type
- `ReportViewer` — PDF preview with Print / Export PDF / Export CSV / Cancel (ADR-013)

**Outstanding** (`src/app/(app)/outstanding/page.tsx`)
- `OutstandingFullList` — Full-page version of the outstanding panel
- Reuses `OutstandingPanel` component in full-page mode

**Tutorial** (`src/app/(app)/tutorial/page.tsx`)
- `TutorialSearch` — Search over knowledge base content
- `TutorialIndex` — Browsable topic list
- `TutorialArticle` — Rendered markdown article view
- `TipsFolderLinks` — Links to files in system/tips/ and custom folder

**Config** (`src/app/(app)/config/page.tsx`)
- `EtsyConnectionCard` — Connect/disconnect, redirect URI, token status
- `BusinessDetailsForm` — Name, address, logo upload
- `ShippingInfoForm` — Per-carrier shipping configuration
- `AiSettingsForm` — Provider, model, API key (masked), test connection
- `PreferencesForm` — Date format, first-day-of-week, panel layout, thumbnail size
- `BackupSection` — Backup directory, schedule, manual backup trigger

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

#### 4.4 Context-in-place navigation

When the outstanding panel navigates to a record:
1. Router pushes to the correct tab route (e.g. `/sales`)
2. URL search params encode the target record (e.g. `?order_id=123`)
3. The target tab page reads search params and auto-selects/scrolls to that record

### 5. File organization

```
src/
  app/
    layout.tsx              # Root layout (HTML, fonts)
    page.tsx                # Redirect to /dashboard
    (app)/
      layout.tsx            # App shell (header, tabs, panels)
      dashboard/page.tsx
      sales/page.tsx
      inventory/page.tsx
      inventory/[id]/page.tsx
      customers/page.tsx
      customers/[id]/page.tsx
      reports/page.tsx
      outstanding/page.tsx
      tutorial/page.tsx
      config/page.tsx
    api/                    # Existing API routes (unchanged)
  components/
    shell/
      AppHeader.tsx
      TabBar.tsx
      CommandsPanel.tsx
      OutstandingPanel.tsx
      LayoutSwapButton.tsx
    ui/
      DataTable.tsx
      FormField.tsx
      Modal.tsx
      Toast.tsx
      EmptyState.tsx
      LoadingSpinner.tsx
      Badge.tsx
      PictureGrid.tsx
      PickList.tsx
      SearchInput.tsx
      PdfPreview.tsx
    dashboard/
      DashboardKpiCards.tsx
      RecentOrdersList.tsx
      EtsySyncStatus.tsx
    sales/
      OrdersTable.tsx
      OrderDetailCard.tsx
      NewOrderForm.tsx
      MarkPaidButton.tsx
      MarkShippedForm.tsx
    inventory/
      InventoryTable.tsx
      InventoryDetailForm.tsx
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
      ShippingInfoForm.tsx
      AiSettingsForm.tsx
      PreferencesForm.tsx
      BackupSection.tsx
  hooks/
    useApi.ts               # Generic fetch wrapper with error handling
    useSettings.ts          # Read/write settings
    useOutstanding.ts       # Fetch outstanding items
    usePagination.ts        # Pagination state helper
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
