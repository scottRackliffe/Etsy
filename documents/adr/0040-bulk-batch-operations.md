# ADR-040: Bulk/batch operations

## Status

Accepted

## Date

2026-05-24

## Context

Processing orders one at a time is too slow when there are 10+ orders to ship or inventory items to update. The current UI requires opening each record individually to change its status, mark it paid, or delete it. No multi-select or batch action capabilities exist. This wastes significant time during high-volume periods (holidays, sales events).

## Decision

### 1. Multi-select on list views

A checkbox column is added as the first column in every `DataTable` (ADR-028) on the Sales, Inventory, and Customers tabs.

**Checkbox behavior:**

- Each row has a checkbox in the first cell
- Header row has a "select all on page" checkbox that toggles all visible rows
- When all visible rows are selected via the header checkbox, a link appears below the batch actions bar: "Select all N matching items" — this selects the entire filtered result set (not just the current page)
- Clicking any individual checkbox after "select all matching" clears the full-set selection and returns to per-row mode
- Selection state is maintained in component state (not persisted); navigating away clears selection

**Visual feedback:**

- Selected rows have a subtle highlight background: `var(--ui-accent)` at 10% opacity
- The header checkbox shows an indeterminate state (`—`) when some but not all rows are selected

### 2. Batch actions bar

When ≥ 1 row is selected, a batch actions bar appears between the search/filter controls and the DataTable.

**Bar layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  ✓ 5 selected    [Mark Paid] [Mark Shipped] [Void]  [Clear] │
└─────────────────────────────────────────────────────────────┘
```

- Left: selection count ("5 selected" / "All 47 matching selected")
- Center: action buttons (vary by tab — see §3)
- Right: "Clear selection" link
- Bar background: `var(--ui-card-bg)` with `var(--ui-border)` border
- Bar is sticky (stays visible when scrolling the table)

### 3. Batch actions per tab

**Sales tab batch actions:**

| Action             | Button label         | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mark paid          | "Mark Paid"          | Sets `payment_status = 'paid'` and `was_paid = 1` on all selected orders. Skips orders already paid (no error).                                                                                                                                                                                                                                                                                                                                                                     |
| Mark shipped       | "Mark Shipped"       | Opens a modal: carrier dropdown (USPS/UPS/FedEx/DHL/Other), shipping date (default: today), optional tracking number (shared across all selected orders — leave blank to mark shipped without tracking). Sets `shipping_date`, `shipper`, and optionally `tracking_number` on all selected orders. An order is considered already shipped when `shipping_date IS NOT NULL`; already-shipped orders are skipped. **Paid check:** If any selected order has `payment_status = 'unpaid'`, the modal shows a warning: "N orders are unpaid. Ship anyway?" with a checkbox "Ship unpaid orders (override)" — if checked, sets `shipped_without_paid_override = 1` on those orders. |
| Void               | "Void"               | Confirmation dialog (ADR-032): "Void N orders? This cannot be undone." On confirm, sets `order_status = 'void'` on all selected. Skips already-void orders.                                                                                                                                                                                                                                                                                                                         |
| Add to print queue | "Add to Print Queue" | Opens sub-choice: document type (Invoice, Thank-you, Label). Adds each selected order to the client print queue (ADR-055). No server batch endpoint — queue is `localStorage`. Toast per ADR-055.                                                                                                                                                                                                                                                                                   |

**Inventory tab batch actions:**

| Action        | Button label    | Behavior                                                                                                                                                                                                                                                        |
| ------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change status | "Change Status" | Opens a dropdown/modal with canonical status values: `Draft`, `In stock`, `Listed`, `Sold`, `Reserved`, `Retired`. Sets `status` on all selected items.                                                                                                         |
| Retire        | "Retire"        | Shortcut for Change Status → `Retired`. Confirmation: "Retire N items?"                                                                                                                                                                                         |
| Delete        | "Delete"        | Confirmation dialog: "Delete N items? Items with orders cannot be deleted." On confirm, attempts delete on each. Items with associated `order_items` rows return a `409` and are skipped (per ADR-022). The result summary shows how many succeeded vs. failed. |

**Customers tab batch actions:**

| Action | Button label | Behavior                                                                                                                                                                                                                                            |
| ------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delete | "Delete"     | Confirmation dialog: "Delete N customers? Customers with orders cannot be deleted." On confirm, attempts delete on each. Customers with associated `orders` rows are skipped with a `409` (per ADR-022). Result summary shows succeeded vs. failed. |

### 4. API design

Batch operations use a single POST endpoint per entity type. The request body specifies the action and the target IDs.

**Endpoints:**

- `POST /api/orders/batch`
- `POST /api/inventory/batch`
- `POST /api/customers/batch`

**Request body:**

```json
{
  "action": "mark_paid",
  "ids": [1, 2, 3, 5, 8],
  "params": {
    "shipper": "USPS",
    "shipping_date": "2026-05-24",
    "shipped_without_paid_override": true
  }
}
```

- `action`: string — one of the valid actions for that entity (see §3)
- `ids`: `number[]` — list of entity IDs to act on; max 100 per request (see §4a for "select all matching" behavior)
- `params`: optional object — additional parameters for the action (e.g., shipper, status value)

**Valid `action` values:**

| Endpoint               | Valid actions                                                                |
| ---------------------- | ---------------------------------------------------------------------------- |
| `/api/orders/batch`    | `mark_paid`, `mark_shipped`, `void` (print queue is client-only per ADR-055) |
| `/api/inventory/batch` | `change_status`, `delete`                                                    |
| `/api/customers/batch` | `delete`                                                                     |

**`params` by action:**

| Action          | Required params                                                                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mark_paid`     | none                                                                                                                                                            |
| `mark_shipped`  | `shipper` (string, required), `shipping_date` (YYYY-MM-DD, required), `tracking_number` (string, optional), `shipped_without_paid_override` (boolean, optional) |
| `void`          | none                                                                                                                                                            |
| `change_status` | `status` (string, required — must be canonical inventory status)                                                                                                |
| `delete`        | none                                                                                                                                                            |

**Response body:**

```json
{
  "ok": true,
  "succeeded": 4,
  "failed": [{ "id": 3, "reason": "Customer has existing orders and cannot be deleted" }],
  "total": 5
}
```

- `succeeded`: count of successfully processed items
- `failed`: array of `{ id, reason }` for each item that could not be processed
- `total`: total items attempted (`succeeded + failed.length`)
- HTTP status: `200` (even if some items failed — partial success is expected)
- If ALL items fail: still `200` with `succeeded: 0`
- If `ids` is empty or `action` is invalid: `400` with standard error envelope

**Processing order:** Items are processed sequentially within a single database transaction. If any individual operation fails (e.g., referential integrity), that item is recorded in `failed` and processing continues. The transaction commits all successful operations.

**Rate limit:** Max 100 IDs per explicit `ids` request. If `ids.length > 100`, return `400` with `{ error: { code: "BATCH_TOO_LARGE", message: "Maximum 100 items per batch operation" } }`.

#### 4a. "Select all matching" and the 100-ID cap

> Added 2026-06-09 — clarifies server-side chunking for large filtered selections.

When "select all matching" is used with a filter, the server processes all matching records. If the match count exceeds 100, the operation is chunked into batches of 100 server-side. The client shows a confirmation dialog with the total count before proceeding (e.g., "Mark 247 orders as paid?"). The server accepts either explicit `ids` or `filter` parameters — when `filter` is used, the 100-ID client limit does not apply because the server handles chunking internally.

### 5. Confirmation dialogs

All destructive batch actions (void, delete, retire) use the `ConfirmDialog` component (ADR-032).

**Dialog content pattern:**

- Title: "[Action] [N] [entity type]?"
- Body: Description of the consequence + any warnings
- Confirm button: Red for destructive (delete, void), accent for status changes
- Cancel button: always available

Examples:

- "Void 5 orders? Voided orders are excluded from all reports and cannot be reactivated."
- "Delete 3 items? Items with existing orders cannot be deleted and will be skipped."
- "Delete 8 customers? Customers with existing orders cannot be deleted and will be skipped."

### 6. Result feedback

After a batch operation completes:

- **All succeeded:** Success toast: "5 orders marked as paid"
- **Partial success:** Warning toast: "3 of 5 customers deleted. 2 skipped (have existing orders)." Toast includes a "Details" link that expands to show the failed items and reasons.
- **All failed:** Error toast: "Could not delete any of the 5 customers. All have existing orders."
- Selection is cleared after the operation completes (success or failure)
- The DataTable refreshes to reflect the updated data

### 7. Activity log entries (ADR-037)

Each batch operation creates a single activity log entry (not one per item):

| Field          | Value                                                                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `action`       | `order.batch_marked_paid`, `order.batch_marked_shipped`, `order.batch_void`, `inventory.batch_status_changed`, `inventory.batch_delete`, `customer.batch_deleted` |
| `entity_type`  | `order`, `inventory`, or `customer`                                                                                                                         |
| `entity_id`    | `NULL` (batch, not single entity)                                                                                                                           |
| `entity_label` | `"Batch: 5 orders"`                                                                                                                                         |
| `detail_json`  | `{ "ids": [1,2,3,5,8], "succeeded": 4, "failed": [{"id": 3, "reason": "..."}], "params": {...} }`                                                           |
| `source`       | `user`                                                                                                                                                      |

### 8. Progress feedback for large batches

When processing > 10 items, the UI shows a progress indicator:

- Modal overlay with progress bar (determinate: N of M processed)
- Status text: "Processing 15 of 47 orders..."
- No cancel button for batch operations (they complete quickly in a single transaction)
- Auto-dismiss on completion; result toast appears

For batches ≤ 10 items, a simple loading spinner on the action button is sufficient (no modal).

## Consequences

- **Positive:** Dramatically reduces time for bulk operations (marking orders paid/shipped, changing inventory status); partial success handling means one bad record doesn't block the rest; activity log captures the full batch for audit purposes.
- **Negative:** "Select all matching" requires the client to either fetch all matching IDs or the server to accept filter criteria instead of IDs (adds API complexity); batch delete has a confusing UX when many items are blocked by referential integrity; the 100-item limit means very large batches require multiple requests.

## Notes

- Cross-references: ADR-028 (DataTable — checkbox column integration), ADR-029 (search/filter — "select all matching" operates on the current filter), ADR-032 (ConfirmDialog — destructive batch confirmations), ADR-037 (activity log — batch entry format), ADR-022 (referential integrity — delete blocked if child records exist), ADR-043 (progress indicators — large batch progress pattern)
- The "select all matching" feature: when active, the client sends the current filter/search params to the batch endpoint instead of explicit IDs. The server resolves matching IDs internally. Request body uses `filter` instead of `ids`: `{ "action": "mark_paid", "filter": { "q": "vintage", "status": "active" } }`
- Create-item default status via batch `change_status` must use `Draft` (capitalized, matching ADR-002/017 enum). All canonical inventory status values are: `Draft`, `In stock`, `Listed`, `Sold`, `Reserved`, `Retired`.
- Future consideration: undo for batch operations (e.g., un-void) is not in scope for v1
- Reconciliation note (2026-06-09): Activity log action names updated to match ADR-037 catalog (`order.batch_marked_paid`, `order.batch_marked_shipped`, `inventory.batch_status_changed`, `customer.batch_deleted`). "Shipped" definition, select-all-matching server-side chunking, and tracking number behavior clarified.
