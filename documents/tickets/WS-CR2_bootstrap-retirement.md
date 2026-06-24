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

## Approach (doc-first)

1. Read ADR-087. Confirm migrations-only schema == golden (already verified in the audit).
2. Add the runtime migration applier; switch `getDb()` to use it; remove the bootstrap.
3. **Boot smoke-test** (`npm run dev`) on a fresh DB path AND the existing dev DB.

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
