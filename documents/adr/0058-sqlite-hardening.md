# ADR-058: SQLite WAL Mode, Busy Timeout, and Integrity Checks

## Status

Accepted

## Date

2026-05-24

## Context

The current SQLite configuration does not explicitly set WAL mode, busy timeout, or foreign key enforcement. Without WAL mode, reads block during writes. Without a busy timeout, concurrent access attempts fail immediately with `SQLITE_BUSY`. Without runtime integrity checks, silent corruption could go undetected until data loss occurs. These are critical for data safety in a production application.

## Decision

### Pragmas on database open

In `getDb()` (or equivalent database initialization in `src/lib/sqlite.ts`), execute the following pragmas immediately after opening the connection, in this order:

```sql
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;
```

| Pragma                 | Purpose                                                                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `journal_mode = WAL`   | Write-Ahead Logging — enables concurrent reads during writes. Readers do not block writers and writers do not block readers.                                                                           |
| `busy_timeout = 5000`  | Wait up to 5000ms for a lock instead of returning `SQLITE_BUSY` immediately. Handles brief contention from concurrent API requests.                                                                    |
| `foreign_keys = ON`    | Enforce foreign key constraints at runtime. SQLite does not enforce FK constraints by default — they must be enabled per connection.                                                                   |
| `synchronous = NORMAL` | Balance durability vs. performance. In WAL mode, `NORMAL` is safe against corruption on OS crash (data loss limited to last few transactions, not corruption). `FULL` is unnecessary overhead for WAL. |

### Integrity check on startup

- On application startup (server initialization), check `settings.last_integrity_check` timestamp
- If `last_integrity_check` is NULL or older than 7 days: run `PRAGMA integrity_check;`
- If result is `'ok'`: update `settings.last_integrity_check` to current ISO 8601 timestamp
- If result is NOT `'ok'`:
  1. Log a CRITICAL-level error via structured logger with the full integrity_check output
  2. Set a flag (e.g., `settings.integrity_warning = 'true'`) that the frontend reads
  3. Frontend displays a persistent, non-dismissable banner: **"Database integrity issue detected. Please restore from backup (Config → Backup & Restore)."**
  4. Application continues to function (do not block access — the user needs to export/backup remaining data)

### Quick check before backup

- Before starting any backup operation (ADR-027), run `PRAGMA quick_check;`
- `quick_check` is faster than full `integrity_check` (skips index verification)
- If `quick_check` fails: abort backup, return error: "Database failed integrity check. Cannot create a reliable backup. Please contact support."
- If `quick_check` passes: proceed with backup

### Connection management

- `better-sqlite3` uses synchronous, single-connection access — document this explicitly in `src/lib/sqlite.ts`
- The singleton pattern (single `Database` instance reused across all requests) is the correct approach for `better-sqlite3` in a Next.js server environment
- Do NOT create connection pools — `better-sqlite3` is not thread-safe across multiple connections to the same file
- The `busy_timeout` pragma handles the case where the OS-level file lock is briefly held by another process (e.g., backup tool reading the DB)

### Error handling for SQLITE_BUSY

- If a query fails with `SQLITE_BUSY` after the 5-second timeout: catch the error and return HTTP 503 with standard error envelope:
  ```json
  {
    "ok": false,
    "error": {
      "code": "DATABASE_BUSY",
      "message": "Database is temporarily busy",
      "user_message": "The database is busy. Please try again in a moment.",
      "can_retry": true
    }
  }
  ```

### WAL file management

- WAL mode creates two additional files: `app.sqlite-wal` and `app.sqlite-shm`
- These files MUST be included in backup operations (ADR-027)
- On clean shutdown, run `PRAGMA wal_checkpoint(TRUNCATE);` to flush WAL to main database file
- Do not delete `-wal` or `-shm` files manually

## Consequences

- **Positive:** WAL mode eliminates read-write blocking, improving perceived performance under concurrent API requests. Busy timeout prevents spurious SQLITE_BUSY errors. FK enforcement catches referential integrity bugs at the database level. Integrity checks detect corruption early, before data loss compounds.
- **Negative:** WAL mode uses slightly more disk space (WAL file can grow until checkpoint). Integrity check on startup adds a one-time delay (typically < 1 second for databases under 100MB, but scales with DB size). The 7-day check interval means corruption could exist for up to 7 days before detection.

## Notes

- Cross-references: ADR-012 (SQLite as database choice), ADR-017 (database schema — FK relationships that `foreign_keys = ON` enforces), ADR-027 (backup and restore — quick_check before backup, WAL files in backup)
- `better-sqlite3` documentation confirms that WAL mode is the recommended journal mode for server applications
- The `synchronous = NORMAL` setting is explicitly safe in WAL mode per SQLite documentation: "In WAL mode, synchronous=NORMAL is safe from corruption. The only risk is losing the last transaction on an OS crash."
- Future consideration: `PRAGMA optimize;` could be run periodically to maintain query planner statistics
