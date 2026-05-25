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
- Remaining (code, not doc): migrations/bootstrap for `orders.tracking_number`, `activity_log`, `customer_notes`, and any other ADR-017 §8 columns missing from `src/lib/sqlite.ts` (tracked in §6 and Phase 2 compliance audit).
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

- [ ] `.cursorrules` §1b — full impacted-by map for ADR-028–069
- [ ] Contradiction grep suite (Decision sections: no live `PATCH /api/purchases`, `customer_address` table, `inventory_other_cost` as table name; no `order_items.shipped_without_paid_override`; `setup.completed` not `setup_completed` in ADR-044)
- [ ] Manual: `documents/adr/README.md` lists all 69 ADRs; each §5 priority 8–52 has ADR + ui-design/018 cross-ref

### 4.7 Remaining spec-only gaps (documented, not blocking Phase 1 sign-off)

Tracked in **§6** below. Code must not invent behavior for these; use ADR-017/018 defaults until spec is written.

### Phase 1 sign-off

When **§4.1–4.5** are checked and **§4.6** is checked, Phase 1 documentation is complete. Proceed to Phase 2 compliance audit.

---

## 5) Priority Order (updated 2026-05-24)

**Blocked until:** §4 Documentation completion gate (all checkboxes) + §7 Phase 2 compliance audit sign-off.

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

11. **Shared component adoption** — Wire DataTable, Button, FormField, Modal, Toast, EmptyState into all pages per ADR-028.
12. **Search, filter, sort, pagination** — Add to all list views per ADR-029.
13. **Inventory detail editing** — Core field management UI per ADR-030.
14. **Order detail view** — Full order detail panel per ADR-031.
15. **Confirmation dialogs** — All destructive actions per ADR-032.
16. **Image upload and thumbnail preview** — Visual upload grid per ADR-033.
17. **Config completion** — Business profile, shipping, display prefs per ADR-034.
18. **Deep-link navigation** — Outstanding click-through selects record per ADR-035.
19. **Reports date picker and per-order docs** — Date range controls and single-order invoice/thank-you per ADR-036.
20. **Activity log** — Persistent audit trail per ADR-037.
21. **Per-item profit/loss and margin** — Cost/revenue rollup and margin display per ADR-038.
22. **Tax tracking and tax report** — Tax fields and report per ADR-039.
23. **Bulk/batch operations** — Multi-select and batch actions per ADR-040.
24. **Global search** — Cmd/Ctrl+K cross-entity search per ADR-041.
25. **Unsaved changes guard and draft recovery** — Navigation guard and local draft recovery per ADR-042.
26. **Progress indicators for long operations** — Determinate/indeterminate progress per ADR-043.
27. **First-run setup wizard and onboarding** — Initial setup flow per ADR-044.
28. **Accessibility and keyboard navigation** — WCAG 2.1 AA baseline per ADR-045.
29. **Concurrent edit detection** — Optimistic locking via `updated_at` per ADR-046.
30. **Bulk CSV import for inventory** — CSV import modal and validation per ADR-047.
31. **Duplicate detection on entry** — Fuzzy-match warnings on create per ADR-048.
32. **Keyboard shortcuts** — Global and page-specific shortcuts per ADR-049.
33. **Network loss handling and retry queue** — Offline mutation queue per ADR-050.
34. **Notification center** — Persistent event log UI per ADR-051.
35. **Customer purchase history timeline** — Order timeline on customer detail per ADR-052.
36. **Customer merge and deduplication** — Merge tool for duplicate customers per ADR-053.
37. **Inventory aging and slow-mover report** — Aging report per ADR-054.
38. **Print queue for batch printing** — Batch print queue per ADR-055.
39. **Export to accounting format** — Accounting CSV export per ADR-056.
40. **Scheduled auto-sync from Etsy** — Configurable sync schedule per ADR-057.
41. **SQLite hardening** — WAL mode, busy timeout, integrity checks per ADR-058.
42. **Empty-state calls to action** — Actionable empty states per ADR-059.
43. **Contextual help tooltips** — Field-level help text per ADR-060.
44. **Mobile-responsive layout** — Breakpoints and stacked layouts per ADR-061.
45. **Inline editing on list views** — In-cell edit on DataTable per ADR-062.
46. **Recently-viewed items** — Recent-items list per ADR-063.
47. **Inventory value summary widget** — Dashboard inventory value card per ADR-064.
48. **Customer interaction notes** — Per-customer notes log per ADR-065.
49. **Repeat customer badge** — Repeat-buyer badge on lists per ADR-066.
50. **Undo/redo** — Last N operation undo stack per ADR-067.
51. **Listing quality score and SEO hints** — Listing score widget per ADR-068.
52. **Sample/demo data for new users** — Optional demo seed per ADR-069.

When all priorities are complete, the build is ready for autonomous implementation without developer clarification loops.

## 6) Remaining specification gaps (non-blocking but needed before ship)

| Gap | Where to specify | Priority |
|-----|-----------------|----------|
| ~~Report empty/failure/date behavior~~ | ~~ADR-013 addendum~~ | **Done** (ADR-013 edge cases section, ADR-036) |
| ~~ADR-017 / ADR-018 hub drift (038–069)~~ | ADR-017 §8 DDL, ADR-018 Extensions §12–28 | **Done** (2026-05-24 doc pass) |
| ~~ADR-006 report catalog (profit, tax, aging, accounting)~~ | ADR-006 | **Done** (2026-05-24 doc pass) |
| ~~Cross-ADR conflicts (044/069 wizard, 021 ship override, 040/055 print queue)~~ | ADR-044, 021, 040, 037 | **Done** (2026-05-24 doc pass) |
| Currency mapping (country → code) | New doc or ADR-017 Notes | Low (USD-only for v1) |
| Shipping Info JSON schema per carrier | `shipping-label-carrier-templates.md` | Medium |
| Mobile/responsive testing spec | ADR-061 (+ manual test scenarios) | Low |
| ~~Bulk operations~~ | ADR-040 | **Done** |
| ~~Accounting export~~ | ADR-056 | **Done** |
| ~~Full JSON schemas for extension API endpoints~~ | ADR-018 Appendix B | **Done** (2026-05-24); §1 core §1–11 + feature ADR field rules remain SSOT |
| Implement code to match Appendix B | `src/app/api/` + ADR-018 | High (Phase 2 audit) |
| Schema migrations for `activity_log`, `customer_notes`, `tracking_number` | migrations + ADR-017 | Medium (DDL canonical; bootstrap may lag) |
| ~~`fixtures/sample-data.sql` for ADR-069~~ | [`fixtures/sample-data.sql`](fixtures/sample-data.sql) | **Done** (2026-05-24) |
| Catalog generator | EBC roadmap (future) | Future |

## 7) Phase 2 — Documentation vs code compliance audit

**Status:** Not started.

**Deliverable:** [`documents/DOC_COMPLIANCE_AUDIT.md`](DOC_COMPLIANCE_AUDIT.md) — for each area (schema, API routes, business rules, reports, `.cursorrules` “built” claims): **Spec (ADR/doc)** | **Code (`src/`, migrations)** | **Action** (code must match doc by default).

**Exit criterion:** No **Critical** doc contradictions; all **High** code gaps enumerated with ADR links. Implementation scheduling is §5 priorities 8–52, not during the audit pass.

**Rule:** If spec was wrong, fix the doc first, then re-audit. Do not change ADR-017/018 to match bootstrap lag without an explicit ADR amendment.
