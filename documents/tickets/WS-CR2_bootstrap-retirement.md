# Ticket WS-CR2 — Retire the runtime bootstrap; migrations as sole schema source (C14)

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

## ⚠️ Scope finding — 2026-06-26 (owner-led investigation)

ADR-087 verified **schema** parity (migrations-only == golden), but the bootstrap also
**seeds default data** that migrations do **not** fully reproduce. Deleting the bootstrap
blind would drop seed rows on a fresh install:

- **Chart of accounts:** bootstrap (`ensureCoreTables`, sqlite.ts ~L591) seeds **13**
  accounts; `migrations/009_chart_of_accounts.sql` seeds **11**. Missing from migrations:
  **`3000` (Owner's Capital/Equity)** and **`3200` (Retained Earnings)** — equity accounts
  present only in the bootstrap.
- **GL transaction rules:** seeded in both the bootstrap (sqlite.ts ~L611 and the
  conditional rule ~L645) and migrations 009/011 — needs the same row-level delta check;
  any bootstrap-only rule must be captured too.
- Seed surface is bounded to **chart_of_accounts + gl_transaction_rules** (the only
  `count==0 → seed` blocks in the bootstrap).

**Therefore the bootstrap can only be retired *after* a forward-only reconciliation
migration** (e.g. `020_seed_reconciliation.sql`, `INSERT OR IGNORE`) back-fills the
bootstrap-only seeds, so a migrations-only fresh DB matches the live DB on **data**, not
just schema. Existing DBs already have the rows (bootstrap seeded them) → `INSERT OR IGNORE`
is a clean no-op there.

## Approach (revised, doc-first)

1. Read ADR-087 (done). Schema parity confirmed; **seed parity is NOT yet there** (above).
2. **Author `020_seed_reconciliation.sql`** — `INSERT OR IGNORE` for the bootstrap-only COA
   accounts (3000, 3200) + any bootstrap-only GL rules. Verify a fresh migrations-only DB
   then equals the live DB on COA + GL rule rows.
3. Add the runtime migration applier (port the idempotent core of `scripts/migrate.mjs` to a
   shared TS module); switch `getDb()` to apply migrations; remove the bootstrap schema +
   seed.
4. **Boot smoke-test** on (a) a fresh temp DB path and (b) a **copy** of the live dev DB —
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
