# ADR-037: Activity log and audit trail

## Status

Accepted

## Date

2026-05-24

## Context

The application has no record of what actions were taken, when, or on which records. There is no way to answer questions like "When was this order marked as shipped?", "Who deleted that inventory item?", or "What changed on this customer record last Tuesday?" For a single-user system this is less critical than multi-user, but an audit trail is still essential for:

- Debugging (what happened before a problem appeared).
- Accountability (verifying that Etsy sync, publish, and payment actions occurred).
- Operational confidence (seeing a timeline of recent activity).

The structured logger (`src/lib/logging.ts`) writes to stdout but does not persist events in the database.

## Decision

**Add a persistent activity log table that records all significant user and system actions, with a UI to browse recent activity.**

---

### Database schema

```sql
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  entity_label TEXT,
  detail_json TEXT,
  source TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action);
```

**Column definitions:**

| Column         | Type          | Description                                                                                                                                                          |
| -------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | INTEGER PK    | Auto-increment                                                                                                                                                       |
| `action`       | TEXT NOT NULL | Action identifier (see action catalog below)                                                                                                                         |
| `entity_type`  | TEXT          | `inventory`, `order`, `customer`, `address`, `setting`, `listing`, `sync`, `backup`, `system` (scheduled sync, integrity, sample data per ADR-057, ADR-058, ADR-069) |
| `entity_id`    | INTEGER       | ID of the affected record (nullable for system-wide actions)                                                                                                         |
| `entity_label` | TEXT          | Human-readable label for the record (e.g., item number, order number, customer name)                                                                                 |
| `detail_json`  | TEXT          | JSON object with action-specific details (changed fields, old/new values, error messages)                                                                            |
| `source`       | TEXT          | `user` (manual action), `system` (automated — scheduled backup), `etsy_sync` (Etsy sync operations)                                                                  |
| `created_at`   | TEXT          | ISO 8601 timestamp                                                                                                                                                   |

---

### Action catalog (exact)

**Inventory actions:**

| Action                         | entity_type | Logged when                                                                                        |
| ------------------------------ | ----------- | -------------------------------------------------------------------------------------------------- |
| `inventory.created`            | `inventory` | New inventory item created                                                                         |
| `inventory.updated`            | `inventory` | Inventory fields changed. `detail_json` includes `{ changed_fields: ["status", "purchase_cost"] }` |
| `inventory.deleted`            | `inventory` | Inventory item deleted                                                                             |
| `inventory.picture_added`      | `inventory` | Picture uploaded to a slot. `detail_json`: `{ slot: 3 }`                                           |
| `inventory.picture_removed`    | `inventory` | Picture removed. `detail_json`: `{ slot: 3 }`                                                      |
| `inventory.pictures_reordered` | `inventory` | Pictures reordered                                                                                 |
| `inventory.batch_status_changed` | `inventory` | Batch status change (ADR-040). `detail_json`: `{ count, ids, new_status }`                       |
| `inventory.bulk_imported`      | `inventory` | CSV bulk import completed (ADR-047). `detail_json`: `{ count, errors }`                            |

**Listing actions:**

| Action                   | entity_type | Logged when                                                                                                                        |
| ------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `listing.ai_generated`   | `inventory` | AI listing generated (research + price + all fields, ADR-085). `detail_json`: `{ price_confidence, sale_revenue_set }`             |
| `listing.quality_evaluated` | `inventory` | Listing quality reviewed (ADR-081/082). `detail_json`: `{ score, issue_count }`                                                  |
| `listing.shot_list_generated` | `inventory` | AI shot list generated (ADR-083). `detail_json`: `{ shot_count }`                                                            |
| `inventory.dimensions_annotated` | `inventory` | Measurement photo rendered (ADR-084). `detail_json`: `{ length, width, height, unit, slot }`                              |
| `listing.published`      | `inventory` | Published to Etsy. `detail_json`: `{ etsy_listing_id, mode: "create" \| "update" }` (ADR-085 §5 re-publish)                         |
| `listing.publish_failed` | `inventory` | Publish attempt failed. `detail_json`: `{ error }`                                                                                 |
| ~~`listing.draft_saved`~~, ~~`listing.coach_complete`~~, ~~`listing.exported`~~, ~~`listing.imported`~~, ~~`listing.approved`~~, ~~`listing.rejected`~~ | — | **RETIRED (ADR-085):** draft-state machine, Listing Coach, portable handoff, and approve/reject removed. |

**Order actions:**

| Action                     | entity_type | Logged when                                                            |
| -------------------------- | ----------- | ---------------------------------------------------------------------- |
| `order.created`            | `order`     | Manual order created                                                   |
| `order.updated`            | `order`     | Order fields changed                                                   |
| `order.marked_paid`        | `order`     | Order marked as paid                                                   |
| `order.marked_shipped`     | `order`     | Order marked as shipped. `detail_json`: `{ shipper, tracking_number }` |
| `order.voided`             | `order`     | Order voided                                                           |
| `order.batch_mark_paid`    | `order`     | Batch mark paid (ADR-040). `detail_json`: `{ count, ids }`             |
| `order.batch_mark_shipped` | `order`     | Batch mark shipped (ADR-040). `detail_json`: `{ count, ids }`          |
| `order.batch_void`         | `order`     | Batch void (ADR-040). `detail_json`: `{ count, ids }`                  |

> **Reconciliation note (2026-06-09):** Canonical action names for batch order operations use present-tense `batch_mark_*` (not `batch_marked_*`) to distinguish "batch command" from single-record past-tense actions. Both forms are accepted by `logActivity()` but new code should use the forms above.

**Customer actions:**

| Action                  | entity_type | Logged when                                                              |
| ----------------------- | ----------- | ------------------------------------------------------------------------ |
| `customer.created`      | `customer`  | Customer created                                                         |
| `customer.updated`      | `customer`  | Customer fields changed                                                  |
| `customer.deleted`      | `customer`  | Customer deleted                                                         |
| `customer.batch_deleted` | `customer` | Batch customer delete (ADR-040). `detail_json`: `{ count, ids }`         |
| `customer.merged`       | `customer`  | Merge completed (ADR-053). `detail_json`: `{ primary_id, secondary_id }` |
| `customer.note_added`   | `customer`  | Note created (ADR-065)                                                   |
| `customer.note_deleted` | `customer`  | Note deleted (ADR-065)                                                   |
| `address.created`       | `address`   | Address added                                                            |
| `address.deleted`       | `address`   | Address deleted                                                          |

**Sync actions:**

| Action                | entity_type | Logged when                                                                                    |
| --------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| `sync.started`        | `sync`      | Etsy sync initiated                                                                            |
| `sync.completed`      | `sync`      | Sync finished. `detail_json`: `{ receipts_processed, orders_created, orders_updated, errors }` |
| `sync.failed`         | `sync`      | Sync failed. `detail_json`: `{ error }`                                                        |
| `sync.auto_started`   | `system`    | Scheduled sync started (ADR-057)                                                               |
| `sync.auto_completed` | `system`    | Scheduled sync finished (ADR-057)                                                              |

**System actions:**

| Action                           | entity_type | Logged when                                                                            |
| -------------------------------- | ----------- | -------------------------------------------------------------------------------------- |
| `auth.connected`                 | `setting`   | Etsy OAuth completed                                                                   |
| `auth.disconnected`              | `setting`   | Etsy tokens cleared                                                                    |
| `auth.token_refreshed`           | `setting`   | Access token refreshed                                                                 |
| `backup.created`                 | `backup`    | Backup created. `detail_json`: `{ file_path, size_bytes }`                             |
| `backup.restored`                | `backup`    | Backup restored. `detail_json`: `{ file_path }`                                        |
| `settings.updated`               | `setting`   | Settings changed. `detail_json`: `{ key, old_value, new_value }` (API keys are masked) |
| `report.generated`               | `setting`   | Report generated. `detail_json`: `{ report_name, format }`                             |
| `system.sample_data_loaded`      | `system`    | Sample data loaded (ADR-069)                                                           |
| `system.sample_data_removed`     | `system`    | Sample data removed (ADR-069)                                                          |
| `system.integrity_check_failed`  | `system`    | SQLite integrity check failed (ADR-058)                                                |
| `communication.sent`             | `communication` | Message batch sent or printed. `detail_json: { message_type, channel, count, order_ids }` (ADR-078) |
| `communication.failed`           | `communication` | Send failed. `detail_json: { message_type, error }` (ADR-078)                      |

> **Update (2026-06-21, WS-C):** `communication` entity_type added. Deep-link target: single-order entity_id → `/orders?orderId=` when entity_id is set, else no link. "Communications" filter chip maps to `entity_type='communication'`.

> **Reconciliation note (2026-06-09):** `inventory.batch_status_changed` and `inventory.batch_deleted` moved to the Inventory actions table above (they were previously duplicated here). `inventory.bulk_imported` (ADR-047) and `customer.batch_deleted` (ADR-040) added to their respective tables. `sync.started`/`sync.completed` confirmed present in Sync actions. Source field values: `user`, `system`, `etsy_sync`. (Note 2026-06-21, ADR-085: `listing.coach_complete` and the draft-state/portable/approve actions are retired.)

---

### Logging utility

Add to `src/lib/activity-log.ts`:

```typescript
type LogActivityParams = {
  action: string;
  entityType?: string;
  entityId?: number;
  entityLabel?: string;
  detail?: Record<string, unknown>;
  source?: "user" | "system" | "etsy_sync";
};

function logActivity(params: LogActivityParams): void;
```

- Inserts a row into `activity_log`.
- Non-blocking: if the insert fails, log to `logger.warn` but do not throw. Activity logging must never break the primary action.
- Masks sensitive values in `detail`: if a key contains `key`, `token`, or `secret`, the value is replaced with `"****"`.

---

### API endpoint

**`GET /api/activity`**

Query params:

- `limit` (default: 50, max: 200)
- `offset` (default: 0)
- `entity_type` — filter by entity type
- `entity_id` — filter by specific record
- `action` — filter by action
- `from_date` / `to_date` — date range filter

Response:

```json
{
  "items": [
    {
      "id": 42,
      "action": "order.marked_shipped",
      "entity_type": "order",
      "entity_id": 15,
      "entity_label": "ORD-2025-0042",
      "detail": { "shipper": "USPS", "tracking_number": "9400..." },
      "source": "user",
      "created_at": "2026-05-24T14:30:00.000Z"
    }
  ],
  "total": 1234,
  "limit": 50,
  "offset": 0
}
```

---

### UI — Activity feed

**Dashboard widget:**

- Add a "Recent activity" section below the KPI cards on the Dashboard page.
- Shows the latest 10 activity entries.
- Each entry: icon (based on `entity_type`), action description (human-readable), timestamp (relative: "2 hours ago"), entity label (linked if applicable).
- "View all →" link opens the full activity log.

**Full activity log page (optional — can be a section within Dashboard or a future page):**

- `DataTable` with columns: Time, Action, Record, Details, Source.
- Filter chips by entity type: All, Inventory, Orders, Customers, Sync, System.
- Search by entity label.
- Pagination (25 per page).

**Record-level activity (on detail panels):**

- Inventory detail panel (ADR-030): show last 5 activity entries for that item at the bottom.
- Order detail panel (ADR-031): show last 5 activity entries for that order.
- Fetched via `GET /api/activity?entity_type=inventory&entity_id={id}&limit=5`.

---

### Retention

- Activity log rows are retained indefinitely by default.
- Optional setting `activity_log.retention_days` (default: 365). A cleanup job runs on app startup, deleting entries older than the retention period.
- Cleanup query: `DELETE FROM activity_log WHERE created_at < datetime('now', '-{n} days')`.

---

### Integration points

Activity logging calls are added to:

- All API route handlers that mutate data (POST, PATCH, DELETE).
- `etsy-sync.ts` — `syncEtsyReceipts` logs start, completion, and failure.
- `auth-session.ts` — OAuth completion and token refresh.
- `picture-storage.ts` — picture add/remove/reorder.
- Future: backup create/restore.

Each route adds one `logActivity()` call after the successful mutation. Example:

```typescript
logActivity({
  action: "order.marked_shipped",
  entityType: "order",
  entityId: orderId,
  entityLabel: order.order_number,
  detail: { shipper, tracking_number, shipping_date },
});
```

## Consequences

- **Positive**
  - Complete history of all significant actions for debugging and accountability.
  - Dashboard activity feed gives users a live sense of system activity.
  - Record-level activity shows the history of any specific item or order.
  - Non-blocking design: logging failures never disrupt the primary workflow.
- **Negative**
  - Every mutation endpoint gains a `logActivity` call — increases code in all routes.
  - Activity log table grows continuously; retention cleanup mitigates this.
  - Adds one more table and API endpoint to the system.

---

## Extensions (2026-06-21) — WS-A: full activity coverage, deep-links, and filters

Source: `documents/PROGRAM_2026-06-21_major-enhancements.md` (workstream A). This block is
**authoritative** where it overlaps the original sections above. No schema change: the existing
`activity_log` table (ADR-017) is unchanged; we only broaden the **values** used in
`entity_type` / `action` and specify the UI taxonomy.

### A1. Expanded `entity_type` value set (canonical)

The complete, closed set of `entity_type` values is now:

`inventory` · `order` · `customer` · `address` · `receipt` · `vendor` · `expense` ·
`tax_payment` · `shipping` · `report` · `communication` · `setting` · `sync` · `backup` · `system`

> `communication` (ADR-078) covers outreach sends (payment reminders, thank-you notes).

Notes:
- **`order`** covers all customer sales (in this data model "Sales" = `orders`; there is no
  separate `sale` entity_type — see A4 for the chip).
- **`receipt`** = vendor purchase receipts (buying trips).
- **`expense`** = business expenses (ADR-077). **`tax_payment`** = tax remittances
  (ADR-039).
- **`shipping`** = label/rate operations (ADR-074); `entity_id` holds the related **order id**.
- **`report`** = report generation (was previously logged under `setting`; see A2 note).
- **`setting`** = config/settings + auth events (chip label "Config"; auth shown under System).

### A2. New / reclassified action catalog entries

**Receipt actions (entity_type `receipt`, entity_id = receipt id):**

| Action | Logged when |
| --- | --- |
| `receipt.created` | Vendor receipt created (scan or manual) |
| `receipt.updated` | Receipt fields changed |
| `receipt.deleted` | Receipt deleted (cascades items) |
| `receipt.scanned` | OCR scan completed. `detail_json`: `{ item_count }` |
| `receipt.item_linked` | Receipt item linked to inventory. `detail_json`: `{ inventory_id }` |
| `receipt.item_unlinked` | Receipt item unlinked from inventory |

**Vendor actions (entity_type `vendor`, entity_id = vendor id) — ADR-076:**

| Action | Logged when |
| --- | --- |
| `vendor.created` | Vendor created |
| `vendor.updated` | Vendor fields changed |
| `vendor.deleted` | Vendor soft-deleted (`is_active=0`) |

**Expense actions (entity_type `expense`, entity_id = expense id) — ADR-077:**

| Action | Logged when |
| --- | --- |
| `expense.created` | Business expense created |
| `expense.updated` | Expense fields changed |
| `expense.deleted` | Expense deleted |
| `expense.payment_recorded` | A payment recorded against an expense/bill. `detail_json`: `{ amount }` |
| `expense.scanned` | OCR invoice scan completed |
| `expense.recurring_generated` | Recurring expense instance generated. `detail_json`: `{ source_id }` |

**Tax payment actions (entity_type `tax_payment`, entity_id = payment id) — ADR-039:**

| Action | Logged when |
| --- | --- |
| `tax_payment.created` | Tax remittance recorded |
| `tax_payment.updated` | Tax payment changed |
| `tax_payment.deleted` | Tax payment deleted |

**Shipping actions (entity_type `shipping`, entity_id = order id) — ADR-074:**

| Action | Logged when |
| --- | --- |
| `shipping.rates_fetched` | Live rates retrieved for an order |
| `shipping.label_purchased` | Label bought. `detail_json`: `{ carrier_service, rate_cents, tracking_number }` |
| `shipping.label_refunded` | Label refund requested |
| `shipping.batch_purchased` | Batch label buy (ADR-040). `detail_json`: `{ count, ids }` |

> Note: `order.marked_shipped` remains an **order** action (status change). Carrier
> label/rate operations are **shipping** actions. Both are valid and distinct.

**Report actions — reclassified:** `report.generated` now uses **entity_type `report`**
(previously `setting`). `detail_json`: `{ report_name, format }`. `entity_id` is null (reports
have no persistent record row to select; see A3). `logActivity()` continues to accept the old
form, but new code uses `entity_type: "report"`.

**Config actions:** `settings.updated` (entity_type `setting`) is shown under the **Config**
chip. Auth events (`auth.connected`, `auth.disconnected`, `auth.token_refreshed`) keep
entity_type `setting` but are surfaced under the **System** chip (see A4).

### A3. Deep-link mapping (with ADR-035) and the **deleted = no link** rule

Each activity row's `entity_label` becomes a link to the underlying record **only** when a
target exists and the record still exists. Mapping (`activityEntityHref(entity_type, entity_id)`):

| entity_type | Link target (ADR-035) |
| --- | --- |
| `inventory` | `/inventory?itemId={id}` |
| `order` | `/orders?orderId={id}` |
| `customer` | `/customers?customerId={id}` |
| `address` | `/customers?customerId={customer_id}` (parent customer) |
| `receipt` | `/receipts?receiptId={id}` |
| `vendor` | `/vendors?vendorId={id}` |
| `expense` | `/expenses?expenseId={id}` |
| `tax_payment` | `/expenses?taxPaymentId={id}` (Tax section) |
| `shipping` | `/orders?orderId={id}` until WS-F ships, then `/shipping?orderId={id}` |
| `report` | no link (no persistent record) |
| `setting` | no link (config has no per-row record) |
| `sync` / `backup` / `system` | no link |

**Deleted = no link (locked WS-A decision):** for any action that **removes** a record, the row
renders with **no link** even though `entity_id` is present, because the target no longer
exists. Closed list of "removal" actions: `*.deleted` (`inventory.deleted`, `customer.deleted`,
`address.deleted`, `receipt.deleted`, `vendor.deleted`, `expense.deleted`, `tax_payment.deleted`)
and `customer.batch_deleted`. **Status-only changes keep their link** (e.g. `order.voided`,
`vendor.deleted` is a soft-delete so it *may* still resolve — but for consistency we treat all
`*.deleted` actions as no-link). Implementation: `activityEntityHref` returns `null` when the
action matches the removal list.

### A4. Filter-chip taxonomy (Activity log)

The Activity log (full view; ADR-016 §6 right column) shows these chips. Each chip maps to one or
more `entity_type` values passed to `GET /api/activity` (see A5):

| Chip label | Maps to entity_type(s) |
| --- | --- |
| All | (no filter) |
| Inventory | `inventory` (includes listing.* actions) |
| Sales / Orders | `order` |
| Customers | `customer`, `address` |
| Receipts | `receipt` |
| Vendors | `vendor` |
| Expenses | `expense`, `tax_payment` |
| Reports | `report` |
| Shipping | `shipping` |
| Communications | `communication` (ADR-078) |
| Config | `setting` (excluding auth.* which show under System) |
| Sync | `sync` |
| System | `system`, plus `auth.*` actions |
| Backup | `backup` |

Both the **Recent Activity** (newest 25, no filters — ADR-016 §6) and the **Activity log** (full,
filterable) draw from the **same** `activity_log` data; only the Activity log exposes the chips.

### A5. API — filter by multiple entity types

`GET /api/activity` (ADR-018) gains support for a **comma-separated** `entity_type` value so a
single chip can cover multiple types (e.g. `entity_type=expense,tax_payment` for Expenses;
`entity_type=customer,address` for Customers). Single-value usage is unchanged and backward
compatible. The `source` filter (`user|system|etsy_sync`) and existing params are unchanged.
System chip additionally matches `action LIKE 'auth.%'`; this composite is resolved server-side
(documented in ADR-018 WS-A addendum).

### A6. Coverage requirement

Every mutating route for the entities above MUST call `logActivity()` after success (per the
original "Integration points" section), using the canonical `entity_type`/`action` values in A1–A2.
This is the WS-A "all records listed on both reports" requirement: because both dashboard views
read the same table, full logging coverage automatically populates both.

**Cross-references checked (.cursorrules §1b):** ADR-016 (dashboard views render this data),
ADR-035 (deep-link targets — A3 adds receipt/vendor/expense/tax_payment/shipping; ADR-035 updated
accordingly), ADR-018 (`/api/activity` multi-type filter — A5), ADR-039/057/058/069/074/076/077
(action sources), ADR-017 (no schema change). `.cursorrules` "Activity log source" enum and the
entity_type list to be updated when WS-A implements.
