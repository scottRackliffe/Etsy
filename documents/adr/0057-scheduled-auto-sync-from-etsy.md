# ADR-057: Scheduled Auto-Sync from Etsy

## Status

Accepted

## Date

2026-05-24

## Context

Etsy order sync is currently manual-only. The user must remember to click "Sync" to pull in new orders. This means new orders could be missed for hours, delaying fulfillment. An automatic sync on a configurable interval ensures orders are pulled in promptly without user intervention.

## Decision

### Config setting

- Setting key: `sync.auto_interval`
- Stored in the `settings` table (key-value store)
- Allowed values: `off` (default), `5min`, `15min`, `30min`, `1hour`
- Configurable via Config page → Etsy Connection section (ADR-034 §2)
- UI: dropdown select with the five options above

### Client-side implementation

- `AppProvider` (or dedicated `SyncProvider`) sets up a `setInterval` when:
  1. `isConnected === true` (Etsy OAuth tokens are valid)
  2. `sync.auto_interval !== 'off'`
- Interval calls `POST /api/sync/etsy` (same endpoint as manual sync)
- On setting change: clear existing interval and set new one (or clear if set to `off`)
- On component unmount: clear interval

### Interval values

| Setting | Interval (ms) |
| ------- | ------------- |
| `5min`  | 300,000       |
| `15min` | 900,000       |
| `30min` | 1,800,000     |
| `1hour` | 3,600,000     |

### Sync indicator

- Dashboard `EtsySyncStatus` widget shows: "Auto-sync: every 15 min" (or whichever interval is set)
- `Last synced: {last_etsy_sync_at}` is always shown regardless of auto-sync setting
- When auto-sync is off, show "Auto-sync: off"

### Concurrency and mutex

- Before calling `POST /api/sync/etsy`, check if a sync is already in progress (existing mutex per ADR-019)
- If already syncing, skip this interval silently — do not queue or retry
- The `POST /api/sync/etsy` endpoint already handles idempotent sync by `receipt_id` (ADR-019)

### Failure handling

- Track consecutive failure count in component state (not persisted)
- On sync failure: increment counter, silently retry on next interval
- After 3 consecutive failures: show a persistent warning toast: "Auto-sync failing. Check your Etsy connection."
- On next successful sync: reset failure counter and dismiss warning toast
- Individual failure details are logged via the structured logger (`src/lib/logging.ts`)

### Disable on disconnect

- When `isConnected` changes to `false`: immediately clear the interval
- When `isConnected` changes to `true` and `sync.auto_interval !== 'off'`: start the interval
- Token refresh (ADR-025) handles transparent re-auth; auto-sync does not need to manage tokens directly

### Activity log entries (ADR-037)

| Action                | Entity Type | Source   | Detail                                          |
| --------------------- | ----------- | -------- | ----------------------------------------------- |
| `sync.auto_started`   | `system`    | `system` | `{ "interval": "15min" }`                       |
| `sync.auto_completed` | `system`    | `system` | `{ "new_orders": 3, "updated_orders": 1 }`      |
| `sync.auto_failed`    | `system`    | `system` | `{ "error": "...", "consecutive_failures": 2 }` |

## Consequences

- **Positive:** Orders are pulled in automatically, reducing fulfillment delays. Configurable interval lets users balance freshness vs. API rate limit usage. Silent retry avoids alert fatigue for transient failures.
- **Negative:** Adds background network activity that the user may not be aware of. Client-side interval means auto-sync only runs while the app is open in a browser tab. Uses Etsy API quota even when no new orders exist.

## Notes

- Cross-references: ADR-019 (Etsy order sync — endpoint, mutex, idempotency), ADR-025 (token refresh — transparent re-auth before API calls), ADR-034 (Config page — Etsy Connection section UI, §2), ADR-037 (activity log — new action types for auto-sync)
- Future enhancement: server-side cron or webhook-based sync could replace client-side interval for reliability, but Etsy does not currently offer webhooks for receipt updates
- Rate limit consideration: Etsy API allows ~10,000 calls/day per app. Even at 5-minute intervals, auto-sync uses ~288 calls/day — well within limits
