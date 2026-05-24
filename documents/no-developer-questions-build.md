# No-Developer-Questions Build Checklist

This checklist defines what must exist so a developer can implement and ship without asking clarifying questions.

Use this as a release gate for development readiness.

**Last updated:** 2026-05-24

---

## 1) Specification Gaps To Close (blocking)

### API contracts

- Define full request/response schemas for all endpoints in `documents/adr/0018-api-surface-endpoints.md`.
- Standardize error format and status-code matrix (400/401/404/409/429/500/503) for all APIs.
- Define PATCH semantics: omitted vs `null` vs empty string.
- Define pagination response shape (`items`, `limit`, `offset`, `total`, `has_more`) for list endpoints.
- Define idempotency behavior for POST endpoints (`inventory`, `orders`, `customers`, `sync`).

Status snapshot:

- **Done:** standardized global error model and actionable API error payloads.
- **Done:** pagination/PATCH/idempotency baseline documented in ADR-018.
- Remaining: complete concrete schemas/examples for every remaining endpoint not yet implemented.

### OAuth and Etsy sync behavior

- Finalize token-refresh flow:
  - single in-flight behavior,
  - retry limits,
  - timeout behavior,
  - revoked refresh-token behavior.

- Finalize Etsy sync edge cases:
  - matching rules for `etsy_listing_id`,
  - placeholder inventory field defaults,
  - update policy for already-synced receipts,
  - partial-failure handling.

Status snapshot:

- **Done:** Token refresh fully specified in **ADR-025** (single in-flight, retry limits, timeout, revoked token, temporary failure, logging, startup behavior).
- **Done:** Etsy sync edge cases finalized in **ADR-019** (matching rules, placeholder defaults, update policy, partial-failure handling, concurrent sync protection, pagination during sync, duplicate buyer handling).

### Outstanding list and caching

- Finalize fetch/caching details:
  - exact receipt fetch depth,
  - cache invalidation triggers,
  - 429/timeout fallback UX,
  - sort-field definitions and null sorting.

Status snapshot:

- **Done:** Outstanding caching and sort fully specified in **ADR-020** (fetch depth 200, cache invalidation triggers, 429/timeout fallback UX, sort-field definitions with source/type, null sorting rules).

### Files, pictures, and storage

- Finalize picture import/storage rules:
  - canonical storage path layout,
  - filename strategy and collision handling,
  - upload/import limits (type, size, count),
  - failure/rollback behavior for partial import.
- Finalize thumbnail generation specification (size, crop/fit rule, format/quality, regeneration triggers).

Status snapshot:

- **Done:** Picture storage and thumbnail fully specified in **ADR-026** (storage path layout, filename strategy, collision handling, file type/size/dimension limits, import atomicity and rollback, thumbnail spec with size/fit/format/quality/triggers, reorder behavior, removal behavior, bulk import, disk cleanup).

### Reports and output behavior

- Finalize report failure behavior in `documents/adr/0013-report-output-pdf.md`:
  - empty dataset handling,
  - PDF generation failure response,
  - date/timezone handling for report date filters.

Status snapshot:

- Remaining: report edge cases not yet finalized. **Action:** Add a section to ADR-013 specifying: (1) empty dataset → generate PDF with "No data found for the selected criteria" message; (2) PDF generation failure → return 500 with `user_message`: "Report generation failed. Please try again."; (3) dates → all date filters use UTC dates (YYYY-MM-DD); the UI converts display dates to/from the user's `date_format` preference.

### Data and defaults

- Add explicit DB defaults/constraints in `documents/adr/0017-database-schema.md`.
- Define currency mapping policy.
- Define Shipping Info schema per carrier.

Status snapshot:

- **Done:** Schema reconciliation documented in `documents/database/SCHEMA_RECONCILIATION.md` identifying all drift between ADR-017 and implementation, with migration plan.
- Remaining: Execute the schema reconciliation migration; update ADR-017 canonical DDL to match the three-table model.
- Remaining: Define currency mapping (country → currency) as a static lookup table or JSON file. For v1, support USD only; multi-currency is display-only on customer records.
- Remaining: Define Shipping Info schema per carrier in `documents/shipping-label-carrier-templates.md` (add JSON schema for each carrier's required/optional fields).

### Listing authoring and AI mode completeness (blocking)

- Implement a manual **winning-listing guided form**.
- Implement the **hybrid portable AI flow** from ADR-023.
- Implement internal **AI connection configuration**.
- Ensure only **approved** drafts can move to publish-to-Etsy flow.

Status snapshot:

- **Done:** All three listing modes implemented in backend (manual form fields, integrated AI generation, portable export/import). Approval gate enforced in API.
- **Done:** AI connection settings API with masked values and connection test.
- **Done:** Listing authoring task cards documented in `documents/listing-authoring-task-cards.md`.
- Remaining: Frontend component for the manual guided form (UI task cards in listing-authoring-task-cards.md §1.1).

### Frontend architecture (NEW — blocking)

- Decompose monolithic `page.tsx` (~3,000 lines) into component architecture with routing.
- Define component tree, props, and state management patterns.

Status snapshot:

- **Done:** Frontend component architecture specified in **ADR-024** (routing structure, app shell layout, component hierarchy, state management, file organization, migration strategy).
- **Done:** Complete component catalog and build guide in `documents/frontend-architecture.md`.
- **Done:** Client-side state management patterns in `documents/state-management.md`.

### Backup and restore (NEW)

- Define automated backup specification.

Status snapshot:

- **Done:** Backup and restore fully specified in **ADR-027** (format, schedule, rolling FIFO retention, API endpoints, restore flow with safety net, error handling, Config UI).

## 2) Build/Run/Test Artifacts Missing

### Local development

Status snapshot:

- **Done:** `DEVELOPMENT.md`, `ENV_MATRIX.md`, environment templates all created.

### Testing

Status snapshot:

- **Done:** `TEST_PLAN.md`, `MANUAL_TEST_SCENARIOS.md`, test directories, baseline node test harness, starter fixtures.

### Database operations

Status snapshot:

- **Done:** Formal migration/seed system artifacts.
- **New:** Schema reconciliation migration needed (`documents/database/SCHEMA_RECONCILIATION.md`).

### CI/CD and quality gates

Status snapshot:

- **Done:** CI workflows and quality gates.

### Release and operations

Status snapshot:

- **Done:** Release/ops runbooks, health endpoint, structured logging.

## 3) Definition Of Done (DoD) For "No Questions"

A phase is complete only when all are true:

- Spec is complete enough that endpoint/model behavior has no TBD or ambiguous language.
- Automated tests exist for happy path + edge cases + failure cases.
- Manual acceptance script exists and passes.
- Build, lint, typecheck, and tests pass in CI.
- Runbook exists for deploy, rollback, and recovery.
- Operational visibility exists for errors and degraded Etsy dependency behavior.

## 4) Priority Order (updated 2026-05-24)

1. **Schema reconciliation** — Execute migration to align DB with ADR-017; update ADR-017 canonical DDL. (`documents/database/SCHEMA_RECONCILIATION.md`)
2. **Frontend decomposition** — Break `page.tsx` into components per ADR-024 and `documents/frontend-architecture.md`.
3. **Token refresh middleware** — Implement per ADR-025.
4. **Etsy sync full flow** — Implement per finalized ADR-019 (receipt → customer + address + order + order_items).
5. **Outstanding panel and context-in-place** — Implement per finalized ADR-020.
6. **Picture storage and thumbnails** — Implement per ADR-026.
7. **Report edge cases** — Finalize ADR-013 empty/failure/date behavior and implement.
8. **Backup system** — Implement per ADR-027.
9. **Remaining UI: Config, Tutorial, Shipping labels** — Complete per ui-design.md.
10. **Shipping Info schema and currency mapping** — Define and implement.

When all priorities are complete, the build is ready for autonomous implementation without developer clarification loops.

## 5) Remaining specification gaps (non-blocking but needed before ship)

| Gap | Where to specify | Priority |
|-----|-----------------|----------|
| Report empty/failure/date behavior | ADR-013 addendum | Medium |
| Currency mapping (country → code) | New doc or ADR-017 Notes | Low (USD-only for v1) |
| Shipping Info JSON schema per carrier | `shipping-label-carrier-templates.md` | Medium |
| Mobile/responsive breakpoint behavior | `frontend-architecture.md` §7 (done, but needs testing spec) | Low |
| Bulk operations (bulk mark-shipped, bulk list) | New ADR or ui-design addendum | Low (post-v1) |
| Accounting/QuickBooks export | EBC roadmap (future) | Future |
| Catalog generator | EBC roadmap (future) | Future |
