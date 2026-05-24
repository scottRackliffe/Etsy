# Frontend architecture — component tree, routing, and build guide

This document is the implementation companion for **ADR-024** (frontend component architecture). It provides the complete component tree, routing map, prop contracts, and build order so a developer can decompose the monolithic `page.tsx` into a maintainable component structure.

For the architectural decision and rationale, see [ADR-024](adr/0024-frontend-component-architecture.md).

---

## 1. Routing map

| URL path | Page file | Tab | Description |
|----------|-----------|-----|-------------|
| `/` | `src/app/page.tsx` | — | Redirects to `/dashboard` |
| `/dashboard` | `src/app/(app)/dashboard/page.tsx` | Dashboard | KPI cards, recent orders, sync status |
| `/sales` | `src/app/(app)/sales/page.tsx` | Sales | Order list, detail, new order, mark paid/shipped |
| `/inventory` | `src/app/(app)/inventory/page.tsx` | Inventory | Item list with status/thumbnail |
| `/inventory/[id]` | `src/app/(app)/inventory/[id]/page.tsx` | Inventory | Item detail/edit, pictures, listing, condition |
| `/customers` | `src/app/(app)/customers/page.tsx` | Customers | Customer list |
| `/customers/[id]` | `src/app/(app)/customers/[id]/page.tsx` | Customers | Customer detail/edit, addresses, purchase history |
| `/reports` | `src/app/(app)/reports/page.tsx` | Reports | Report chooser, options, viewer |
| `/outstanding` | `src/app/(app)/outstanding/page.tsx` | Outstanding | Full-page outstanding list |
| `/tutorial` | `src/app/(app)/tutorial/page.tsx` | Tutorial | Search, index, articles, tips folder links |
| `/config` | `src/app/(app)/config/page.tsx` | Config | Etsy connection, business details, AI settings, backup |

---

## 2. App shell layout

File: `src/app/(app)/layout.tsx`

```
┌─────────────────────────────────────────────────┐
│  AppHeader (connection status, shop, swap icon)  │
├─────────────────────────────────────────────────┤
│  TabBar (Dashboard | Sales | Inventory | ... )   │
├──────────┬─────────────────────┬────────────────┤
│ Commands │    Main Content     │  Outstanding   │
│  Panel   │     {children}      │    Panel       │
│          │                     │                │
│  (left   │                     │  (right side   │
│   side   │                     │   by default;  │
│   by     │                     │   swappable)   │
│  default)│                     │                │
└──────────┴─────────────────────┴────────────────┘
```

The shell reads `panel_layout` from settings to determine which side is commands vs. outstanding.

---

## 3. Component catalog

### 3.1 Shell components

#### `AppHeader`
- **File:** `src/components/shell/AppHeader.tsx`
- **Client component:** Yes
- **Props:** None (reads context)
- **Behavior:**
  - Displays app name ("Trudy's Etsy Sales Manager" or from `settings.business_name`)
  - Shows Etsy connection badge: green "Connected" / red "Not Connected"
  - When connected: shop selector dropdown (if multiple shops)
  - Layout swap icon button (calls `LayoutSwapButton`)
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

#### `CommandsPanel`
- **File:** `src/components/shell/CommandsPanel.tsx`
- **Client component:** Yes
- **Props:** None (reads pathname for context)
- **Behavior:**
  - Reads `usePathname()` to determine active tab
  - Renders commands specific to the active tab (see ui-design.md §3)
  - Global commands (Connect/Disconnect Etsy, Refresh) appear on every tab
  - Commands that require a selection (e.g. Mark Paid) are disabled until a record is selected
  - Command clicks either trigger an API call directly or open a form/modal
- **Command configuration:** A `COMMANDS_BY_TAB` constant maps tab paths to command definitions:
  ```typescript
  type CommandDef = {
    label: string;
    icon?: string;
    action: string; // identifier for onClick handler
    requiresSelection?: boolean;
    requiresConnection?: boolean;
  };
  ```

#### `OutstandingPanel`
- **File:** `src/components/shell/OutstandingPanel.tsx`
- **Client component:** Yes
- **Props:** `mode: "panel" | "full-page"` (panel caps at 20 items; full-page shows all)
- **Behavior:**
  - Fetches outstanding items from a client-side aggregator that calls multiple endpoints
  - Each item shows: icon (by type), one-line summary, age/date
  - Click navigates to correct tab and record via router push with search params
  - Poll/refresh on 60-second interval when visible
  - Sort controls (three levels) per ADR-020
  - When Etsy is unavailable, shows cached data with "may be delayed" note

### 3.2 Shared UI components

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
- **Variants map:** Paid=success, Shipped=success, Draft=neutral, Listed=info, Not Paid=warning, Not Shipped=error

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

### 3.3 Tab-specific components

Full component list per tab is specified in ADR-024 §3.3. Key behavioral notes:

**Sales tab:**
- `NewOrderForm` uses `PickList` for item selection; creates order via `POST /api/orders` then `POST` order items.
- `MarkShippedForm` shows shipper dropdown (USPS/UPS/FedEx/DHL/Other), date picker, shipping cost input; warns if not paid (ADR-021 §11, ship-without-paid override).

**Inventory tab:**
- `ListingAuthoringPanel` has three modes (Manual / Generate in app / Import AI draft) per ADR-023.
  - Manual mode: structured form with all listing sections (title strategy, product story, condition clarity, attributes, tags, pricing/shipping notes, quality checklist).
  - Generate mode: readiness check → "Generate" button → loading → review generated content → edit → approve.
  - Import mode: paste JSON or upload file → validate schema → review → approve.
- `PublishPreview` shows exactly what will be sent to Etsy; "Publish to Etsy" button disabled unless `listing_draft_state = 'approved'`.

**Config tab:**
- `AiSettingsForm` fields: provider dropdown, model text input, API key (password field, masked in display), base URL (optional), timeout, retry count, token budget. "Test Connection" button calls `POST /api/settings/ai/test-connection`.
- `BackupSection` per ADR-027.

---

## 4. Shared hooks

| Hook | File | Purpose |
|------|------|---------|
| `useApi` | `src/hooks/useApi.ts` | Generic fetch wrapper; handles loading, error states, 401 redirect, toast on error |
| `useSettings` | `src/hooks/useSettings.ts` | Read/write settings via `/api/settings`; caches in state |
| `useOutstanding` | `src/hooks/useOutstanding.ts` | Fetches and aggregates outstanding items from multiple sources |
| `usePagination` | `src/hooks/usePagination.ts` | Manages `page`, `pageSize`, `total`, provides `onPageChange` |
| `useToast` | `src/hooks/useToast.ts` | Toast notification state and `showToast()` function |

---

## 5. Shared types

File: `src/types/index.ts`

Extract all type definitions currently inline in `page.tsx` into a shared types file:

```typescript
export type Shop = { shop_id: number; shop_name: string };
export type InventoryItem = { id: number; item_number: string | null; /* ... all fields */ };
export type Customer = { id: number; first_name: string | null; /* ... */ };
export type CustomerAddress = { id: number; customer_id: number; /* ... */ };
export type Order = { id: number; order_number: string | null; /* ... */ };
export type Receipt = { receipt_id: number; order_id: number; /* ... */ };
export type OutstandingItem = {
  type: "paid_not_shipped" | "not_paid" | "etsy_not_synced" | "not_listed" | "incomplete_address" | "missing_shipping_cost" | "validation_issue";
  id: string;
  summary: string;
  targetTab: string;
  targetRecordId: number | string;
  date: string;
};
export type ReportResult = { report_name: string; generated_at: string; /* ... */ };
export type ApiError = { ok: false; error: { code?: string; message: string; user_message: string; actions: string[]; can_retry?: boolean }; fields?: Record<string, string[]> };
```

---

## 6. Build order (migration from page.tsx)

| Step | What to build | Depends on | Exit criterion |
|------|---------------|------------|----------------|
| 1 | Routing structure: create all page files with placeholder content; create `(app)/layout.tsx` shell | — | All routes render a placeholder; navigation works |
| 2 | Shared types (`src/types/index.ts`) | — | Types extracted from page.tsx; no inline type defs remaining |
| 3 | Shell components: `AppHeader`, `TabBar` | Step 1 | Tab navigation works; connection status shows |
| 4 | Shared UI: `DataTable`, `FormField`, `Modal`, `Toast`, `Badge`, `EmptyState`, `LoadingSpinner` | — | Components render in isolation |
| 5 | Hooks: `useApi`, `useSettings`, `usePagination`, `useToast` | Step 4 | Hooks work with existing API routes |
| 6 | Dashboard tab: extract from page.tsx | Steps 3–5 | Dashboard shows KPI cards, recent orders, sync status |
| 7 | Sales tab: extract orders list, detail, new order, mark paid/shipped | Steps 4–5 + `PickList` | Sales tab fully functional |
| 8 | Inventory tab: extract item list, detail, pictures, listing, condition | Steps 4–5 + `PictureGrid`, `ListingAuthoringPanel` | Inventory CRUD + listing workflow works |
| 9 | Customers tab: extract customer list, detail, addresses | Steps 4–5 | Customer CRUD works |
| 10 | Outstanding panel + full-page tab | Step 5 + `useOutstanding` | Outstanding items display; click navigates correctly |
| 11 | Reports tab | Steps 4–5 + `PdfPreview` | All 8 reports generate and display |
| 12 | Config tab | Steps 4–5 | All settings editable; Etsy connect/disconnect works |
| 13 | Tutorial tab | `SearchInput`, `TutorialIndex` | Search and index work; tips folder links open files |
| 14 | Commands panel | Steps 6–13 | Context-sensitive commands work for all tabs |
| 15 | Delete monolithic page.tsx | All above | Old file removed; all tests pass |

Each step is independently deployable. The monolithic page.tsx can coexist during migration by keeping it at `/legacy` or similar.

---

## 7. CSS and styling approach

- Continue using **Tailwind CSS** utility classes (no CSS modules, no styled-components).
- Color palette from `documents/System_Colors.md` is defined as CSS custom properties in `globals.css`.
- Responsive breakpoints: mobile (<768px), tablet (768–1024px), desktop (>1024px).
- On mobile: tab bar scrolls horizontally; command and outstanding panels collapse to slide-out drawers triggered by header icons.

---

_This document is the build guide for the frontend. For the architectural decision, see ADR-024. For the UI design (behavior and UX), see ui-design.md. For API contracts, see ADR-018._
