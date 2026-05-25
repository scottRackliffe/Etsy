# Documentation vs code compliance audit

**Date:** 2026-05-24  
**Branch reviewed:** `feature/final-system-completion` (post Phase 1 doc gate)  
**Principle:** Documentation is canonical ([ADR-017](adr/0017-database-schema.md), [ADR-018](adr/0018-api-surface-endpoints.md), feature ADRs). **Default action for every gap: implement or fix code to match the doc.** Amend docs only when the spec was wrong.

**Phase 1 documentation:** Complete per [no-developer-questions-build.md](no-developer-questions-build.md) §4.  
**This artifact:** Phase 2 exit deliverable (§7).

---

## Summary

| Severity | Count | Meaning |
|----------|------:|---------|
| **Critical** | 3 | Code contradicts canonical enums or core business rules; reports/data integrity risk |
| **High** | 24 | Missing schema tables/columns, missing API surface (ADR-018 §12–28), or major feature ADRs not wired |
| **Medium** | 12 | Partial implementation (pagination without search/sort, API field names, UI shells) |
| **Low** | 8 | Polish, optional v1 extensions, or doc-only gaps (shipping JSON schema) |

**No critical doc contradictions remain** between ADRs after the 2026-05-24 doc pass. Remaining issues are **code lagging spec**.

**Recommended next step:** Schedule implementation from [no-developer-questions-build.md](no-developer-questions-build.md) §5, starting with Critical + High schema/API/business-rule fixes before priorities 11+ UI work.

---

## 1. Schema (ADR-017 §8)

| Spec | Code location | Status | Action |
|------|---------------|--------|--------|
| `orders` + `order_items` + vendor `purchases` | `src/lib/sqlite.ts` | **Match** | — |
| Order ship-to snapshot, `was_paid`, `shipper`, `seller_shipping_cost`, `etsy_receipt_id`, `shipped_without_paid_override`, totals | `orders` + migration 002 | **Match** | — |
| `customers.default_address_id`, `currency_code`, `is_active` | `customers` | **Match** | — |
| `other_costs` | `other_costs` | **Match** | — |
| `orders.tracking_number` | Not in bootstrap or 002 | **Missing** | Add migration `003_*` + `sqlite.ts` column; wire mark-shipped + PATCH order |
| `activity_log` table + indexes | Not in bootstrap | **Missing** | Add migration + bootstrap; implement ADR-037 writes on mutations |
| `customer_notes` table + indexes | Not in bootstrap | **Missing** | Add migration + bootstrap; implement ADR-065 API |
| `order_status` ∈ `active` \| `void` \| `cancelled` only | `records.markOrderShipped` sets `'shipped'` | **Critical mismatch** | Remove `order_status = 'shipped'`; set `shipping_date`/`shipper` only; keep `order_status = 'active'` (ADR-031, ADR-017) |
| Listing `listing_*` columns on `inventory` | `sqlite.ts` | **Match** | — |
| `etsy_receipts`, `report_artifacts`, listing workflow tables | `sqlite.ts` | **Match** | — |
| WAL mode, busy timeout (ADR-058) | `sqlite.ts` sets `journal_mode = WAL` | **Partial** | Add busy_timeout, integrity check job, settings keys per ADR-058 |

---

## 2. API surface (ADR-018)

### 2.1 Core §1–11 — implemented routes

Present under `src/app/api/`: auth, shop, receipts, sync/etsy, inventory CRUD + listing workflow + pictures, customers, addresses, orders, mark-paid, mark-shipped, purchases (vendor), other-costs, settings/ai, outstanding, reports (9 legacy names), health.

### 2.2 Core gaps

| Endpoint / behavior | Spec | Code | Severity | Action |
|---------------------|------|------|----------|--------|
| `GET /api/uploads/[...path]` | ADR-018 §16, ADR-026/033 | **No route** | **High** | Add App Router catch-all; serve from `uploads/` with path validation |
| `POST /api/orders/[id]/link-customer` | ADR-018 §15, ADR-031 | **No route** | **High** | Add route; update `orders.customer_id` |
| Per-order `GET /api/reports/invoice/[orderId]` | ADR-018 §17, ADR-036 | Only `GET /api/reports/invoice` (aggregate) | **High** | Add path routes or `order_id` query; filter report data to one order |
| `GET /api/reports/thank-you-note/[orderId]` | ADR-036 | Same as invoice | **High** | Same |
| List `search`, `sort_by`, `sort_dir` | ADR-018 §12, ADR-029 | Lists only `limit`/`offset` in `records` | **Medium** | Extend `listInventory`, `listOrders`, `listCustomers` |
| `GET /api/inventory` profitability fields | ADR-018 §26, ADR-038 | Not computed in API | **High** | Add rollup in list/detail handlers |
| `PATCH` with `If-Match` / 409 | ADR-018, ADR-046 | No optimistic locking | **Medium** | Compare `updated_at` on PATCH orders/inventory/customers |
| Mark-shipped body | `{ shipper, tracking_number?, shipping_date?, shipped_without_paid_override? }` | `{ shipper, shipping_date, seller_shipping_cost, force_unpaid }`; no tracking | **High** | Align request/response with Appendix B B3; map override flag name |
| Ship until paid | ADR-021: block unless override | `markOrderShipped` never checks `was_paid` | **Critical** | Return 400 unless paid or `shipped_without_paid_override: true` |
| Create order enums | `order_status: active`, `payment_status: unpaid` | Sales UI sends `open`, `pending` | **Critical** | Validate in API + fix `sales/page.tsx` |
| Vendor `GET/POST /api/purchases` | ADR-017 buy-side | **Match** | — | — |

### 2.3 Extensions §12–28 — missing (not implemented)

| ADR-018 § | Routes | ADR | Severity |
|-----------|--------|-----|----------|
| §18 | `GET /api/activity` | 037 | High |
| §19 | `POST/GET /api/backup`, `DELETE /api/backup/[filename]`, `POST /api/backup/restore` | 027 | High |
| §20 | `GET /api/search?q=` | 041 | High |
| §21 | `POST /api/orders/batch`, `inventory/batch`, `customers/batch` | 040 | High |
| §22 | `GET/DELETE /api/jobs/[job_id]`, `.../stream` | 043 | Medium |
| §24 | `POST /api/inventory/import/preview`, `import`, `GET check-duplicate`, `GET listing-score` | 047, 048, 068 | High |
| §25 | `GET customers/[id]/orders`, `duplicates`, `POST merge`, notes CRUD, `check-duplicate` | 052, 053, 065 | High |
| §27 | `POST/DELETE /api/seed/sample-data` | 069 | High (fixture exists; API missing) |

### 2.4 Reports (ADR-006, ADR-013)

| Report | Spec | Code | Severity | Action |
|--------|------|------|----------|--------|
| Thank you, Invoice, Sales, Costs, Income MTD/YTD, Postal by vendor, Outstanding items, AR aging | ADR-006/013 | `src/app/api/reports/*` + `reporting.ts` | **Match** (9 types) | — |
| Profit by item | ADR-038, ADR-006 | **No route** | High | Add `/api/reports/profit-by-item` + builder |
| Sales tax summary | ADR-039 | **No route** | High | Add `/api/reports/sales-tax-summary` |
| Inventory aging / slow mover | ADR-054 | **No route** | High | Add `/api/reports/inventory-aging` |
| Accounting export | ADR-056 | **No route** | High | Add `/api/reports/accounting-export` |
| Date params `from_date`/`to_date` | ADR-036 | `resolveReportParams` supports them | **Partial** | Ensure all report builders filter by range |
| `format=pdf\|csv` | ADR-013/018 | `resolveReportFormat` | **Match** | — |

---

## 3. Business rules (ADR-021, ADR-019, ADR-023)

| Rule | Spec | Code | Severity | Action |
|------|------|------|----------|--------|
| Mark shipped only when paid or explicit override | ADR-021, 031 | No paid check | **Critical** | See §2.2 mark-shipped |
| Override on **orders** header, not `order_items` | ADR-021 | Column on `orders` | **Match** | — |
| No `order_status = shipped` | ADR-031 | Sets `shipped` | **Critical** | See §1 |
| List on Etsy only if `listing_draft_state = approved` | ADR-023 | Enforced in publish API | **Match** (verify in `publish-to-etsy`) | Spot-check on change |
| Listing generation requires pictures + fields | ADR-023 | `listing-readiness` route | **Match** | — |
| Etsy sync idempotent by receipt_id | ADR-019 | `etsy_receipts` + sync | **Match** | — |
| Void/cancel: status only, no row delete | ADR-022 | Orders use status fields | **Match** | — |
| Token refresh: single in-flight, proactive 5 min | ADR-025 | `auth-session.ts` `refreshPromise` | **Match** | — |

---

## 4. Frontend / UI (ADR-024, 028–035, 009)

| Feature | Spec | Code | Severity | Action |
|---------|------|------|----------|--------|
| App Router tabs (8) | ADR-024, ui-design | `(app)/*/page.tsx` | **Match** | — |
| Master-detail Sales / two-panel Inventory | ADR-031, 030 | Basic list + detail in page components | **Partial** | Full ADR-030/031 field panels not present |
| Shared components wired everywhere | ADR-028 | Components exist; limited use (e.g. Outstanding uses DataTable) | **Medium** | Adopt Button, FormField, Modal, Toast per page |
| `ConfirmDialog` wrapper | ADR-032 | **No component** | High | Add component; wrap deletes |
| `PictureGrid` upload UI | ADR-033 | API picture routes only | High | Build grid; wire to `/api/uploads` |
| Deep-link `?orderId=` etc. | ADR-035 | Outstanding **navigates** with query; target pages **do not read** `useSearchParams` | High | Sales/Inventory/Customers: select + highlight on load |
| Config 8 sections | ADR-034 | AI + partial settings only | High | Backup, shipping info, business profile, sample data, etc. |
| Reports UI: 4 new report types | ADR-006, ui-design §338 | Reports page lists legacy set only | Medium | Add chooser entries when APIs exist |
| Global search, notification bell, print queue | ADR-041, 051, 055 | **Not in header** | High | After APIs / client queue |
| Setup wizard | ADR-044 | **Not implemented** | High | — |
| Mobile responsive | ADR-061 | Desktop-oriented layout | Low | — |

---

## 5. `.cursorrules` §12 “Built vs pending” accuracy

| Claim in §12 | Actual (2026-05-24) | Severity | Action |
|--------------|----------------------|----------|--------|
| Priorities 1–7 complete | Largely true for OAuth, sync, outstanding API, pictures backend, 9 reports, ADR-024 shell | **Mostly accurate** | — |
| “Full CRUD” | Present for core entities | **Match** | — |
| Implied readiness for priorities 8–52 | Most 11–52 APIs/UI absent | **Overclaim** | Treat §5 priorities 8–52 as **not started** except partial pieces (health, WAL, picture APIs) |
| Token refresh ADR-025 | Implemented | **Match** | — |
| Report edge cases ADR-013 | `reporting.ts` / `report-http.ts` | **Match** | — |

**Action:** After each implementation batch, update `.cursorrules` §12 to match this audit (not aspirational).

---

## 6. Fixtures and seed (ADR-069)

| Spec | Code | Status | Action |
|------|------|--------|--------|
| [`fixtures/sample-data.sql`](../fixtures/sample-data.sql) | File committed | **Match** | — |
| `POST/DELETE /api/seed/sample-data` | **No routes** | High | Execute SQL in transaction; idempotent guard per ADR-069 |
| `tracking_number` on SAMPLE-ORD-001 | Commented SQL pending column | Medium | Uncomment after migration |

---

## 7. Doc-only gaps (no code action until spec written)

| Gap | Where | Priority |
|-----|-------|----------|
| Shipping Info JSON schema per carrier | `shipping-label-carrier-templates.md` | Medium |
| Currency mapping table (v1 USD) | ADR-017 Notes | Low |

---

## 8. Suggested implementation order (code catches up to docs)

1. **Critical batch:** Fix `markOrderShipped` (no `shipped` status; enforce paid/override); fix order create validation + Sales UI enums.  
2. **Schema migration 003:** `tracking_number`, `activity_log`, `customer_notes`.  
3. **High API batch:** `/api/uploads`, link-customer, mark-shipped body alignment, per-order reports, seed routes.  
4. **ADR-029:** search/sort on list endpoints.  
5. **New reports + ADR-038 computed fields.**  
6. **ADR-027 backup routes** → Config UI.  
7. **Frontend:** ADR-035 deep-link consumers, ADR-032/033, then remaining §5 priorities 11–52.

---

## 9. Verification method

- File scan: `src/app/api/**`, `src/lib/sqlite.ts`, `migrations/`, `src/app/(app)/**`  
- Grep: extension route names, `order_status`, `tracking_number`, `activity_log`  
- Cross-check: [ADR-018 Extensions §12–28](adr/0018-api-surface-endpoints.md), [SCHEMA_RECONCILIATION.md](database/SCHEMA_RECONCILIATION.md) checklist  

Re-run this audit after each migration/API PR; mark rows **Implemented** in SCHEMA_RECONCILIATION and shrink §2–§4 tables.

---

## 10. Sign-off

| Gate | Status |
|------|--------|
| Phase 1 documentation complete | Yes (§4 all checked) |
| Audit artifact complete | Yes (this file) |
| No Critical **doc** contradictions | Yes |
| No Critical **code** gaps | **No** — 3 Critical code items remain (§1, §2.2, §3) |
| Ready for build priorities 8–52 without guessing | **After Critical + High schema/API fixes** |

User sign-off recommended before large UI build (priorities 11+) so master-detail and list behavior rest on correct APIs and enums.
