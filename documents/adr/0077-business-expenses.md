# ADR-077: Business expenses — general overhead and operating cost tracking

## Status

Accepted

## Date

2026-06-17

## Context

The app tracks inventory purchase costs (`purchases` table) and per-item additional costs (`other_costs` table), but has no way to track general business overhead: software subscriptions, office supplies, platform fees, professional services, insurance, etc. These expenses are critical for accurate financial reporting (Income Statement, Balance Sheet), tax preparation (Schedule C), and understanding true business profitability.

## Decision

### 1. New `business_expenses` table

See ADR-017 §6g for full column spec. Key fields:

- **Core:** `expense_date`, `amount`, `currency_code`, `payment_method`, `vendor_id` (FK to `vendors`)
- **Categorization:** `category`, `subcategory`, `tax_deductible`, `tax_category`, `business_use_pct`
- **Accounting:** `is_cogs` (COGS vs operating expense), `is_asset` (capital asset vs expense), `gl_account`, `fiscal_quarter`
- **Documentation:** `invoice_number`, `receipt_attached`, `receipt_path`
- **Recurring:** `is_recurring`, `recurring_frequency`, `recurring_next_date`, `contract_end_date`
- **Link:** `inventory_id` (optional FK when expense relates to a specific item)

### 2. API endpoints

See ADR-018 §37 for full endpoint spec.

- `GET/POST /api/expenses` — list and create
- `GET/PATCH/DELETE /api/expenses/[id]` — read, update, delete individual
- `GET /api/expenses/categories` — distinct categories and option values (merged with defaults)
- `GET /api/expenses/summary` — aggregated summary by category and month
- `GET /api/expenses/upcoming` — recurring expenses due within 30 days
- `POST /api/expenses/scan` — OCR scan of invoice/receipt photo (OpenAI vision API)

### 3. GL integration

Business expenses map to GL accounts via the `gl_account` field:
- Default: `6200` (Operating Expenses) for regular expenses
- COGS expenses (`is_cogs = 1`): default `5000` (Cost of Goods Sold)
- Custom GL codes override the defaults

A `gl_transaction_rules` entry for `'Business Expense'` handles the double-entry: DR expense account, CR `1000` (Cash).

`computeAccountBalances()` in `reporting.ts` aggregates business expenses by GL account, applying `business_use_pct` for partial deductions.

### 4. Expenses tab (UI)

**Position in tab bar:** After Vendors.

**Route:** `src/app/(app)/expenses/page.tsx`

**Layout:** SEMS (ADR-079) — full-width record list with summary cards at top; the inline editor
replaces the list (Expenses was rolled onto the SEMS scaffold in WS-E4).

- **Summary cards:** Total expenses, tax-deductible total, top category, recurring count
- **List panel:** Filterable/sortable/paginated table with inline category and amount display
- **Create form:** Minimal inline form with "Scan invoice" OCR button
- **Detail panel:** Grouped sections — Core, Categorization, Documentation, Recurring, Accounting
- **Vendor field:** Uses `VendorPicker` component (ADR-076 §6) with OCR hint support

### 5. Financial report impact

- **Income Statement (P&L):** Business expenses appear in Operating Expenses section (or COGS when `is_cogs = 1`)
- **Balance Sheet:** Expense transactions reduce Cash; COGS expenses reduce inventory value
- **Accounting Export:** Business expenses included as journal entries via `buildAccountingExportRows()`

## Consequences

- **Positive:** Complete picture of business costs beyond inventory. Accurate P&L and tax reporting. OCR scanning reduces manual data entry. Recurring expense tracking prevents missed payments. GL integration ensures consistent financial reporting.
- **Negative:** Adds complexity to the financial reporting pipeline. OCR accuracy depends on receipt/invoice quality.

## Notes

- Cross-references: ADR-017 (schema §6g), ADR-018 (API §37), ADR-039 (tax tracking — tax_deductible field), ADR-056 (accounting export — GL integration), ADR-076 (vendors — VendorPicker for expense vendor)
- Migration: `migrations/011_business_expenses.sql`
- Default expense categories: Shipping & postage, Platform fees, Software & subscriptions, Office supplies, Professional services, Advertising & marketing, Photography / equipment, Packaging materials, Returns & refunds
