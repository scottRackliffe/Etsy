# ADR-035: Deep-link navigation — Outstanding click-through selects record on target page

## Status

Accepted

## Date

2026-05-24

## Context

The Outstanding page navigates to target pages using URL query params (`?orderId=`, `?itemId=`, `?customerId=`), but the target pages (Sales, Inventory, Customers) never read these params. Clicking an outstanding item opens the correct tab but does not select the relevant record. The navigation intent is broken.

## Decision

**All list pages must read deep-link query params from the URL and use them to select, scroll to, and highlight the target record on mount.**

---

### Query param contract (exact)

| Target page              | Query param       | Behavior                                                                                                                    |
| ------------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Sales (`/sales`)         | `orderId={id}`    | Select the order with `id = orderId`. If the order is not on the current page, fetch it by ID and display its detail panel. |
| Inventory (`/inventory`) | `itemId={id}`     | Select the inventory item with `id = itemId`. Same fetch-if-missing behavior.                                               |
| Customers (`/customers`) | `customerId={id}` | Select the customer with `id = customerId`. Load their addresses.                                                           |
| Receipts (`/receipts`)   | `receiptId={id}`  | Select/expand the vendor receipt with `id = receiptId`. Fetch-if-missing behavior.                                          |
| Vendors (`/vendors`)     | `vendorId={id}`   | Select the vendor with `id = vendorId` (ADR-076). Fetch-if-missing behavior.                                               |
| Expenses (`/expenses`)   | `expenseId={id}`  | Select the business expense with `id = expenseId` (ADR-077).                                                                |
| Expenses (`/expenses`)   | `taxPaymentId={id}` | Open the Tax section and select the tax payment with `id = taxPaymentId` (ADR-039).                                       |
| Shipping (`/shipping`)   | `orderId={id}`    | (After WS-F) Select the order's shipping context. **Until WS-F ships, shipping activity links to `/orders?orderId={id}`.** |

---

### Implementation per page

Each page adds a `useEffect` that runs on mount (and when `searchParams` change):

1. **Read param:** `const searchParams = useSearchParams(); const targetId = searchParams.get("orderId");` (or `itemId` / `customerId`).
2. **If param present and valid (numeric):**
   a. Check if the record exists in the currently loaded list.
   b. If yes: set `selectedId` to that record. Scroll the `DataTable` row into view.
   c. If no (record not on current page): fetch the record by ID from `GET /api/orders/[id]` (or equivalent). Prepend it to the list (or navigate to the page containing it if using server-side pagination). Set it as selected.
3. **Clear the param:** After selecting, use `router.replace(pathname)` (without the deep-link query param) to clean up the URL. This prevents re-triggering on subsequent renders and allows the user to navigate naturally.

> **Reconciliation note (2026-06-09):** Deep-link selection params (e.g., `orderId`, `itemId`, `customerId`) are stripped via `router.replace` after the target record is selected and scrolled into view. Filter/search/sort/page params from ADR-029 (e.g., `sort_by`, `status`, `q`, `page`) are **preserved** in the URL for bookmarkability. Only the selection param is removed.
4. **If the record does not exist (404):** Show a toast: "Record not found. It may have been deleted."

---

### Outstanding page — outbound navigation (update)

The Outstanding page's current click handler navigates like:

```typescript
router.push(`/orders?orderId=${item.record_id}`);
```

This pattern is correct and does not change. The fix is entirely on the receiving pages.

---

### Additional deep-link support

Beyond Outstanding, other pages may produce deep links:

| Source                                  | Target       | Param                                     |
| --------------------------------------- | ------------ | ----------------------------------------- |
| Dashboard order table (future)          | Sales detail | `orderId`                                 |
| Sales → customer name link (ADR-031)    | Customers    | `customerId`                              |
| Customers → order history (future)      | Sales        | `customerId` (filters orders by customer) |
| Reports → per-order drill-down (future) | Sales        | `orderId`                                 |
| **Activity views (ADR-037, WS-A)**      | per entity   | `itemId` / `orderId` / `customerId` / `receiptId` / `vendorId` / `expenseId` / `taxPaymentId` |
| Dashboard low-quality widget (WS-D)     | Inventory    | `itemId`                                  |

The query param contract above covers all these cases. Pages should handle any combination of params they define.

> **Extension (2026-06-21, WS-A/WS-D):** The Recent Activity and Activity log views
> (ADR-016 §6, ADR-037 §A3) link each row's `entity_label` to the target above, **except** rows
> for deleted records, which render with no link (locked WS-A decision). The `/receipts`,
> `/vendors`, `/expenses` pages must implement the read-param-select-clean pattern in
> "Implementation per page." The `/shipping` page arrives with WS-F (ADR-080); until then,
> shipping rows link to `/orders?orderId=`.

---

### Scroll-to-row behavior

When a record is selected via deep link, the `DataTable` row must be visible without manual scrolling:

- After setting `selectedId`, use `element.scrollIntoView({ behavior: "smooth", block: "center" })` on the selected `<tr>`.
- To enable this, `DataTable` should accept a `scrollToId` prop. When set, the component uses a `ref` callback on the matching row to trigger `scrollIntoView` after render.

---

### Filter state from query params (optional)

Some deep links may include filter context:

- `/orders?orderId=42&payment=unpaid` — select order 42 and set payment filter to "Unpaid."
- `/inventory?itemId=7&status=in_stock` — select item 7 and set status filter to "In stock."

Pages should read filter-related params alongside the record selection param. This ties into the URL state sync described in ADR-029.

## Consequences

- **Positive**
  - Outstanding click-through works as intended — users land on the exact record.
  - Foundation for cross-page navigation (order → customer, report → order).
  - URL is bookmarkable for any selected record.
- **Negative**
  - Each page needs a fetch-by-ID fallback for records not on the current page.
  - `router.replace` after selection adds a small amount of URL management complexity.
