# Ticket WS-CR2 — Retire the runtime bootstrap; migrations as sole schema source (C14)

> **Status: DONE + VERIFIED 2026-06-26** — commit 936ef1e. New `src/lib/db-migrate.ts`
> (idempotent applier); `getDb()` applies migrations; bootstrap deleted (sqlite.ts 765→~70 lines).
> Verified: fresh DB via runtime applier == migrations-only reference (19 migs, 27 tables, COA 13,
> integrity ok); **live DB migrated in place** — data preserved, dead schema dropped, identical to
> reference, app serves 200. No `020` needed (seed parity proven). Live DB backed up.
> _Note: the live cutover fired earlier than planned — a Turbopack hot-reload of sqlite.ts + an open
> browser tab polling an endpoint triggered the applier on the live DB mid-edit; verified healthy
> after, but next time stop the dev server before editing DB-init code._

| Field | Value |
|-------|-------|
| Status | **OPEN** — Tier 2 |
| Workstream | **Conformance Remediation** — WP3 final step. |
| Source ADR | **ADR-087** (migrations = single source of truth). |
| Recommended model | Strong model — changes app DB initialization; plan + verify. |
| Complexity | Medium. |
| Risk | Medium — touches `getDb()` startup; needs a boot smoke-test. |
| Priority | Medium (current converged state already works). |
| Depends on | Migrations 018/019 (done, verified); `db:migrate` runner. |

## Problem

WP3 made migrations the complete, verified source of truth (018/019) and corrected the `sqlite.ts`
bootstrap so both paths produce the identical clean schema. But the **parallel bootstrap still exists**
(`ensureCoreTables`/`ensureInventorySchema`) — ADR-087's end state is a single runtime source where
`getDb()` *applies migrations* and the hand-maintained bootstrap is deleted.

## Goal

- `getDb()` applies pending migrations on first use (port the idempotent core of
  `scripts/migrate.mjs` into a TS module both can share, or call it), with a guard against concurrent
  startup.
- Delete `ensureCoreTables` / `ensureInventorySchema` / `ensureTableColumns` and the
  `INVENTORY_COLUMNS` map (no second schema definition).
- Keep `getSqliteDatabasePath`, pragmas, `resetSqliteConnection`.

## Investigation — 2026-06-26 (owner-led, empirical)

Built a fresh **migrations-only** DB (`scripts/migrate.mjs --reset` to a temp path) and
diffed it against the live (bootstrap-built) DB:

- **Schema complete.** Every table the live DB has is present in the fresh DB (incl.
  `receipts`, `tax_payments`). The only differences are the 3 **dead** tables
  (`listing_exports`/`imports`/`publish_previews`) that fresh correctly **omits** (migration
  019 drops them; live just hasn't been migrated yet). The old "`receipts` is bootstrap-only"
  comment in `migrate.mjs` is **stale** (pre-018).
- **Seed parity confirmed.** chart_of_accounts: 13 == 13; gl_transaction_rules: 15 == 15.
  Both equity accounts (`3000` Owner's Equity, `3200` Retained Earnings) ARE in the fresh DB
  — seeded by `migrations/011_business_expenses.sql`. **Full-row MD5 of every COA and GL row
  is byte-identical** fresh vs live.

> A first pass *suspected* a seed delta (bootstrap 13 vs migration **009** 11) → a `020`
> reconciliation migration. The full migration set (009 **+ 011**) already covers it, so
> **`020` is NOT needed.** Recorded here because the empirical full-set check overrode the
> partial diff — facts over inference.

## Approach (doc-first)

1. Read ADR-087 (done). Schema + seed parity both **empirically confirmed** (above) — no
   reconciliation migration required.
2. Add the runtime migration applier (port the idempotent core of `scripts/migrate.mjs` to a
   TS module, `src/lib/db-migrate.ts`); switch `getDb()` to apply migrations; remove the
   bootstrap (`ensureInventorySchema`/`ensureCoreTables`/`ensureTableColumns`/
   `INVENTORY_COLUMNS`). Seeding now flows through migrations 009/011.
3. **Boot smoke-test** on (a) a fresh temp DB path and (b) a **copy** of the live dev DB —
   not the live DB itself — before pointing the running app at it.

## ⛔ Checkpoint before execution

Switching `getDb()` to the applier means the **next app boot migrates the live dev DB**
(applies 018/019 + 020, drops dead schema). That is intended per ADR-087 but is a
**hard-to-reverse** mutation of live data — confirm with the owner and back up the DB before
the live cutover.

## Out of scope

- Schema changes (no new tables/columns); that's separate tickets.

## Acceptance criteria

- [ ] Fresh DB via app boot has the full current schema (no bootstrap path).
- [ ] Existing dev DB boots cleanly (applies 018/019 once).
- [ ] Bootstrap functions removed; `npm run type-check` + `npm run build` pass.
- [ ] App boots and core tabs load (smoke-test).

## Escalation triggers (STOP and ask)

- Runtime fs access to `migrations/` is unreliable under the deploy target (bundling/cwd).

## Kickoff prompt

> Implement `documents/tickets/WS-CR2_bootstrap-retirement.md`. Read ADR-087. Make `getDb()` apply
> migrations and delete the parallel bootstrap; verify fresh + existing DB boot with `npm run dev`.
