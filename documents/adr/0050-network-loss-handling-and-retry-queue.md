# ADR-050: Network loss handling and retry queue

## Status

Accepted

## Date

2026-05-24

## Context

The app crashes or hangs if network drops mid-operation. No retry logic exists for failed API calls. Since this is a local Next.js app communicating with its own backend over localhost, true network loss is rare but possible (e.g., the server process crashes, port conflict, or the app is accessed from a remote machine). More commonly, transient errors (500, 503) from heavy operations or Etsy API timeouts need graceful handling.

## Decision

Implement network detection, an offline banner, a mutation retry queue, and transient error retry logic.

### Network detection

1. **Primary signal**: `navigator.onLine` browser API + `online`/`offline` window events.
2. **Health check**: When `navigator.onLine` is true, ping `GET /api/health` every 30 seconds. The endpoint returns `{ ok: true, timestamp: "..." }` with a 200 status. If the health check fails (timeout, non-200, network error), mark the app as "server unreachable."
3. **States**:
   - `online` — browser online + health check passing
   - `server-unreachable` — browser online but health check failing
   - `offline` — browser reports offline

### Offline banner

- When state is `offline` or `server-unreachable`, show a persistent top banner (below header, above content):
  - Offline: "You are offline. Changes will be saved when connection returns." (yellow background, `var(--ui-yellow)`)
  - Server unreachable: "Cannot reach server. Retrying..." (yellow background)
- Banner disappears automatically when connection is restored.
- Banner does NOT block UI interaction — user can still fill forms and trigger actions.

### Mutation queue

When a mutation request (POST, PATCH, DELETE) fails due to network error or server-unreachable state:

1. Store the failed request in a `localStorage` queue:
   ```json
   {
     "id": "uuid-v4",
     "method": "PATCH",
     "url": "/api/inventory/42",
     "body": { "description": "Updated vase" },
     "headers": { "If-Match": "2026-05-24T14:30:00.000Z" },
     "timestamp": "2026-05-24T14:35:00.000Z",
     "retryCount": 0
   }
   ```
2. Queue key: `esm_mutation_queue` in localStorage.
3. Maximum queue size: 100 entries. If full, reject new mutations with a toast: "Too many pending changes. Please wait for connection to restore."

### Replay on reconnect

When the app transitions from `offline`/`server-unreachable` to `online`:

1. Show progress toast: "Syncing N pending changes..."
2. Replay queued mutations **in order** (FIFO), one at a time (sequential, not parallel).
3. For each request:
   - Success (2xx): remove from queue, continue to next.
   - 409 Conflict: remove from queue, add to error list (concurrent edit detected per ADR-046).
   - 400 Validation error: remove from queue, add to error list.
   - 500/503: retry once after 5 seconds. If still failing, stop replay and keep remaining items in queue.
4. After replay completes:
   - If all succeeded: success toast "All changes synced."
   - If some failed: warning toast "N changes could not be synced." + notification in notification center (ADR-051) with details.

### Read request handling (GET)

- GET requests are NOT queued.
- When offline/server-unreachable: show whatever data is already rendered with a "Data may be outdated" badge (small yellow badge in the page header area).
- Failed GET requests show an inline error with "Retry" button instead of crashing the page.

### Transient error retry

For requests made while online (not queued), apply automatic retry for transient errors:

| Error                        | Behavior                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------ |
| Network error (fetch throws) | Retry once after 3 seconds                                                     |
| HTTP 500                     | Retry once after 5 seconds                                                     |
| HTTP 503                     | Retry once after 5 seconds                                                     |
| HTTP 429                     | Wait for `Retry-After` header value (or 60 seconds if absent), then retry once |
| HTTP 408 (timeout)           | Retry once after 5 seconds                                                     |

- Maximum 1 automatic retry per request (no exponential backoff for simplicity).
- After retry failure: surface the error normally (toast + error state).

### Timeout configuration

- All API calls (fetch) use `AbortController` with a 30-second timeout.
- Timeout is configurable per-request via `useApi` options: `{ timeout: number }`.
- On timeout: treat as transient error (retry once per rules above).

### `useApi` hook changes

Add the following options to the existing `useApi` hook:

```typescript
interface UseApiOptions {
  retryOnError?: boolean; // default: true for mutations, false for reads
  timeout?: number; // default: 30000 (ms)
  queueOnOffline?: boolean; // default: true for mutations, false for reads
}
```

### Health endpoint

`GET /api/health` — unprotected (no auth required):

```json
{ "ok": true, "timestamp": "2026-05-24T20:00:00.000Z" }
```

- Always returns 200 if the server is running.
- No database check (just confirms the process is alive).

## Consequences

- **Positive**: App no longer crashes on network issues. Users can continue working offline for short periods. Transient Etsy/server errors are retried transparently. Clear visual feedback about connection state.
- **Negative**: Mutation queue adds complexity — stale writes may conflict on replay (mitigated by ADR-046 conflict detection). localStorage has a ~5 MB limit which bounds queue size. No offline read capability (no service worker or local cache of data).

## Notes

- Cross-references: ADR-025 (Etsy token refresh — has its own retry logic for Etsy API calls; this ADR covers internal app API calls), ADR-046 (concurrent edit detection — 409 on replay is expected and handled gracefully), ADR-051 (notification center — failed sync items are logged as notifications)
- The health check interval (30s) is chosen to balance responsiveness with avoiding unnecessary requests. It only runs when the browser tab is visible (`document.visibilityState === 'visible'`).
- Future consideration: Service Worker for true offline support with cached reads. Not in scope for v1.
