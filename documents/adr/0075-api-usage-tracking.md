# ADR-075: API usage tracking

## Status

Accepted

## Date

2026-06-12

## Context

The application makes outbound API calls to two external services — Etsy (OAuth, shop data, receipt sync, listing publish) and OpenAI (listing generate/refine, per-photo quality, shot list, dimension measurement, connection testing). Both services have usage-based billing or quota implications:

- **Etsy** bundles API access and shipping labels into the monthly subscription, but has daily/per-second rate limits that the app must respect. Visibility into call volume helps diagnose rate-limit issues and plan sync frequency.
- **OpenAI** charges per API call based on token usage. Without visibility into call counts, the operator has no way to correlate OpenAI billing with app activity.
- **EasyPost** (potential future integration per ADR-074) charges per label and per address verification. If added, the same tracking mechanism should cover it.

No existing mechanism tracks external API call counts. The `activity_log` table records business-level events (order created, listing approved) but not individual API requests. The structured logger writes to the console but does not persist counts to the database.

The operator asked for monthly call counts per service, displayed in the Settings page.

---

## Decision

### 1. Database table: `api_call_log`

A new lightweight table stores one row per outbound API call:

```sql
CREATE TABLE IF NOT EXISTS api_call_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service TEXT NOT NULL,        -- 'etsy' | 'openai' (future: 'easypost')
  endpoint TEXT NOT NULL,       -- e.g. '/shops/{id}/receipts', 'responses.create/listing-generate'
  status_code INTEGER,          -- HTTP status code (200, 429, 500, etc.)
  created_at TEXT NOT NULL      -- ISO 8601 UTC
);

CREATE INDEX idx_api_call_log_service_month ON api_call_log(service, created_at);
```

Design choices:

- **No request/response payloads** — this is a counter, not a debug log. Keeps the table small.
- **`status_code` is nullable** — some SDK calls may not surface a status code cleanly.
- **`endpoint` includes a qualifier** — e.g. `responses.create/listing-generate` vs `responses.create/listing-refine` to distinguish OpenAI call sites.
- **Model lane (WS-AICOST):** the economy-eligible tasks (`responses.create/listing-photo-quality`, `.../shot-list`, `.../measure`) honor the optional `ai.economy_model` setting via `resolveModelForTask()`; the endpoint label is unchanged regardless of which model lane runs, so per-call-site attribution is preserved.
- **Fire-and-forget** — the `logApiCall()` helper never throws; failures are logged to the structured logger and silently ignored.

### 2. Instrumentation points

Every outbound `fetch()` or SDK call to an external service logs a row immediately after the HTTP response is received (whether success or error).

#### Etsy (7 call sites in `src/lib/etsy.ts`)

| Function | Endpoint logged |
|----------|----------------|
| `exchangeCodeForToken()` | `oauth/token/exchange` |
| `refreshAccessToken()` | `oauth/token/refresh` |
| `etsyApi()` | The actual API path (e.g. `/users/me`, `/shops/{id}/receipts`) |
| `createDraftListing()` | `/shops/{shopId}/listings` |
| `uploadListingImageFromReference()` | `/shops/{shopId}/listings/{listingId}/images` |
| `updateListingDetails()` | `/shops/{shopId}/listings/{listingId}` |
| `updateListingState()` | `/shops/{shopId}/listings/{listingId}` |

For retry loops (429 handling), each attempt is logged separately so the operator can see rate-limit pressure.

#### OpenAI (4 call sites)

| Location | Endpoint logged |
|----------|----------------|
| `src/lib/listing-ai.ts` → Generate engine (research + price + fields, ADR-085) | `responses.create/generate-listing` |
| `src/lib/listing-ai.ts` → `refineListing()` (per-field/global) | `responses.create/listing-refine` |
| ~~`src/lib/listing-coach.ts`~~, ~~`improve-listing`~~ | **RETIRED (ADR-085):** folded into the Generate/refine engine above |
| `src/lib/listing-photo-vision.ts` → `evaluatePhotoQuality()` | `responses.create/listing-photo-quality` |
| `src/lib/ai-config.ts` → `testAiConnection()` | `responses.create/test-connection` |

### 3. Query API

```
GET /api/usage?months=6
```

Returns monthly aggregates:

```json
{
  "ok": true,
  "items": [
    { "service": "etsy", "month": "2026-06", "call_count": 142 },
    { "service": "openai", "month": "2026-06", "call_count": 8 }
  ]
}
```

- `months` parameter: 1–24, default 6
- Aggregation uses SQLite `strftime('%Y-%m', created_at)`
- Results sorted by month descending, then service ascending

### 4. Config UI

A new "API Usage" section in the Settings page (between Sample Data and Backup & Restore) displays:

- A table with one row per month, one column per service, plus a row total
- Current month highlighted with a green "current" badge
- A Refresh button to reload data on demand
- Empty state: "No API calls recorded yet."

### 5. Helper module

`src/lib/api-usage.ts` exports:

- `logApiCall(service, endpoint, statusCode?)` — INSERT into `api_call_log`; fire-and-forget
- `getMonthlyUsage(months?)` — aggregate SELECT returning `MonthlyUsageRow[]`

### 6. Extensibility

Adding a new service (e.g. EasyPost) requires only adding `logApiCall("easypost", ...)` calls at the relevant fetch points. The table, API, and UI automatically discover new service names from the data — no schema or UI changes needed.

## Consequences

### Positive

- Operator has monthly visibility into external API call volume per service
- Supports cost awareness for usage-based services (OpenAI, future EasyPost)
- Helps diagnose rate-limit issues by showing call volume trends
- Zero overhead on application logic — fire-and-forget logging
- Self-extending — new services appear in the UI automatically

### Negative

- Table grows over time (one row per API call); may need a retention/purge policy similar to `activity_log` if call volume is high
- Does not track token usage or cost for OpenAI (only call count); OpenAI billing granularity requires token-level tracking which is out of scope

## Notes

- **Retention:** No automatic purge is implemented in v1. If the table grows large, a purge policy similar to `activity_log.retention_days` can be added (see ADR-037).
- **No cost estimation:** This tracks call counts only, not dollar costs. OpenAI token usage and cost estimation are deferred.
- **Internal API calls are not tracked** — only outbound calls to external services (Etsy, OpenAI).

### Files changed

| File | Change |
|------|--------|
| `src/lib/sqlite.ts` | Added `api_call_log` table DDL and index |
| `src/lib/api-usage.ts` | New module — `logApiCall()` and `getMonthlyUsage()` |
| `src/lib/etsy.ts` | Added `logApiCall('etsy', ...)` at 7 fetch points |
| `src/lib/listing-generator.ts` | Added `logApiCall('openai', ...)` |
| `src/lib/listing-photo-vision.ts`, `shot-list.ts`, `dimension-annotation.ts` | Added `logApiCall('openai', ...)` at each OpenAI call site (WS-AICOST economy lane) |
| `src/lib/ai-config.ts` | Added `logApiCall('openai', ...)` |
| `src/app/api/inventory/[id]/improve-listing/route.ts` | Added `logApiCall('openai', ...)` |
| `src/app/api/usage/route.ts` | New endpoint — `GET /api/usage` |
| `src/app/(app)/settings/page.tsx` | New "API Usage" section in Config UI |

### Cross-references

- ADR-017: Database schema — `api_call_log` table addition
- ADR-018: API surface — `GET /api/usage` endpoint addition
- ADR-034: Settings completion — new API Usage section
- ADR-037: Activity log — similar retention pattern (not yet applied to `api_call_log`)
- ADR-074: EasyPost integration — future `logApiCall("easypost", ...)` instrumentation
