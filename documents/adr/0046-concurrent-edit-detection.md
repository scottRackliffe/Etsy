# ADR-046: Concurrent edit detection

## Status

Accepted

## Date

2026-05-24

## Context

Two browser tabs editing the same record will silently overwrite each other. Although this is a single-user app, multiple tabs and auto-refresh cycles can conflict. Without protection, a user editing an inventory item in one tab while another tab auto-refreshes and triggers a save will lose changes without any warning.

## Decision

Implement optimistic locking via the `updated_at` timestamp column already present on all mutable tables.

### Protocol

1. **Every PATCH request** to a protected resource must include an `If-Match` header containing the `updated_at` ISO 8601 timestamp value from when the record was last loaded by the client.

2. **Server validation**: Before applying any update, the API handler compares the `If-Match` header value to the current `updated_at` value in the database:
   - If they match → proceed with the update (the `updated_at` column is set to `NOW()` as part of the write).
   - If they differ → reject with HTTP 409 and the standard error envelope:
     ```json
     {
       "ok": false,
       "error": {
         "code": "CONCURRENT_EDIT",
         "message": "Record has been modified since it was loaded",
         "user_message": "This record was modified since you loaded it. Please reload and try again.",
         "actions": ["Reload"],
         "can_retry": true
       }
     }
     ```
     > Reconciled 2026-06-09: error code unified with ADR-018 §7 as `CONCURRENT_EDIT`.

3. **Missing `If-Match` header**: If the header is absent, accept the write without conflict checking. This provides backwards compatibility for clients that have not yet adopted the protocol (e.g., older API consumers, scripts, or Etsy sync operations).

### Scope

Applies to all PATCH endpoints for:

- `inventory`
- `orders`
- `customers`
- `addresses`
- `settings` (individual key updates)

Does NOT apply to:

- POST (create) requests — no prior version exists
- DELETE requests — deletion is idempotent
- Bulk operations (e.g., CSV import) — these use row-level uniqueness checks instead

### Frontend implementation

- The `useApi` hook's PATCH wrapper automatically includes `If-Match` from the `updated_at` field of the last-loaded record state.
- On 409 response with code `CONCURRENT_EDIT`:
  1. Show an error toast: "This record was modified since you loaded it."
  2. Toast includes a "Reload" action button.
  3. Clicking "Reload" re-fetches the record from the server and replaces the local state, discarding unsaved edits.
  4. The form is NOT auto-submitted after reload — the user must re-apply their changes manually.

### Header format

```
If-Match: 2026-05-24T14:30:00.000Z
```

The value is the exact ISO 8601 string as returned by the API in the record's `updated_at` field. No ETag hashing — the raw timestamp is sufficient for a single-user local app.

## Consequences

- **Positive**: Prevents silent data loss from concurrent tab edits or stale auto-saves. Simple to implement with no additional DB columns. Backwards compatible — existing clients without the header continue working.
- **Negative**: Users will occasionally see 409 errors and need to reload, losing unsaved edits. No auto-merge of changes — the entire record must be reloaded.

## Notes

- Cross-references: ADR-018 (API rules — standard error envelope), ADR-021 (validation — error response shape)
- The `updated_at` column is already set by triggers/application code on every UPDATE. No schema changes needed.
- Etsy sync operations (ADR-019) do NOT send `If-Match` headers — they always win because sync data is authoritative from Etsy.
