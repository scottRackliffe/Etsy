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
| `listing.draft_saved`    | `inventory` | Manual draft saved                                                                                                                 |
| `listing.ai_generated`   | `inventory` | AI listing content generated                                                                                                       |
| `listing.coach_complete` | `inventory` | Listing Coach saved new item. `detail_json`: `{ picture_count, google_photos_count, price_confidence, sale_revenue_set: boolean }` |
| `listing.exported`       | `inventory` | Portable AI package exported. `detail_json`: `{ export_id }`                                                                       |
| `listing.imported`       | `inventory` | Portable AI draft imported. `detail_json`: `{ export_id, source_label }`                                                           |
| `listing.approved`       | `inventory` | Draft approved for publishing                                                                                                      |
| `listing.rejected`       | `inventory` | Draft rejected back to draft state                                                                                                 |
| `listing.published`      | `inventory` | Published to Etsy. `detail_json`: `{ etsy_listing_id }`                                                                            |
| `listing.publish_failed` | `inventory` | Publish attempt failed. `detail_json`: `{ error }`                                                                                 |

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

> **Reconciliation note (2026-06-09):** `inventory.batch_status_changed` and `inventory.batch_deleted` moved to the Inventory actions table above (they were previously duplicated here). `inventory.bulk_imported` (ADR-047) and `customer.batch_deleted` (ADR-040) added to their respective tables. `sync.started`/`sync.completed` confirmed present in Sync actions. `listing.coach_complete` confirmed present in Listing actions. Source field values: `user`, `system`, `etsy_sync`.

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
