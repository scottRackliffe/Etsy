# No-Developer-Questions Build Checklist

This checklist defines what must exist so a developer can implement and ship without asking clarifying questions.

Use this as a release gate for development readiness.

**Last updated:** 2026-06-09 (full ADR documentation audit — 55 fixes across 40+ files, all ambiguities and gaps resolved)

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
- **Done (2026-05-24):** ADR-018 **Appendix B** — request/response JSON schemas for extension endpoints §12–§28 (search, batch, jobs, backup, merge, CSV import, seed, notes, dashboard, reports 038/039/054/056, `If-Match`/409, etc.).
- **Done:** Core CRUD endpoints §1–§11 documented in ADR-018 main body.
- Remaining: wire **implemented** routes in code to match Appendix B; any net-new endpoint added after this pass must extend ADR-018 + Appendix B before merge. Feature ADRs remain authoritative for field-level business rules when Appendix B references them.

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

- **Done:** Report edge cases finalized in **ADR-013** "Edge cases" section (empty dataset handling, PDF generation failure response, date filter handling). Implemented in `src/lib/reporting.ts` and `src/lib/report-http.ts`.
- **Done:** Per-order document endpoints (invoice, thank-you note) specified in **ADR-036** and cross-referenced in ADR-013 and ADR-018.
- **Done:** Date range picker UI specified in **ADR-036**.

### Data and defaults

- Add explicit DB defaults/constraints in `documents/adr/0017-database-schema.md`.
- Define currency mapping policy.
- Define Shipping Info schema per carrier.

Status snapshot:

- **Done:** ADR-017 §8 canonical DDL (three-table model: `orders` + `order_items`; vendor buys = `purchases`; `other_costs`).
- **Done (2026-05-24):** `documents/database/SCHEMA_RECONCILIATION.md` rewritten — docs are canonical; lists **code gaps** (bootstrap/migrations) rather than treating live SQLite as SSOT.
- **Done (2026-05-25):** migrations 003 + 004 implement `orders.tracking_number`, `activity_log`, `customer_notes`; bootstrap in `sqlite.ts` also updated.
- Remaining: Define currency mapping (country → currency) as a static lookup table or JSON file. For v1, support USD only; multi-currency is display-only on customer records.
- Remaining: Define Shipping Info schema per carrier in `documents/shipping-label-carrier-templates.md` (add JSON schema for each carrier's required/optional fields).

### Listing authoring and AI mode completeness (blocking)

- Implement a manual **winning-listing guided form**.
- Implement the **hybrid portable AI flow** from ADR-023.
- Implement internal **AI connection configuration**.
- Ensure only **approved** drafts can move to publish-to-Etsy flow.

Status snapshot:

- **Done (now superseded by ADR-085, 2026-06-21):** The former three listing modes + approval gate are consolidated into a single listing lifecycle — direct editing + AI Generate (research/price/all fields) + Evaluate Quality, publish gated on `listing_phase = 'listing_ready'`. Portable export/import and approve/reject are retired.
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

## 4) Documentation completion gate (Phase 1 — before build priorities 8–52)

**Principle:** Documentation is canonical; code follows documentation ([ADR-017](adr/0017-database-schema.md), [ADR-018](adr/0018-api-surface-endpoints.md), feature ADRs). Do not trim specs to match bootstrap lag.

Phase 1 is complete only when every box below is checked. Phase 2 ([`DOC_COMPLIANCE_AUDIT.md`](DOC_COMPLIANCE_AUDIT.md)) runs after Phase 1. **Do not start §5 build priorities until both gates pass** and the user signs off.

### 4.1 Meta-docs and rules index

- [x] `documents/database/SCHEMA_RECONCILIATION.md` — rewritten (ADR-017 SSOT; code compliance checklist)
- [x] `documents/development-plan.md` — `orders` + `order_items` terminology
- [x] `documents/implementation-guide.md` — v1 layout (no required side panels)
- [x] `.cursorrules` §2 — ADR-017 summary; “docs king / code converges via migrations”

### 4.2 ADR Decision bodies (legacy `purchase` / `customer_address` language)

- [x] ADR-019, 0004, 0002, 0005, 0015, 0007 Decision sections refreshed
- [x] Phase C bodies: 0003, 0006, 0013, 0020–0022, 0038 (commit `fb37d7c`)

### 4.3 Hub ADRs and API catalog

- [x] ADR-017 §5 narrative aligned with §8 DDL
- [x] ADR-018 Extensions §12–§28 indexed
- [x] ADR-018 Appendix B (JSON schemas for extension endpoints)

### 4.4 Supporting topical docs

- [x] `shipping-label-carrier-templates.md` — `orders` ship-to snapshot
- [x] `design-decisions-implementation.md` — orders model grep pass
- [x] `ui-design.md` — body text aligned to orders model
- [x] ADR-039/054 report params (`from_date`/`to_date`, `format=pdf|csv`)

### 4.5 Fixtures (spec artifacts)

- [x] [`fixtures/sample-data.sql`](../fixtures/sample-data.sql) per ADR-069
- [x] ADR-069 links to fixture (no placeholder paths)

### 4.6 Cross-reference map and verification (items 7–8 of doc pass)

- [x] `.cursorrules` §1b — impacted-by map for ADR-023–069 (2026-05-24)
- [x] Contradiction grep suite (2026-05-24): legacy terms only in schema-mapping tables (`PATCH /api/purchases` → orders in ADR-021; `customer_address`/`inventory_other_cost` in ADR-019/020/022 Notes); `shipped_without_paid_override` on **orders** only; ADR-044 uses `setup.completed` (no `setup_completed`)
- [x] Manual (2026-05-24): `documents/adr/README.md` index lists ADR-001–069 (69 files on disk); priorities 8–52 in §5 cite feature ADRs; `ui-design.md` §338 indexes ADR-038–069 UX; ADR-018 Extensions §12–§28 catalog API routes

### 4.7 Remaining spec-only gaps (documented, not blocking Phase 1 sign-off)

Tracked in **§6** below. Code must not invent behavior for these; use ADR-017/018 defaults until spec is written.

### Phase 1 sign-off

When **§4.1–4.6** are all checked, Phase 1 internal-consistency documentation is complete. **Status (2026-05-24): done.**

### 4.8 Phase 1b — Store-owner functional & modern UI completeness (blocking code)

**Goal:** A developer implementing the app has **no significant questions**; every capability an Etsy vintage/antique store owner would reasonably expect is either **fully specified for v1** or **explicitly excluded** with rationale ([DOC_FUNCTIONAL_UX_COVERAGE_AUDIT.md](DOC_FUNCTIONAL_UX_COVERAGE_AUDIT.md)).

- [x] **ADR-070** — Product scope matrix (v1 / post-v1 / Etsy-only / never) — 2026-05-24
- [x] **ADR-071** — Visual design system (typography, spacing, navigation, badges, transaction-complete) — 2026-05-24
- [x] **ui-design.md** — §1b Global header, §1c Dashboard, §1d List filters, §5.9 Label preview, §5.10 Visual consistency — 2026-05-24
- [x] **ADR-031** — Line items add/remove, PickList, canonical create enums, buyer message — 2026-05-24
- [x] **Vendor sourcing UI** — ADR-030 “Where I bought this” section — 2026-05-24
- [x] **ADR-009** — v1 implementation note at top of Decision — 2026-05-24
- [x] **ADR README + System_Colors + frontend-architecture** — index and cross-refs to ADR-070/071 — 2026-05-24
- [x] **.cursorrules** — canonical table rows for ADR-070, ADR-071 — 2026-05-24
- [x] **Phase 1b review** — walk store-owner journey: acquire → list → sell → ship → report → backup (user sign-off) — 2026-05-24

**Phase 1b sign-off:** **Complete (2026-05-24).** Next: acknowledge [DOC_COMPLIANCE_AUDIT.md](DOC_COMPLIANCE_AUDIT.md), then code per §5 priorities.

---

## 5) Priority Order (updated 2026-05-24)

**Blocked until:** §7 [DOC_COMPLIANCE_AUDIT.md](DOC_COMPLIANCE_AUDIT.md) acknowledged and critical compliance fixes started. Phase 1b sign-off complete 2026-05-24.

1. ~~**Schema reconciliation**~~ ✅ Complete.
2. ~~**Frontend decomposition**~~ ✅ Complete.
3. ~~**Token refresh middleware**~~ ✅ Complete.
4. ~~**Etsy sync full flow**~~ ✅ Complete.
5. ~~**Outstanding panel and context-in-place**~~ ✅ Complete.
6. ~~**Picture storage and thumbnails**~~ ✅ Complete.
7. ~~**Report edge cases**~~ ✅ Complete.
8. ~~**Backup system**~~ ✅ Complete (tar.gz archives, lock retry, pre-restore naming, schedule time/day, full integrity check).
9. ~~**Remaining UI: Config, Tutorial, Shipping labels**~~ ✅ Complete (Config 8 sections, ConfirmDialog for backup/restore/delete, AI key masking, publish defaults UI).
10. ~~**Shipping Info schema and currency mapping**~~ ✅ Complete (currency wired via AppContext `currencyCode`).
11. ~~**Shared component adoption**~~ ✅ Complete (Button, FormField, SelectInput on Reports, Tutorial, Config).
12. ~~**Search, filter, sort, pagination**~~ ✅ Complete.
13. ~~**Inventory detail editing**~~ ✅ Complete (two-panel + 5-slot condition picture grid).
14. ~~**Order detail view**~~ ✅ Complete.
15. ~~**Confirmation dialogs**~~ ✅ Complete (all destructive actions).
16. ~~**Image upload and thumbnail preview**~~ ✅ Complete (10 main + 5 condition slots).
17. ~~**Config completion**~~ ✅ Complete.
18. ~~**Deep-link navigation**~~ ✅ Complete.
19. ~~**Reports date picker and per-order docs**~~ ✅ Complete (date range, presets, per-order invoice/thank-you, four-action post-generation).
20. ~~**Activity log**~~ ✅ Complete (logActivity wired into all CRUD mutations, dashboard feed, entity timeline per ADR-037).
21. ~~**Per-item profit/loss and margin**~~ ✅ Complete (OtherCostsManager, inventory list Margin column, color-coded per ADR-038).
22. ~~**Tax tracking and tax report**~~ ✅ Complete (auto-calc from default_rate, dynamic grand_total, tax report per ADR-039).
23. ~~**Bulk/batch operations**~~ ✅ Complete (multi-select, BatchActionsBar, ConfirmDialog for retire/delete per ADR-040).
24. ~~**Global search**~~ ✅ Complete (Cmd+K modal, search icon, entity icons, error state, recent searches per ADR-041).
25. ~~**Unsaved changes guard and draft recovery**~~ ✅ Complete (guards on global search, recently viewed, outstanding links per ADR-042).
26. ~~**Progress indicators for long operations**~~ ✅ Complete (ProgressModal, job polling per ADR-043).
27. ~~**First-run setup wizard and onboarding**~~ ✅ Complete (step persistence across OAuth, connecting/error states per ADR-044).
28. ~~**Accessibility and keyboard navigation**~~ ✅ Complete (skip link, focus trap, focus-visible, aria on modals/tables/tabs per ADR-045).
29. ~~**Concurrent edit detection**~~ ✅ Complete (If-Match headers, 409 conflict, stale reload per ADR-046).
30. ~~**Bulk CSV import for inventory**~~ ✅ Complete (CSV parser, preview/import API, drag-drop modal per ADR-047).
31. ~~**Duplicate detection on entry**~~ ✅ Complete (fuzzy matching, check-duplicate API, DuplicateWarning per ADR-048).
32. ~~**Keyboard shortcuts**~~ ✅ Complete (Cmd+K search, Cmd+S save, Cmd+N new, Cmd+Z undo, ? help per ADR-049).
33. ~~**Network loss handling and retry queue**~~ ✅ Complete (apiFetch with retry, mutation queue, OfflineBanner per ADR-050).
34. ~~**Notification center**~~ ✅ Complete (localStorage notifications, header dropdown, toast bridge per ADR-051).
35. ~~**Customer purchase history timeline**~~ ✅ Complete (paginated order history, summary bar, deep links per ADR-052).
36. ~~**Customer merge and deduplication**~~ ✅ Complete (two-step merge modal, per-field selection, transactional per ADR-053).
37. ~~**Inventory aging and slow-mover report**~~ ✅ Complete (aging buckets, slow-mover badge, dashboard card per ADR-054).
38. ~~**Print queue for batch printing**~~ ✅ Complete (localStorage queue, combined PDF, header menu per ADR-055).
39. ~~**Export to accounting format**~~ ✅ Complete (journal-style CSV, date filtering per ADR-056).
40. ~~**Scheduled auto-sync from Etsy**~~ ✅ Complete (configurable intervals, client timer, activity log per ADR-057).
41. ~~**SQLite hardening**~~ ✅ Complete (WAL mode, integrity checks, warning banner, busy timeout per ADR-058).
42. ~~**Empty-state calls to action**~~ ✅ Complete (EmptyState with primary/secondary actions per ADR-059).
43. ~~**Contextual help tooltips**~~ ✅ Complete (HelpTooltip on all ADR-specified fields per ADR-060).
44. **Mobile-responsive layout** — Deferred to dedicated sprint (ADR-061).
45. ~~**Inline editing on list views**~~ ✅ Complete (editable DataTable cells, undo integration per ADR-062).
46. ~~**Recently-viewed items**~~ ✅ Complete (context provider, header menu, entity tracking per ADR-063).
47. ~~**Inventory value summary widget**~~ ✅ Complete (dashboard widget with cost/sale/margin per ADR-064).
48. ~~**Customer interaction notes**~~ ✅ Complete (CRUD API, typed notes, color badges per ADR-065).
49. ~~**Repeat customer badge**~~ ✅ Complete (configurable threshold, badge on lists/detail per ADR-066).
50. ~~**Undo/redo**~~ ✅ Complete (UndoRedoContext, stacks, Cmd+Z/Shift+Z per ADR-067).
51. ~~**Listing quality score and SEO hints**~~ ✅ Complete (scoring rubric, tips, sortable column per ADR-068).
52. ~~**Sample/demo data for new users**~~ ✅ Complete (fixture SQL, load/remove, wizard integration per ADR-069).
53. ~~**Listing Coach (guided new listing)**~~ ✅ Complete (ADR-072) — **later removed/absorbed into the unified listing lifecycle (ADR-085, 2026-06-21).**

When all priorities are complete, the build is ready for autonomous implementation without developer clarification loops.

## 6) Remaining specification gaps (non-blocking but needed before ship)

| Gap                                                                              | Where to specify                                       | Priority                                                                   |
| -------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------- |
| ~~Report empty/failure/date behavior~~                                           | ~~ADR-013 addendum~~                                   | **Done** (ADR-013 edge cases section, ADR-036)                             |
| ~~ADR-017 / ADR-018 hub drift (038–069)~~                                        | ADR-017 §8 DDL, ADR-018 Extensions §12–28              | **Done** (2026-05-24 doc pass)                                             |
| ~~ADR-006 report catalog (profit, tax, aging, accounting)~~                      | ADR-006                                                | **Done** (2026-05-24 doc pass)                                             |
| ~~Cross-ADR conflicts (044/069 wizard, 021 ship override, 040/055 print queue)~~ | ADR-044, 021, 040, 037                                 | **Done** (2026-05-24 doc pass)                                             |
| Currency mapping (country → code)                                                | New doc or ADR-017 Notes                               | Low (USD-only for v1)                                                      |
| Shipping Info JSON schema per carrier                                            | `shipping-label-carrier-templates.md`                  | Medium                                                                     |
| Mobile/responsive testing spec                                                   | ADR-061 (+ manual test scenarios)                      | Low                                                                        |
| ~~Bulk operations~~                                                              | ADR-040                                                | **Done**                                                                   |
| ~~Accounting export~~                                                            | ADR-056                                                | **Done**                                                                   |
| ~~Full JSON schemas for extension API endpoints~~                                | ADR-018 Appendix B                                     | **Done** (2026-05-24); §1 core §1–11 + feature ADR field rules remain SSOT |
| Implement code to match Appendix B                                               | `src/app/api/` + ADR-018                               | High (Phase 2 audit)                                                       |
| ~~Schema migrations for `activity_log`, `customer_notes`, `tracking_number`~~    | migrations 003 + 004 + ADR-017                         | **Done** (2026-05-25)                                                      |
| ~~`fixtures/sample-data.sql` for ADR-069~~                                       | [`fixtures/sample-data.sql`](fixtures/sample-data.sql) | **Done** (2026-05-24)                                                      |
| Catalog generator                                                                | EBC roadmap (future)                                   | Future                                                                     |

## 7) Phase 2 — Documentation vs code compliance audit

**Status:** Complete (2026-05-24). See [`DOC_COMPLIANCE_AUDIT.md`](DOC_COMPLIANCE_AUDIT.md) and [`DEEP_AUDIT_2026-05-24.md`](DEEP_AUDIT_2026-05-24.md).

**Summary:** No critical **documentation** contradictions. **5 Critical** and **28 High** **code** gaps vs ADR-017/018 (e.g. `order_status = 'shipped'`, unpaid ship allowed without 400, ~37% ADR-018 routes absent, ADR-070 v1 UI largely unbuilt). Schema gaps for `tracking_number`, `activity_log`, `customer_notes` resolved in migrations 003–004 (2026-05-25).

**Deliverable:** [`documents/DOC_COMPLIANCE_AUDIT.md`](DOC_COMPLIANCE_AUDIT.md) — Spec | Code | Action tables for schema, API, business rules, reports, UI, fixtures.

**Exit criterion:** Met — Critical doc issues none; High code gaps enumerated with ADR links. Implementation scheduling is §5 priorities 8–52.

**Rule:** If spec was wrong, fix the doc first, then re-audit. Do not change ADR-017/018 to match bootstrap lag without an explicit ADR amendment.

**Recommended before bulk UI (priorities 11+):** Critical batch in audit §8 step 1–3 (mark-shipped semantics, order enums, migration 003, `/api/uploads`, seed API).

**Functional & UX coverage (pre-code confidence):** [DOC_FUNCTIONAL_UX_COVERAGE_AUDIT.md](DOC_FUNCTIONAL_UX_COVERAGE_AUDIT.md) — Phase 1b complete (ADR-070/071, ui-design §1b–1d); signed off 2026-05-24.

**Etsy OAuth hold (2026-05-24):** Compliance remediation waves **36+** paused until MyEMS API key is approved. **Listing Coach (priority 53, ADR-072)** is the active build track — see [LISTING_COACH_SCOPE.md](LISTING_COACH_SCOPE.md). Waves **1–35** remain complete on `feature/final-system-completion`.
