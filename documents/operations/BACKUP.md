# Backup and Restore

## Backup Frequency

- Development: before major schema changes.
- Staging: daily.
- Production: at least daily, and before every release.

## SQLite Backup

Example file copy backup:

- stop writes if possible
- copy DB file from `SQLITE_PATH` to timestamped location
- verify copied file size is non-zero

## Restore Steps

1. Stop app process.
2. Copy backup DB file into `SQLITE_PATH`.
3. Start app.
4. Verify with `GET /api/health` and key manual checks.

## Validation

- Keep at least one tested restore per week.
- Record backup test outcomes in release notes or ops log.
