# State management — client-side data patterns

This document defines how the frontend manages data fetching, caching, state, and error handling. It is the implementation companion for ADR-024 §4 (state management).

---

## 1. Architecture overview

The app uses a **server-driven data** model: all business data lives in SQLite, accessed via API routes. The frontend fetches data on demand and does not maintain a persistent client-side store (no Redux, no Zustand). State is managed via:

| Layer                     | Mechanism                                    | Scope                                                                |
| ------------------------- | -------------------------------------------- | -------------------------------------------------------------------- |
| **Global app state**      | React Context (`AppProvider`)                | Connection status, shops, selected shop, settings, outstanding count |
| **Page-level state**      | `useState` / `useReducer` in page components | List data, selected record, form values, pagination                  |
| **Component-level state** | `useState` in leaf components                | UI toggles, local form fields, loading indicators                    |

---

## 2. AppProvider context

File: `src/components/shell/AppProvider.tsx`

Wraps all pages in the `(app)` layout. Provides:

```typescript
type AppContextValue = {
  // Connection state
  isConnected: boolean;
  shops: Shop[];
  selectedShopId: number | null;
  setSelectedShopId: (id: number) => void;

  // Settings (cached)
  settings: Record<string, string>;
  refreshSettings: () => Promise<void>;
  updateSetting: (key: string, value: string) => Promise<void>;

  // Sync state
  lastSyncAt: string | null;
  isSyncing: boolean;
  triggerSync: () => Promise<void>;

  // Outstanding
  outstandingCount: number;
  refreshOutstanding: () => void;

  // Toast notifications
  showToast: (message: string, type: "success" | "error" | "info" | "warning") => void;
};
```

**Initialization (on mount):**

1. Fetch `GET /api/shop` → if success, set `isConnected = true` and populate `shops`.
2. Fetch `GET /api/settings` → populate `settings` cache.
3. Extract `lastSyncAt` from settings.
4. Fetch outstanding count (lightweight: count only, not full items).

**Refresh cycle:** Settings and outstanding count refresh every 60 seconds while the app is visible (use `document.visibilityState`).

---

## 3. Data fetching patterns

### 3.1 The `useApi` hook

File: `src/hooks/useApi.ts`

A generic fetch wrapper that standardizes API calls:

```typescript
function useApi<T>() {
  return {
    get: (url: string) => Promise<T>,
    post: (url: string, body: unknown) => Promise<T>,
    patch: (url: string, body: unknown) => Promise<T>,
    del: (url: string) => Promise<void>,
    loading: boolean,
    error: ApiError | null,
  };
}
```

**Behavior:**

- Sets `loading = true` before fetch, `false` after.
- On success (2xx): parse JSON, return data.
- On 401: set `isConnected = false` in AppProvider; show toast "Session expired."
- On 400 (validation): return the `fields` object for inline field errors.
- On 404: return null or show toast depending on context.
- On 429: show toast "Too many requests. Please wait a moment."
- On 500/503: show toast with `error.user_message` from response body.
- All errors are structured per the global API error contract (ADR-018 §Global).

### 3.2 List page pattern

Every list page (Sales, Inventory, Customers) follows the same pattern:

```typescript
function SalesPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { page, pageSize, setPage } = usePagination();
  const api = useApi();

  // Fetch on mount and when page changes
  useEffect(() => {
    api.get(`/api/orders?limit=${pageSize}&offset=${page * pageSize}`)
      .then(data => { setOrders(data.items); setTotal(data.total); });
  }, [page, pageSize]);

  // Refresh after mutations
  const refresh = () => { /* re-fetch current page */ };

  return (
    <DataTable
      columns={ORDER_COLUMNS}
      data={orders}
      total={total}
      page={page}
      pageSize={pageSize}
      onPageChange={setPage}
      onRowClick={row => setSelectedId(row.id)}
      selectedId={selectedId}
    />
  );
}
```

### 3.3 Detail/edit pattern

Detail pages (Inventory/[id], Customers/[id]) fetch a single record:

```typescript
function InventoryDetailPage({ params }: { params: { id: string } }) {
  const [item, setItem] = useState<InventoryItem | null>(null);
  const api = useApi();

  useEffect(() => {
    api.get(`/api/inventory/${params.id}`).then(setItem);
  }, [params.id]);

  const handleSave = async (updates: Partial<InventoryItem>) => {
    const updated = await api.patch(`/api/inventory/${params.id}`, updates);
    setItem(updated);
    showToast("Item saved", "success");
  };

  return item ? <InventoryDetailForm item={item} onSave={handleSave} /> : <LoadingSpinner />;
}
```

---

## 4. Optimistic updates

For fast-feeling interactions, use optimistic updates for simple state transitions:

| Action          | Optimistic behavior                                               | Rollback on error                          |
| --------------- | ----------------------------------------------------------------- | ------------------------------------------ |
| Mark as paid    | Immediately set `was_paid = 1` in local state; show success toast | Revert to `was_paid = 0`; show error toast |
| Mark as shipped | Immediately update status in local state                          | Revert; show error toast                   |
| Delete item     | Immediately remove from list                                      | Re-add to list; show error toast           |
| Toggle setting  | Immediately reflect new value                                     | Revert; show error toast                   |

For complex operations (create order, sync from Etsy, generate listing), do **not** use optimistic updates. Show a loading state and wait for the server response.

---

## 5. Form state and validation

### 5.1 Form state

Each form manages its own state via `useState` with a form data object:

```typescript
const [formData, setFormData] = useState<Partial<Customer>>({
  first_name: customer?.first_name ?? "",
  last_name: customer?.last_name ?? "",
  // ...
});
const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
```

### 5.2 Client-side validation

Run validation **before** submitting to the API. Validation rules mirror ADR-021:

| Field           | Rule                                   | Error message                           |
| --------------- | -------------------------------------- | --------------------------------------- |
| `item_number`   | Required, non-empty                    | "Item number is required."              |
| `description`   | Required, non-empty                    | "Description is required."              |
| `sale_revenue`  | Required, > 0 (for listing generation) | "Price must be greater than 0."         |
| `listing_title` | 1–140 characters                       | "Title must be 1–140 characters."       |
| `listing_tags`  | 1–13 tags                              | "Provide 1 to 13 tags."                 |
| `email`         | Valid email format (when provided)     | "Enter a valid email address."          |
| `postal_code`   | Non-empty (for complete address)       | "Postal code is required for shipping." |

### 5.3 Server-side validation errors

When the API returns 400 with `fields`, merge them into `fieldErrors`:

```typescript
try {
  await api.patch(url, formData);
} catch (err) {
  if (err.fields) {
    setFieldErrors(err.fields);
  }
}
```

Each `FormField` component checks `fieldErrors[name]` and displays the first error below the input.

---

## 6. Error handling patterns

### 6.1 Error hierarchy

| Error type                      | Where shown                             | User action                                                                  |
| ------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------- |
| Field validation (400 + fields) | Inline below each field                 | Fix the field and resubmit                                                   |
| Business rule (400 no fields)   | Toast or inline message                 | Read the `user_message` and follow `actions`                                 |
| Not authenticated (401)         | Toast + redirect to not-connected state | Click "Connect Etsy"                                                         |
| Not found (404)                 | Toast "Record not found"                | Navigate back to list                                                        |
| Conflict (409)                  | Toast with explanation                  | Follow suggested action (e.g. "Cannot delete: item is referenced by orders") |
| Rate limited (429)              | Toast "Please wait"                     | Auto-retry after delay                                                       |
| Server error (500)              | Toast "Something went wrong"            | Retry or contact support                                                     |
| Upstream unavailable (503)      | Toast with `user_message`               | Retry later                                                                  |

### 6.2 Global error boundary

File: `src/app/error.tsx` (existing)

Catches unhandled errors in rendering. Shows a friendly error page with "Try again" button.

### 6.3 Network failure

When `fetch()` throws (no response at all):

- Show toast: "Network error. Check your connection and try again."
- Set `error.can_retry = true` on the error object.
- Do not clear existing data from the screen.

---

## 7. Context-in-place navigation

When the outstanding panel or any cross-tab link needs to navigate to a specific record:

```typescript
import { useRouter, useSearchParams } from "next/navigation";

// Navigate to a specific order on the Sales tab
router.push(`/sales?order_id=${orderId}`);

// The Sales page reads the search param and auto-selects
const searchParams = useSearchParams();
const targetOrderId = searchParams.get("order_id");
useEffect(() => {
  if (targetOrderId) {
    setSelectedId(Number(targetOrderId));
    // Optionally scroll to the record
  }
}, [targetOrderId]);
```

This pattern works for all context-in-place scenarios:

- Outstanding panel → Sales (order_id)
- Outstanding panel → Inventory (id)
- Outstanding panel → Customers (id)
- Customer detail → Sales (filter by customer_id)

---

_This document defines data management patterns. For component structure, see [frontend-architecture.md](frontend-architecture.md). For API contracts, see ADR-018. For validation rules, see ADR-021._
