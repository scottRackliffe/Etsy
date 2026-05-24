# ADR-027: Backup and restore — automated backups with rolling retention

## Status

Accepted

## Date

2026-05-24

## Context

Design-decisions-implementation §7 specifies automated backup with rolling 25 FIFO retention. The no-developer-questions checklist identified that no backup ADR exists. This ADR defines the full backup and restore specification.

## Decision

### 1. What is backed up

| Component | Included | Notes |
|-----------|----------|-------|
| SQLite database (`data/app.sqlite`) | Always | Core application data |
| Uploaded pictures (`uploads/`) | Configurable | Default: **not included** (can be large); user enables via `settings.backup_include_pictures` |
| Settings, tokens, session data | Included (in DB) | Part of the SQLite file |
| System files (`system/`, `src/`, config) | Not included | These are part of the application install, not user data |

### 2. Backup format

Each backup is a single file:

- **DB-only backup:** Copy of `app.sqlite` as `backup_YYYY-MM-DD_HH-MM-SS.sqlite`
- **DB + pictures backup:** A `.tar.gz` archive containing the SQLite file and the `uploads/` directory: `backup_YYYY-MM-DD_HH-MM-SS.tar.gz`

The timestamp is UTC.

### 3. Backup directory

| Setting | Key | Default |
|---------|-----|---------|
| Backup directory | `settings.backup_directory` | `./backups` (relative to project root) |

The directory is created if it does not exist. The path is configurable in Config → Backup section.

### 4. Backup schedule

| Setting | Key | Values | Default |
|---------|-----|--------|---------|
| Backup schedule | `settings.backup_schedule` | `manual`, `daily`, `weekly` | `manual` |
| Backup time (for daily/weekly) | `settings.backup_time` | HH:MM (24h, local time) | `02:00` |
| Backup day (for weekly) | `settings.backup_day` | 0–6 (0=Sunday) | `0` |

**Manual:** Backups run only when the user clicks "Backup now" in Config.

**Daily/weekly:** The app checks on startup and periodically (every 60 minutes while running) whether a scheduled backup is due. A backup is "due" if no backup file exists with a timestamp within the current schedule window. This avoids requiring a system-level cron job.

### 5. Rolling retention (FIFO)

| Setting | Key | Default |
|---------|-----|---------|
| Max backup count | `settings.backup_max_count` | 25 |

After each successful backup:
1. List all backup files in the backup directory (sorted by timestamp, oldest first).
2. If the count exceeds `backup_max_count`, delete the oldest files until count equals `backup_max_count`.

Only files matching the backup naming pattern (`backup_*.sqlite` or `backup_*.tar.gz`) are counted and managed. Other files in the directory are ignored.

### 6. Backup API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `POST /api/backup` | POST | Trigger an immediate backup; returns `{ ok: true, filename, size_bytes, backup_count }` |
| `GET /api/backup` | GET | List existing backups: `{ backups: [{ filename, created_at, size_bytes }], total }` |
| `DELETE /api/backup/:filename` | DELETE | Delete a specific backup file |

### 7. Restore flow

Restore is a **manual, deliberate** operation with confirmation:

1. User navigates to Config → Backup.
2. User sees list of available backups (from `GET /api/backup`).
3. User selects a backup and clicks "Restore."
4. App shows a confirmation dialog: "Restoring will replace all current data with the backup from [date]. This cannot be undone. Continue?"
5. On confirm:
   a. Create a "pre-restore" backup of the current database (safety net).
   b. Close the current database connection.
   c. Copy the selected backup file over `data/app.sqlite`.
   d. Reopen the database connection.
   e. If the backup includes pictures (`*.tar.gz`), extract `uploads/` over the current `uploads/` directory.
   f. Return success with a message: "Restored from backup [filename]. A pre-restore backup was saved."
6. The UI reloads to reflect restored data.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `POST /api/backup/restore` | POST | Body: `{ filename }`. Performs the restore. Returns `{ ok, pre_restore_backup }` |

### 8. Error handling

| Scenario | Behavior |
|----------|----------|
| Backup directory does not exist | Create it |
| Backup directory is not writable | Return error with `user_message`: "Backup directory is not writable. Check permissions or change the backup path in Config." |
| SQLite is locked during backup | Retry after 2 seconds, up to 3 times; if still locked, return error |
| Backup file is corrupt (restore) | Validate the SQLite file with `PRAGMA integrity_check` before restoring; if corrupt, reject with error |
| Disk full during backup | Return error: "Not enough disk space for backup." |

### 9. Config UI

The Config → Backup section shows:

- **Backup directory** — Text input; current path shown; "Browse" button (optional).
- **Schedule** — Dropdown: Manual / Daily / Weekly. If Daily or Weekly, show time picker and (for weekly) day picker.
- **Include pictures** — Toggle (default off). Help text: "Include uploaded pictures in backups. This increases backup size."
- **Max backups** — Number input (1–100, default 25).
- **Backup now** — Button to trigger immediate backup.
- **Recent backups** — Table: filename, date, size. Each row has "Restore" and "Delete" actions.
- **Last backup** — Display timestamp of most recent backup.

## Consequences

- **Positive:** Users have automated, reliable backups with clear restore path; rolling retention prevents unbounded disk growth.
- **Negative:** Large picture collections make backups slow and large when included; no off-site/cloud backup in v1.

## Notes

- SQLite backup uses the `VACUUM INTO` command (or file copy after checkpoint) to produce a consistent snapshot even while the app is running with WAL mode.
- The pre-restore safety backup is excluded from the rolling FIFO count (it uses a different naming pattern: `pre_restore_*.sqlite`).
- Future enhancement: add off-site backup (S3, Google Drive) as an optional destination.
