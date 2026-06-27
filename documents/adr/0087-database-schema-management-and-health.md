# ADR-087: Database schema management & health — migrations as the single source of truth

## Status

Accepted

_Decision date 2026-06-23 (owner walkthrough). This ADR sets the **direction and principles**; the
schema-review + migration-consolidation + health-procedures work is a scoped engineering task
(step 3 of the conformance remediation). Open conformance gaps it governs:
`documents/CODE_DOC_CONFORMANCE_AUDIT_2026-06-23.md` C13, C14 (and the dead-schema items C2, C12)._

**Implementation status (2026-06-23):**
- ✅ **Migrations are now the complete source of truth.** `migrations/018_schema_consolidation.sql`
  back-fills the 6 tables + 8 columns + 6 indexes that were previously bootstrap-only;
  `migrations/019_drop_dead_schema.sql` drops the dead `listing_draft_state` column and the
  `listing_exports`/`listing_imports`/`listing_publish_previews` tables. **Verified**: a fresh
  migrations-only DB equals the golden (live) schema, and applying 018+019 to a copy of the live DB
  upgrades cleanly with data preserved (both paths converge to one clean schema).
- ✅ **Runtime bootstrap corrected to match** (`src/lib/sqlite.ts`): `tax_payments` added (fixes the
  C13 crash on a bootstrap-built DB); dead schema removed so the bootstrap can't re-create what
  migration 019 drops. Bootstrap and migrations now produce the identical clean schema.
- ✅ **DONE 2026-06-26 (WS-CR2): full bootstrap retirement.** The end state is reached —
  `getDb()` now *applies pending migrations* via `src/lib/db-migrate.ts` (the idempotent runner,
  ported from `scripts/migrate.mjs`), and the hand-maintained `ensureCoreTables`/
  `ensureInventorySchema` bootstrap is **deleted** (`sqlite.ts` 765→~70 lines). There is one
  runtime schema source. Verified empirically: a fresh DB built by the runtime applier equals the
  migrations-only reference (19 migrations, 27 tables, COA 13, integrity ok); the live dev DB
  migrated in place with data preserved and dead schema dropped. **Seed parity confirmed too** —
  migrations 009 + 011 already seed the full COA (incl. equity 3000/3200) + GL rules byte-for-byte,
  so no reconciliation migration was needed.
- Possible follow-up found during the work: `inventory.listing_draft_source`, `listing_export_id`,
  `listing_approved_at` look like further Coach/Workshop draft-flow vestiges (present in both
  bootstrap and migrations); left in scope for the periodic schema-health review (not in the audit's
  decided set).

## Date

2026-06-23

**Relates to:** ADR-001 (DB for all app data), ADR-012 (SQLite), ADR-017 (schema), ADR-058 (SQLite
hardening). Establishes the management/health discipline those ADRs assume.

## Context

The database schema is a **critical** part of AiCE. The application was prototyped, built, and
**restructured many times**; across those direction changes the codebase and the database accrued
**many additions and deletions**. That organic history left the schema-management mechanism in an
unhealthy state, surfaced by the 2026-06-23 conformance audit:

- **Two parallel schema sources that have diverged (C14).** The runtime bootstrap
  (`src/lib/sqlite.ts` — `ensureInventorySchema` + `ensureCoreTables`) and the `migrations/` set are
  each missing tables the other has. Neither alone produces the full current schema; they stay in
  sync only by accident of install order (migrate → seed → app boot).
- **A real fresh-environment hazard (C13).** `tax_payments` (an active feature: tax recording + tax
  reports) exists only in `migrations/008` and **not** in the bootstrap; the running app initializes
  via the bootstrap and **runs no migrations at runtime**, so a DB created via the bootstrap path
  lacks the table and tax features crash.
- **Dead schema left by removed features (C2, C12).** `listing_draft_state` column and the
  `listing_exports` / `listing_imports` / `listing_publish_previews` tables survive with zero
  application use (retired with the Coach/Workshop, ADR-085).

At this point in the lifecycle, engineers who **understand the project history** must examine the
structure and procedures that manage the database and keep it healthy.

## Decision

1. **Migrations are the single source of truth for the schema.** The forward-only, versioned
   `migrations/` set is authoritative. There is exactly **one** definition of the current schema.

2. **The application applies migrations; it does not maintain a second schema.** The hand-maintained
   bootstrap (`ensureCoreTables` / `ensureInventorySchema`) is **retired** as a parallel schema
   definition. The app brings a DB to current by **applying pending migrations** (a guarded
   init/startup step or an explicit deploy step) — never by a separate `CREATE TABLE` path that can
   drift. (If a bootstrap convenience is kept, it must be **generated from** migrations, not
   hand-edited.)

3. **Remove the unnecessary.** Dead schema from removed features is dropped via migration (C2, C12,
   and any others found in the review) — consistent with the consistency/no-ambiguity principle
   behind those removals (ADR-085 / audit Theme A).

4. **Re-architect inefficiency and align to industry best practices.** The scoped review covers:
   versioned forward-only migrations with a recorded `schema_migrations` ledger; idempotent,
   transactional application; a single documented path for fresh-install vs upgrade; seed data
   decoupled from schema creation; and the ADR-058 hardening pragmas applied consistently.

5. **Periodic schema-health review.** Schema health is revisited deliberately at lifecycle
   checkpoints (after major feature add/remove cycles), not left to organic drift.

## Consequences

- **Positive:** one authoritative schema; the C13/C14 class of drift and fresh-environment crashes
  is eliminated by construction; dead schema removed; clearer onboarding and deploys.
- **Cost:** a focused engineering effort is required (consolidate/verify migrations, remove the
  parallel bootstrap, add startup migration application, drop dead schema) — not a one-line patch.
  Must be done by someone who understands the project history to avoid dropping something still in
  use. Migration application at startup needs a guard/lock so concurrent app starts don't race.

## Notes

- Resolves audit findings **C13, C14**; folds in dead-schema removal **C2, C12** (Theme A).
- Existing assets to build on: `scripts/migrate.mjs` (idempotent per-statement runner with
  `schema_migrations` ledger) is already close to best practice — the gap is that the **app runtime**
  doesn't use it and a parallel bootstrap exists.
- **`tax_payments` consolidation (history):** `tax_payments` was the seed of the Expenses function
  (ex-"AP Lite"); tax payments are now conceptually "just another expense" and are **partially
  already blended** (`src/lib/tax-payments.ts` reads both `tax_payments` and `business_expenses`).
  The schema review should resolve this to a clean model — **but must preserve the
  compliance-critical CT sales-tax tracking** (outstanding liability, filing periods, on-time
  filing; see audit C22 + ADR-039). Do not drop tax history in the name of consolidation.
