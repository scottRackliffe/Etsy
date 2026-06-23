# Frontend architecture — component tree, routing, and build guide

This document is the implementation companion for **ADR-024** (frontend component architecture). It provides the complete component tree, routing map, prop contracts, and build order so a developer can decompose the monolithic `page.tsx` into a maintainable component structure.

For the architectural decision and rationale, see [ADR-024](adr/0024-frontend-component-architecture.md).

---

## 1. Routing map

| URL path         | Page file                              | Tab         | Description                                                                                                                  |
| ---------------- | -------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `/`              | `src/app/page.tsx`                     | —           | Redirects to `/dashboard`                                                                                                    |
| `/dashboard`     | `src/app/(app)/dashboard/page.tsx`     | Dashboard   | KPI cards, recent orders, sync status                                                                                        |
| `/sales`         | `src/app/(app)/orders/page.tsx`         | Sales       | Order list, detail, new order, mark paid/shipped                                                                             |
| `/inventory`     | `src/app/(app)/inventory/page.tsx`     | Inventory   | Item list, detail panel, pictures, listing workshop (ADR-030)                                                                |
| ~~`/listing-coach`~~ | — | — | **REMOVED (ADR-085):** new items use the inline SEMS create on `/inventory`; the AI Generate step lives in the inventory detail editor. |
| `/customers`     | `src/app/(app)/customers/page.tsx`     | Customers   | Customer list, detail panel, addresses, purchase history                                                                     |
| `/reports`       | `src/app/(app)/reports/page.tsx`       | Reports     | Report chooser, options, viewer                                                                                              |
| `/outstanding`   | `src/app/(app)/outstanding/page.tsx`   | Outstanding | Full-page outstanding list                                                                                                   |
| `/tutorial`      | `src/app/(app)/tutorial/page.tsx`      | Tutorial    | Search, index, articles, tips folder links                                                                                   |
| `/config`        | `src/app/(app)/settings/page.tsx`        | Config      | Etsy connection, business details, AI settings, backup                                                                       |

---

## 2. App shell layout

File: `src/app/(app)/layout.tsx`

```
┌─────────────────────────────────────────────────┐
│  AppHeader (connection status, shop selector)    │
├─────────────────────────────────────────────────┤
│  TabBar (Dashboard | Sales | Inventory | ... )   │
├─────────────────────────────────────────────────┤
│              Main Content                        │
│              {children}                          │
│                                                  │
└─────────────────────────────────────────────────┘
```

**Note (updated 2026-05-24):** The Commands Panel and Outstanding Panel are deferred to post-v1 per ADR-009. In v1, the layout is header + tab bar + full-width main content. Context-sensitive actions are placed inline on each page.

---

## 3. Component catalog

### 3.1 Shell components

#### `AppHeader`

- **File:** `src/components/shell/AppHeader.tsx`
- **Client component:** Yes
- **Props:** None (reads context)
- **Behavior:**
  - Displays app name ("Trudy's AiCE" or from `settings.business_name`)
  - Shows Etsy connection badge: green "Connected" / red "Not Connected"
  - When connected: shop selector dropdown (if multiple shops)
  - Last sync timestamp from `settings.last_etsy_sync_at`

#### `TabBar`

- **File:** `src/components/shell/TabBar.tsx`
- **Client component:** Yes
- **Props:** None
- **Behavior:**
  - Renders 8 tab links: Dashboard, Sales, Inventory, Customers, Reports, Outstanding, Tutorial, Config
  - Active tab determined by `usePathname()` match
  - Outstanding tab shows badge with count from `useOutstanding()` hook
  - Uses `<Link>` for client-side navigation
  - Tabs use the color palette from `documents/System_Colors.md`

**Note (updated 2026-05-24):** `CommandsPanel`, `OutstandingPanel`, and `LayoutSwapButton` are deferred to post-v1 per ADR-009. Context-sensitive actions are placed inline on each page using `Button` components.

### 3.2 Shared UI components

#### `Button`

- **File:** `src/components/ui/Button.tsx`
- **Props:** `{ variant: "primary" | "secondary" | "danger"; children: ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit"; loading?: boolean }`
- **Behavior:** Styled action button; maps variants to color palette; shows spinner when loading; disabled state grays out.

#### `DataTable`

- **File:** `src/components/ui/DataTable.tsx`
- **Props:**
  ```typescript
  {
    columns: Array<{ key: string; label: string; sortable?: boolean; render?: (value, row) => ReactNode }>;
    data: unknown[];
    total: number;
    page: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onSort?: (key: string, direction: "asc" | "desc") => void;
    onRowClick?: (row: unknown) => void;
    selectedId?: number | string;
    emptyMessage?: string;
    loading?: boolean;
  }
  ```
- **Behavior:** Renders a table with header, rows, pagination controls, sort indicators, row selection highlight, loading state, and empty state.

#### `FormField`

- **File:** `src/components/ui/FormField.tsx`
- **Props:**
  ```typescript
  {
    label: string;
    name: string;
    type: "text" | "number" | "email" | "select" | "textarea" | "date" | "toggle";
    value: string | number | boolean;
    onChange: (value) => void;
    options?: Array<{ value: string; label: string }>; // for select
    error?: string;
    required?: boolean;
    placeholder?: string;
    helpText?: string;
    disabled?: boolean;
  }
  ```

#### `Modal`

- **File:** `src/components/ui/Modal.tsx`
- **Props:** `{ open: boolean; title: string; children: ReactNode; onClose: () => void; onConfirm?: () => void; confirmLabel?: string; destructive?: boolean }`

#### `Toast`

- **File:** `src/components/ui/Toast.tsx`
- **Props:** Managed via a `useToast()` hook that provides `showToast(message, type)`.
- **Types:** `success`, `error`, `info`, `warning`
- **Behavior:** Auto-dismiss after 5 seconds; dismissible manually; stacks multiple toasts.

#### `Badge`

- **File:** `src/components/ui/Badge.tsx`
- **Props:** `{ label: string; variant: "success" | "warning" | "error" | "neutral" | "info" }`
- **Variants map:** Canonical full tables in **ADR-071 §4** (orders, inventory, listing, Etsy connection). Quick reference: Paid/Shipped/Sold=success; Unpaid/Not shipped/In stock=warning; Listed/Etsy=info; Void/Cancelled/Draft=neutral

#### `PictureGrid`

- **File:** `src/components/ui/PictureGrid.tsx`
- **Props:**
  ```typescript
  {
    pictures: Array<{ slot: number; path: string | null }>;
    maxSlots: number; // 10 for main, 5 for condition
    onImport: () => void;
    onReplace: (slot: number) => void;
    onRemove: (slot: number) => void;
    onReorder: (newOrder: number[]) => void;
    whyPicturesMatterUrl?: string;
  }
  ```
- **Behavior:** Renders picture thumbnails in a grid; empty slots show a dashed placeholder; drag-and-drop reorder; each slot has replace/remove actions; "Import pictures" button; "Why pictures matter" link.

#### `PickList`

- **File:** `src/components/ui/PickList.tsx`
- **Props:** `{ onSelect: (item: InventoryItem) => void; selectedId?: number }`
- **Behavior:** Fetches from `GET /api/inventory/pick-list`; shows thumbnail + item number + description; type-to-filter input; scrollable list; click to select.

#### `PdfPreview`

- **File:** `src/components/ui/PdfPreview.tsx`
- **Props:** `{ reportUrl: string; reportName: string; onClose: () => void }`
- **Behavior:** Embeds PDF in an `<iframe>` or `<object>` tag; action bar with Print, Export PDF (download), Export CSV (alternate download URL), Cancel buttons per ADR-013.

#### `ErrorPanel`

- **File:** `src/components/ui/ErrorPanel.tsx`
- **Props:** `{ title?: string; message: string; onRetry?: () => void }`
- **Behavior:** Displays a user-friendly error message with optional retry button; styled with `--ui-red` accent.

#### `ConfirmDialog`

- **File:** `src/components/ui/ConfirmDialog.tsx`
- **Props:** `{ open: boolean; title: string; message: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void; destructive?: boolean }`
- **Behavior:** Wraps `Modal` for destructive action confirmation (ADR-032); confirm button uses danger variant when `destructive` is true; cancel is always available.

### 3.3 Tab-specific components

Full component list per tab is specified in ADR-024 §3.3. Key behavioral notes:

**Dashboard tab:**

- `DashboardKpiCards` — Revenue MTD, orders this month, items listed, outstanding count
- `RecentOrdersList` — Last 10 orders with status badges
- `EtsySyncStatus` — Last sync date, sync button, connection health
- `ActivityFeed` — Recent activity log entries widget (ADR-037)

**Orders tab:**

- `NewOrderForm` uses `PickList` for item selection; creates order via `POST /api/orders` then `POST` order items.
- `MarkShippedForm` shows shipper dropdown (USPS/UPS/FedEx/DHL/Other), date picker, shipping cost input; warns if not paid (ADR-021 §11, ship-without-paid override).

**Inventory tab:**

- `ListingAuthoringPanel` has three modes (Manual / Generate in app / Import AI draft) per ADR-023.
  - Manual mode: structured form with all listing sections (title strategy, product story, condition clarity, attributes, tags, pricing/shipping notes, quality checklist).
  - Generate mode: readiness check → "Generate" button → loading → review generated content → edit → approve.
  - Import mode: paste JSON or upload file → validate schema → review → approve.
- "Publish to Etsy" becomes available only when `listing_phase = 'listing_ready'` (ADR-085) plus the required Etsy fields are set. (The retired `listing_draft_state = 'approved'` gate no longer applies.)

**Settings tab:**

- `AiSettingsForm` fields: provider dropdown, model text input, API key (password field, masked in display), base URL (optional), timeout, retry count, token budget. "Test Connection" button calls `POST /api/settings/ai/test-connection`.
- `BackupSection` per ADR-027.

**Reports tab:**

- `ReportChooser` — Grid of available report types
- `ReportDateRange` — From/To date inputs with quick presets (MTD, YTD, last 30 days) per ADR-036
- `ReportOptionsForm` — Order/customer selection per report type
- `ReportViewer` (wraps `PdfPreview`) — PDF preview with Print / Export PDF / Export CSV / Cancel

---

## 4. Shared hooks

| Hook             | File                          | Purpose                                                                            |
| ---------------- | ----------------------------- | ---------------------------------------------------------------------------------- |
| `useApi`         | `src/hooks/useApi.ts`         | Generic fetch wrapper; handles loading, error states, 401 redirect, toast on error |
| `useSettings`    | `src/hooks/useSettings.ts`    | Read/write settings via `/api/settings`; caches in state                           |
| `useOutstanding` | `src/hooks/useOutstanding.ts` | Fetches and aggregates outstanding items from multiple sources                     |
| `usePagination`  | `src/hooks/usePagination.ts`  | Manages `page`, `pageSize`, `total`, provides `onPageChange`                       |
| `useToast`       | `src/hooks/useToast.ts`       | Toast notification state and `showToast()` function                                |

---

## 5. Shared types

File: `src/types/index.ts`

Extract all type definitions currently inline in `page.tsx` into a shared types file:

```typescript
export type Shop = { shop_id: number; shop_name: string };
export type InventoryItem = { id: number; item_number: string | null /* ... all fields */ };
export type Customer = { id: number; first_name: string | null /* ... */ };
export type CustomerAddress = { id: number; customer_id: number /* ... */ };
export type Order = { id: number; order_number: string | null /* ... */ };
export type Receipt = { receipt_id: number; order_id: number /* ... */ };
export type OutstandingItem = {
  type:
    | "paid_not_shipped"
    | "unpaid"
    | "not_listed"
    | "missing_address"
    | "missing_shipping_cost"
    | "etsy_not_synced"
    | "validation_issue"; // last two are future types (ADR-020 types 3 & 7)
  type_label: string;
  label: string;
  target_tab: string;
  target_record_id: number | string;
  date: string;
};
export type ReportResult = { report_name: string; generated_at: string /* ... */ };
export type ApiError = {
  ok: false;
  error: {
    code?: string;
    message: string;
    user_message: string;
    actions: string[];
    can_retry?: boolean;
  };
  fields?: Record<string, string[]>;
};
```

---

## 6. Build order (migration from page.tsx)

| Step | What to build                                                                                      | Depends on                                         | Exit criterion                                                    |
| ---- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| 1    | Routing structure: create all page files with placeholder content; create `(app)/layout.tsx` shell | —                                                  | All routes render a placeholder; navigation works                 |
| 2    | Shared types (`src/types/index.ts`)                                                                | —                                                  | Types extracted from page.tsx; no inline type defs remaining      |
| 3    | Shell components: `AppHeader`, `TabBar`                                                            | Step 1                                             | Tab navigation works; connection status shows                     |
| 4    | Shared UI: `DataTable`, `FormField`, `Modal`, `Toast`, `Badge`, `EmptyState`, `LoadingSpinner`     | —                                                  | Components render in isolation                                    |
| 5    | Hooks: `useApi`, `useSettings`, `usePagination`, `useToast`                                        | Step 4                                             | Hooks work with existing API routes                               |
| 6    | Dashboard tab: extract from page.tsx                                                               | Steps 3–5                                          | Dashboard shows KPI cards, recent orders, sync status             |
| 7    | Orders tab: extract orders list, detail, new order, mark paid/shipped                               | Steps 4–5 + `PickList`                             | Orders tab fully functional                                        |
| 8    | Inventory tab: extract item list, detail, pictures, listing, condition                             | Steps 4–5 + `PictureGrid`, `ListingAuthoringPanel` | Inventory CRUD + listing workflow works                           |
| 9    | Customers tab: extract customer list, detail, addresses                                            | Steps 4–5                                          | Customer CRUD works                                               |
| 10   | Outstanding panel + full-page tab                                                                  | Step 5 + `useOutstanding`                          | Outstanding items display; click navigates correctly              |
| 11   | Reports tab                                                                                        | Steps 4–5 + `PdfPreview`                           | All core reports + ADR-038/039/054/056 types generate and display |
| 12   | Settings tab                                                                                         | Steps 4–5                                          | All settings editable; Etsy connect/disconnect works              |
| 13   | Tutorial tab                                                                                       | `SearchInput`, `TutorialIndex`                     | Search and index work; tips folder links open files               |
| 14   | Commands panel _(deferred to post-v1)_                                                             | Steps 6–13                                         | Context-sensitive commands work for all tabs                      |
| 15   | Delete monolithic page.tsx                                                                         | All above                                          | Old file removed; all tests pass                                  |

Each step is independently deployable. The monolithic page.tsx can coexist during migration by keeping it at `/legacy` or similar.

---

## 7. CSS and styling approach

- Continue using **Tailwind CSS** utility classes (no CSS modules, no styled-components).
- Color palette from `documents/System_Colors.md` is defined as CSS custom properties in `globals.css`.
- **Responsive layout:** full spec in **ADR-061** (breakpoints, stacked master-detail, card vs table per page). This section is a summary only.
- On mobile: tab bar scrolls horizontally.

---

## 8. Components for ADR-038–069 (add during priorities 21–52)

| Component                        | ADR | Used on                           |
| -------------------------------- | --- | --------------------------------- |
| `SearchModal`                    | 041 | App shell (Cmd/Ctrl+K)            |
| `NotificationCenter`             | 051 | App header                        |
| `PrintQueuePanel`                | 055 | App header                        |
| `SetupWizardModal`               | 044 | Dashboard overlay                 |
| `BatchActionsBar`                | 040 | Sales, Inventory, Customers lists |
| `ProgressModal` / job polling    | 043 | Sync, import, backup, batch       |
| `CustomerNotesSection`           | 065 | Customer detail                   |
| `CustomerMergeModal`             | 053 | Customers tab                     |
| `ProfitabilityRow`               | 038 | Inventory detail                  |
| `ListingScoreWidget`             | 068 | Inventory listing workshop        |
| `InventoryValueCard`             | 064 | Dashboard                         |
| `OfflineBanner` / retry queue UI | 050 | App shell                         |

API routes for these features: **ADR-018** Extensions §12–§28.

---

_This document is the build guide for the frontend. For the architectural decision, see ADR-024. For the UI design (behavior and UX), see ui-design.md. For API contracts, see ADR-018._
