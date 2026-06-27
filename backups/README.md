# Database backups

Local snapshots of `data/app.sqlite` taken before risky schema/data operations
(e.g. migrations, the WS-CR2 bootstrap-retirement cutover).

- Files here are **gitignored** — they are local-only and never committed.
- Naming: `app.sqlite.<reason>-<YYYYMMDD-HHMMSS>.bak`.
- To restore: stop the dev server, then `cp backups/<file> data/app.sqlite`
  (and remove any stale `data/app.sqlite-wal` / `-shm`).
