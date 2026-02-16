# No-Developer-Questions Build Checklist

This checklist defines what must exist so a developer can implement and ship without asking clarifying questions.

Use this as a release gate for development readiness.

## 1) Specification Gaps To Close (blocking)

### API contracts

- Define full request/response schemas for all endpoints in `documents/adr/0018-api-surface-endpoints.md`.
- Standardize error format and status-code matrix (400/401/404/409/429/500/503) for all APIs.
- Define PATCH semantics: omitted vs `null` vs empty string.
- Define pagination response shape (`items`, `limit`, `offset`, `total`, `has_more`) for list endpoints.
- Define idempotency behavior for POST endpoints (`inventory`, `orders`, `customers`, `sync`).

Status snapshot:

- Done: standardized global error model and actionable API error payloads.
- Done: pagination/PATCH/idempotency baseline documented in ADR-018.
- Remaining: complete concrete schemas/examples for every remaining endpoint not yet implemented.

### OAuth and Etsy sync behavior

- Finalize token-refresh flow in `documents/adr/0007-base-system-etsy-oauth-dashboard-receipts.md`:
  - single in-flight behavior,
  - retry limits,
  - timeout behavior,
  - revoked refresh-token behavior.
- Finalize Etsy sync edge cases in `documents/adr/0019-etsy-order-sync-import.md`:
  - matching rules for `etsy_listing_id`,
  - placeholder inventory field defaults,
  - update policy for already-synced receipts,
  - partial-failure handling.

### Outstanding list and caching

- Finalize fetch/caching details in `documents/adr/0020-outstanding-list-definitions-and-queries.md`:
  - exact receipt fetch depth,
  - cache invalidation triggers,
  - 429/timeout fallback UX,
  - sort-field definitions and null sorting.

### Files, pictures, and storage

- Finalize picture import/storage rules in `documents/adr/0010-inventory-picture-import-process.md`:
  - canonical storage path layout,
  - filename strategy and collision handling,
  - upload/import limits (type, size, count),
  - failure/rollback behavior for partial import.
- Finalize thumbnail generation specification (size, crop/fit rule, format/quality, regeneration triggers).

### Reports and output behavior

- Finalize report failure behavior in `documents/adr/0013-report-output-pdf.md`:
  - empty dataset handling,
  - PDF generation failure response,
  - date/timezone handling for report date filters.

### Data and defaults

- Add explicit DB defaults/constraints in `documents/adr/0017-database-schema.md`:
  - `was_paid`, `is_active`, `order_status`, `quantity`, `panel_layout`,
  - settings defaults and required keys.
- Define currency mapping policy (country -> currency, fallback behavior, update policy).
- Define Shipping Info schema per carrier (required/optional fields and validation rules).

### Listing authoring and AI mode completeness (blocking)

- Implement a manual **winning-listing guided form** with all recommended sections (quality checklist + structured listing sections), so users can complete listings without AI.
- Implement the **hybrid portable AI flow** from ADR-023:
  - export listing package + pictures + instructions,
  - import generated draft package,
  - validate schema/version/item identity before draft acceptance.
- Implement internal **AI connection configuration** and required data model:
  - provider selection and model,
  - auth fields (API key/token and/or endpoint config as required by provider),
  - safe connectivity test and actionable validation errors,
  - retry/timeout/token-budget controls.
- Ensure only **approved** drafts can move to publish-to-Etsy flow.

Execution detail source:

- `documents/listing-authoring-task-cards.md` (concrete endpoint/UI/data/test task cards).

## 2) Build/Run/Test Artifacts Missing

### Local development

- `documents/setup/DEVELOPMENT.md` (developer bootstrap and workflow).
- `documents/setup/ENV_MATRIX.md` (dev/staging/prod variable matrix, defaults, required flags).
- Environment templates:
  - `.env.development.example`
  - `.env.staging.example`
  - `.env.production.example`

Status snapshot:

- Done: all items above created.

### Testing

- `documents/testing/TEST_PLAN.md` (unit/integration/e2e coverage and gate criteria).
- `documents/testing/MANUAL_TEST_SCENARIOS.md` (phase-based acceptance scripts).
- Test harness/config and directories:
  - `tests/unit`, `tests/integration`, `tests/e2e`, `tests/fixtures`
  - test runner config (Jest/Vitest)
  - setup/teardown helpers

Status snapshot:

- Done: `TEST_PLAN.md`.
- Done: `MANUAL_TEST_SCENARIOS.md`, test directories, baseline node test harness, and starter fixtures.

### Database operations

- Migration system artifacts:
  - `migrations/` folder
  - migration runner script
  - migration policy doc (`documents/database/MIGRATIONS.md`)
- Seed artifacts:
  - seed runner script
  - seed fixtures
  - seed usage doc

Status snapshot:

- Done: formal migration/seed system artifacts (`migrations/`, runner scripts, seed fixtures, migration doc).

### CI/CD and quality gates

- CI workflow for lint, typecheck, tests, and build verification.
- Formatting config and checks (Prettier config + check script).
- `documents/ci/CI_EXPECTATIONS.md` (required checks and merge gates).

Status snapshot:

- Done: CI workflows and quality gates (`ci.yml`, `test.yml`, Prettier config, scripts, and CI expectations doc).

### Release and operations

- `documents/release/RELEASE_PROCESS.md`
- `documents/release/DEPLOYMENT.md`
- `documents/operations/ROLLBACK.md`
- `documents/operations/BACKUP.md`
- `documents/operations/OBSERVABILITY.md`
- Health-check endpoint and logging policy.

Status snapshot:

- Done: release/ops runbooks, `GET /api/health`, and structured logging helper baseline.

## 3) Definition Of Done (DoD) For "No Questions"

A phase is complete only when all are true:

- Spec is complete enough that endpoint/model behavior has no TBD or ambiguous language.
- Automated tests exist for happy path + edge cases + failure cases.
- Manual acceptance script exists and passes.
- Build, lint, typecheck, and tests pass in CI.
- Runbook exists for deploy, rollback, and recovery.
- Operational visibility exists for errors and degraded Etsy dependency behavior.

## 4) Priority Order

1. API contract completeness (`ADR-018` + error model + pagination + PATCH semantics).
2. OAuth/sync determinism (`ADR-007`, `ADR-019`, `ADR-020`).
3. DB defaults and migration system (`ADR-017` + migrations/seed tooling).
4. Report and picture import edge-case behavior (`ADR-013`, `ADR-010`).
5. CI/test/release/operations documentation and scripts.
6. Listing authoring completeness (guided manual form + hybrid export/import + integrated AI connection settings per ADR-023).

When all priorities are complete, the build is ready for autonomous implementation without developer clarification loops.
