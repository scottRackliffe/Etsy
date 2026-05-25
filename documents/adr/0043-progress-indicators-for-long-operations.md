# ADR-043: Progress indicators for long operations

## Status

Accepted

## Date

2026-05-24

## Context

Several operations in the app can take seconds to minutes: Etsy sync (fetching and processing multiple receipts), backup create/restore (copying database and uploads), report PDF generation (rendering and writing PDF), bulk operations (processing many records), and thumbnail batch regeneration. Currently, the user sees no feedback during these operations — just a frozen UI until completion or failure. This creates confusion ("Did it crash?"), impatience, and accidental double-submissions.

## Decision

### 1. Operations requiring progress indicators

| Operation                    | Expected duration                   | Progress type | Source  |
| ---------------------------- | ----------------------------------- | ------------- | ------- |
| Etsy sync                    | 5–60s (depends on receipt count)    | Determinate   | ADR-019 |
| Backup create                | 2–30s (depends on DB + upload size) | Indeterminate | ADR-027 |
| Backup restore               | 2–30s                               | Indeterminate | ADR-027 |
| Report PDF generation        | 1–10s                               | Indeterminate | ADR-013 |
| Bulk operations (> 10 items) | 2–30s (depends on item count)       | Determinate   | ADR-040 |
| Thumbnail batch regeneration | 5–120s (depends on image count)     | Determinate   | —       |
| Report CSV export            | 1–5s                                | Indeterminate | ADR-013 |

### 2. Two progress patterns

**Pattern A — Determinate (known total):**

Used when the total number of items to process is known upfront (sync receipts, bulk operations, thumbnail regen).

```
┌────────────────────────────────────────────────────┐
│                                                    │
│           Syncing Etsy Orders                      │
│                                                    │
│    ████████████░░░░░░░░░░░░░░░░  15 of 42          │
│                                                    │
│    Processing receipt #1234567890...               │
│    Elapsed: 12s                                    │
│                                                    │
│                   [Cancel]                          │
│                                                    │
└────────────────────────────────────────────────────┘
```

- Progress bar: filled portion uses `var(--ui-accent)`, unfilled uses `var(--ui-border)`, height 8px, rounded corners
- Count: "N of M" displayed right of progress bar
- Status text: Current operation description (e.g., "Processing receipt #...")
- Elapsed time: Updated every second, format "Elapsed: Ns" or "Elapsed: N min Ns" for > 60s
- Cancel button: Available for sync and bulk operations (see §5)

**Pattern B — Indeterminate (unknown total or very fast):**

Used when the total is unknown or the operation is a single atomic step (backup, report generation).

```
┌────────────────────────────────────────────────────┐
│                                                    │
│           Generating Report                        │
│                                                    │
│    ◌ ◌ ◌ (animated spinner)                        │
│                                                    │
│    Building PDF document...                        │
│    Elapsed: 3s                                     │
│                                                    │
└────────────────────────────────────────────────────┘
```

- Spinner: animated `LoadingSpinner` component (ADR-028) at 32px size
- Status text: Describes current phase of the operation
- Elapsed time: Same format as determinate
- No cancel button (these operations are atomic and complete quickly)

### 3. Progress modal

Both patterns are displayed in a modal overlay.

**Modal specification:**

- Centered in viewport, width `max-w-md` (448px)
- Background: `var(--ui-card-bg)` with `var(--ui-border)` border, rounded corners
- Backdrop: semi-transparent dark overlay (same as other modals)
- **Non-dismissible:** No close button, no backdrop click to close, no Escape key — the user must wait for completion or cancel (if available)
- Title: operation name in `var(--ui-title)` at 16pt
- ARIA: `role="dialog"`, `aria-modal="true"`, `aria-busy="true"`, `aria-live="polite"` on status text

### 4. API design — job tracking

Long-running operations use an asynchronous job pattern.

**Starting a job:**

The initiating API call returns `202 Accepted` with a job ID:

```json
{
  "ok": true,
  "job_id": "job_abc123",
  "status": "running"
}
```

**Polling for progress:**

`GET /api/jobs/[job_id]`

Response:

```json
{
  "ok": true,
  "job_id": "job_abc123",
  "status": "running",
  "progress": {
    "current": 15,
    "total": 42,
    "message": "Processing receipt #1234567890"
  },
  "started_at": "2026-05-24T19:30:00Z",
  "elapsed_ms": 12000
}
```

**Status values:** `running`, `completed`, `failed`, `cancelled`

**On completion:**

```json
{
  "ok": true,
  "job_id": "job_abc123",
  "status": "completed",
  "progress": { "current": 42, "total": 42, "message": "Complete" },
  "result": {
    "synced": 42,
    "created": 12,
    "updated": 30,
    "errors": 0
  },
  "started_at": "2026-05-24T19:30:00Z",
  "elapsed_ms": 35000
}
```

**On failure:**

```json
{
  "ok": true,
  "job_id": "job_abc123",
  "status": "failed",
  "progress": { "current": 15, "total": 42, "message": "Failed at receipt #1234567890" },
  "error": {
    "code": "SYNC_RECEIPT_ERROR",
    "message": "Etsy API returned 500 for receipt #1234567890",
    "user_message": "Could not sync one or more orders from Etsy. Please try again."
  },
  "started_at": "2026-05-24T19:30:00Z",
  "elapsed_ms": 12000
}
```

**Polling interval:** Client polls every **2 seconds** while `status` is `running`.

**Alternative — Server-Sent Events (SSE):**

For operations that benefit from real-time updates without polling overhead, the server may expose an SSE endpoint:

`GET /api/jobs/[job_id]/stream` → `text/event-stream`

Events:

```
event: progress
data: {"current": 15, "total": 42, "message": "Processing receipt #1234567890"}

event: completed
data: {"result": {"synced": 42, "created": 12, "updated": 30, "errors": 0}}

event: failed
data: {"error": {"code": "SYNC_RECEIPT_ERROR", "message": "..."}}
```

The client should prefer SSE when available and fall back to polling if the SSE connection fails.

**Job storage:**

Jobs are tracked in memory (not persisted to the database). A `Map<string, JobState>` in the server process holds active jobs. Jobs are cleaned up 5 minutes after completion/failure/cancellation. Since this is a single-user local app, there will never be more than a few concurrent jobs.

**Job ID format:** `job_` prefix + 12 random alphanumeric characters (e.g., `job_a1b2c3d4e5f6`).

### 5. Cancel behavior

Cancellation is supported for sync and bulk operations (not for backup or report generation).

**Cancel request:** `DELETE /api/jobs/[job_id]`

Response:

```json
{
  "ok": true,
  "job_id": "job_abc123",
  "status": "cancelled",
  "progress": { "current": 15, "total": 42, "message": "Cancelled by user" },
  "result": {
    "processed_before_cancel": 15,
    "synced": 15,
    "created": 5,
    "updated": 10
  }
}
```

- **Partial results are preserved:** Items processed before cancellation are committed
- The job loop checks a `cancelled` flag before each iteration and stops gracefully
- The cancel button in the progress modal is disabled for 1 second after clicking (debounce double-clicks)
- Confirmation: No additional confirmation dialog for cancel — the cancel button in the progress modal is sufficient (the partial results are preserved, so cancel is non-destructive)

### 6. Completion behavior

**Success:**

- Progress modal auto-dismisses after **2 seconds**
- A success toast appears with a summary: "Synced 42 orders (12 new, 30 updated)" or "Backup created successfully"
- For reports: the report viewer opens automatically after the modal dismisses

**Failure:**

- The progress modal transforms into an error state:
  - Spinner/progress bar is replaced with an error icon (red)
  - Error message displayed in `var(--ui-red)` text
  - User-friendly error message (from the `user_message` field)
  - Two buttons: "Retry" (re-triggers the operation) and "Close" (dismisses the modal)
- A separate error toast is NOT shown (the modal handles the error display)

**Cancellation:**

- Progress modal dismisses immediately
- Info toast: "Operation cancelled. 15 of 42 items were processed."

### 7. Double-submission prevention

- While a job is running, the trigger button (e.g., "Sync Now", "Create Backup") is disabled
- The button shows a spinner and text like "Syncing..." to indicate it's in progress
- The progress modal is the primary indicator; the button state is a secondary guard
- Only one job of each type can run at a time. If a second request comes in for the same operation type, the API returns `409 Conflict`: `{ "error": { "code": "JOB_ALREADY_RUNNING", "message": "An Etsy sync is already in progress" } }`

### 8. Operations that do NOT need the job pattern

Some operations are fast enough to use a simple inline loading state:

| Operation                    | Expected duration | UI feedback                     |
| ---------------------------- | ----------------- | ------------------------------- |
| Single record save (PATCH)   | < 1s              | Button spinner + disabled state |
| Single record delete         | < 1s              | Button spinner + disabled state |
| Bulk operations ≤ 10 items   | 1–3s              | Button spinner (per ADR-040 §8) |
| Report CSV export < 100 rows | < 2s              | Button spinner                  |

These do NOT use the job/polling pattern. They use a simple `loading` state on the action button.

## Consequences

- **Positive:** Users get clear feedback during long operations, eliminating confusion about whether the app is working; cancellation preserves partial results so users don't lose progress; double-submission prevention avoids duplicate operations; the job pattern is reusable for any future long-running operations.
- **Negative:** The job tracking system adds server-side complexity (in-memory job map, polling/SSE endpoints); SSE adds an alternative progress delivery mechanism that must be maintained alongside polling; the 2-second polling interval could be too slow for very fast operations (but they'd use inline loading instead) or too fast for very slow operations (but 2s is a reasonable default).

## Notes

- Cross-references: ADR-019 (Etsy sync — primary consumer of determinate progress), ADR-027 (backup — consumer of indeterminate progress), ADR-013 (reports — consumer of indeterminate progress), ADR-040 (bulk operations — consumer of determinate progress for batches > 10), ADR-028 (LoadingSpinner component — used in indeterminate pattern)
- The in-memory job store means job state is lost on server restart. This is acceptable because: (a) this is a single-user local app, (b) jobs complete quickly, and (c) a server restart during a job implies something went wrong anyway
- Future consideration: WebSocket could replace SSE for bidirectional communication, but SSE is simpler and sufficient for server-to-client progress updates
