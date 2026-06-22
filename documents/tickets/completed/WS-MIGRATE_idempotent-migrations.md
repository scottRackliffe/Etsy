# Ticket WS-MIGRATE — Make the migration runner idempotent (bootstrap ↔ migrations reconciliation)

> **Status: DONE — merged 2026-06-22.** Migration runner is idempotent (bootstrap ↔ migrations reconciled).

| Field | Value |
|-------|-------|
| Status | **OPEN** — Tier 3 backlog |
| Workstream | Infrastructure / hardening (backlog) |
| Source | `.cursorrules` §2 (bootstrap vs migrations must converge), `documents/database/SCHEMA_RECONCILIATION.md`, ADR-058 (SQLite hardening) |
| Recommended model | **T2 — Sonnet** (`claude-4.6-sonnet-medium-thinking`). Small, well-scoped, mechanical. |
| Complexity | Small |
| Risk | Low (touches only the dev/ops migration path; no app runtime code, no schema shape change) |
| Priority | Backlog — **not** blocking. Local dev works today via `sqlite.ts` bootstrap. |
| Sequencing | Independent. Can run any time. |

---

## Problem

The app maintains its schema **two ways that have diverged**:

1. **Runtime bootstrap** — `src/lib/sqlite.ts` creates every table with `CREATE TABLE IF NOT EXISTS`
   and an `INVENTORY_COLUMNS` map that already contains the newest columns. A fresh DB created by
   simply running the app is **fully up to date** and has an **empty `schema_migrations` table**.
2. **Migration files** — `migrations/001..016*.sql`, applied by `scripts/migrate.mjs`, each using
   plain `ALTER TABLE ... ADD COLUMN` / `CREATE TABLE` (SQLite has **no** `ADD COLUMN IF NOT EXISTS`).

Because the dev/live DB (`data/app.sqlite`) is bootstrap-managed, its `schema_migrations` is empty
even though all columns/tables already exist. **Running `npm run migrate` against it throws**
`SqliteError: duplicate column name: ...` on the first `ADD COLUMN` that already exists, aborting the
run. The same failure would hit any environment where bootstrap and migrations are mixed.

This is the long-standing reconciliation gap noted in `.cursorrules`. It is **harmless for current
local dev** (nobody needs to run `migrate` there) but it makes the migration path unreliable for a
future clean production/deploy story and for `npm run migrate -- --reset` workflows.

## Goal

Make `scripts/migrate.mjs` **idempotent and self-healing** so it can be run safely against any DB —
fresh, bootstrap-managed, or partially migrated — without manual intervention, and so it correctly
**back-fills `schema_migrations`** to reflect reality.

## Locked decisions

- **Fix the runner, not the 16 SQL files.** Do **not** rewrite individual migrations or change schema
  shape. SQLite cannot express `ADD COLUMN IF NOT EXISTS`, so robustness belongs in the runner.
- **Statement-level tolerance:** execute each migration's statements such that an
  *"already exists"* class error (`duplicate column name`, `table ... already exists`,
  `index ... already exists`) is treated as **already-applied → skip that statement**, not a failure.
- **Record on success OR full-skip:** if a migration runs cleanly *or* every statement was an
  already-exists no-op, insert its row into `schema_migrations` so it is not retried. A migration that
  fails for any **other** reason must still abort the run (transactional) and surface the error.
- **Preserve existing behavior:** `--reset` (drop + recreate file) stays. Ordering by filename stays.
  Already-recorded migrations are still skipped up front.
- Keep it dependency-free (Node built-ins + `better-sqlite3`, as today).

## Suggested approach (implementer's discretion)

In `scripts/migrate.mjs`, for each not-yet-recorded migration:
- Split the file into individual statements (or run statement-by-statement) inside the existing
  transaction.
- Wrap each statement; on error, if `err.message` matches `/duplicate column name|already exists/i`,
  swallow it and continue; otherwise rethrow (rolls back the transaction).
- After all statements, `INSERT INTO schema_migrations(version, applied_at)`.
- Log per migration whether it was `applied` vs `reconciled (already present)`.

> Note: naive split on `;` is acceptable here because the migration files are simple DDL with no
> triggers/`BEGIN..END` blocks containing semicolons. If any future migration needs that, prefer a
> guard that checks `PRAGMA table_info`/`sqlite_master` before each DDL instead. Keep the parser
> simple; do not over-engineer.

## Files (edit only these)

1. `scripts/migrate.mjs` — add statement-level idempotency + reconciliation recording + logging.
2. `documents/database/SCHEMA_RECONCILIATION.md` — note that the runner is now idempotent and that
   bootstrap-managed DBs are reconciled (back-filled) on first `migrate`. (Create the note if the file
   exists; if it does not, add a short section to `.cursorrules` §2 instead — do not create new docs
   unnecessarily.)

## Acceptance criteria

- [ ] Running `npm run migrate` against the **current bootstrap-managed** `data/app.sqlite` completes
      with exit 0, applies nothing destructive, and **back-fills `schema_migrations`** with
      `001..016` (so a second run is a clean no-op).
- [ ] Running `npm run migrate` twice in a row is a clean no-op the second time.
- [ ] `npm run migrate -- --reset` still produces a correct, fully-migrated fresh DB with all
      `001..016` recorded.
- [ ] A migration that fails for a **real** reason (e.g. bad SQL, not an "already exists") still
      aborts with a non-zero exit and rolls back (no partial `schema_migrations` row for it).
- [ ] No change to any `migrations/*.sql` file; no change to `src/lib/sqlite.ts`; no app runtime
      behavior change.
- [ ] `npm run build` passes.

## Out of scope

- Removing the runtime bootstrap from `sqlite.ts` (keep both; they now converge).
- Any new schema, columns, or data backfill.
- A production deployment pipeline (separate effort).

## Escalation triggers (STOP and ask)

- A migration file is found to contain multi-statement blocks (triggers/`BEGIN..END`) that a simple
  splitter would break — switch to a `PRAGMA`/`sqlite_master` existence-guard approach and confirm.
- `schema_migrations` already contains partial/unexpected rows that complicate back-fill.

## Kickoff prompt

> Implement ticket `documents/tickets/WS-MIGRATE_idempotent-migrations.md`. Read it and follow
> `.cursor/rules/implementer.mdc`. Fix ONLY `scripts/migrate.mjs` to make the runner idempotent:
> tolerate "already exists" / "duplicate column name" errors per-statement (treat as already-applied),
> still abort on any other error, and back-fill `schema_migrations` for bootstrap-managed DBs. Do not
> edit any `migrations/*.sql` or `src/lib/sqlite.ts`. Verify all acceptance criteria (run `npm run
> migrate` twice against the existing DB, and `npm run migrate -- --reset`), then run `npm run build`.
> Report what you changed and confirm each acceptance-criteria checkbox.
