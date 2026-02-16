# Test Plan

This plan defines minimum testing needed for implementation without developer clarification loops.

## Scope

- API routes in `documents/adr/0018-api-surface-endpoints.md`
- OAuth/session behavior from `documents/adr/0007-base-system-etsy-oauth-dashboard-receipts.md`
- Etsy sync/import behavior from `documents/adr/0019-etsy-order-sync-import.md`
- Outstanding logic from `documents/adr/0020-outstanding-list-definitions-and-queries.md`
- Validation and delete behavior from `documents/adr/0021-validation-and-business-rules.md` and `documents/adr/0022-referential-integrity-and-delete-behavior.md`

## Test layers

### 1) Unit tests

- Schema/validator tests:
  - required fields, enum checks, date format checks.
- Transformation tests:
  - Etsy receipt mapping into local model shapes.
- Utility tests:
  - pagination calculations (`has_more`, bounds).

### 2) Integration tests (API + DB)

- Auth:
  - unauthenticated route access returns 401 on protected endpoints.
  - OAuth callback state mismatch handling.
- Inventory:
  - create, update, delete conflict behavior (409 where required).
- Customers/addresses:
  - create/update/delete and referential integrity behavior.
- Orders/purchases:
  - order creation with snapshot data.
  - mark-paid endpoint updates all rows in order.
- Sync:
  - idempotent re-run (no duplicate `purchase.etsy_receipt_id`).
  - placeholder inventory creation for unknown Etsy listing ids.
- Reports:
  - pdf/csv generation path returns expected content types and status.
  - empty-result behavior.

### 3) End-to-end/manual scenarios

- Install -> connect Etsy -> fetch shops/receipts.
- Sync Etsy -> verify local records.
- Full sales flow: create order, mark paid, mark shipped, generate report.
- Outstanding panel click-through (context in place).
- Picture import and thumbnail behavior.

## Minimum acceptance criteria

- All critical-path integration tests pass.
- No failing lint/typecheck.
- No unresolved blocking TODO in ADR/API docs for features under test.
- Manual smoke test passes for:
  - OAuth connect/disconnect
  - Etsy sync
  - mark paid/shipped
  - one PDF and one CSV report

## Recommended initial test directory

- `tests/unit/`
- `tests/integration/`
- `tests/e2e/`
- `tests/fixtures/etsy/`

## Required fixtures

- Sample Etsy shop list response
- Sample Etsy receipts response:
  - single-line receipt
  - multi-line receipt
  - receipt with missing optional fields
- Seed DB records for inventory, customers, and purchases

## CI gate suggestion

For merge readiness:

- `npm run lint`
- `npm run type-check`
- `npm test` (unit + integration)
- build verification (`npm run build`)
