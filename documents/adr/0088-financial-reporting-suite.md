# ADR-088: Financial reporting suite — GL-based statements + receivables & vendor profitability

## Status

Accepted

_Documents reports already implemented in `src/lib/reporting.ts` that had no functional ADR
(audit C20). Content is derived from the code as of 2026-06-23; no behavior is changed by this ADR._

## Date

2026-06-23

**Relates to:** ADR-006 (reports scope), ADR-013 (report output: PDF/CSV), ADR-009/077 (chart of
accounts, GL rules, business expenses — the accounting substrate), ADR-018 (API surface),
ADR-038/039/054/056 (other reports). Builds on the double-entry chart-of-accounts subsystem.

## Context

Beyond the operational reports (sales, costs, invoice, thank-you, profit-by-item, inventory-aging,
sales-tax-summary, outstanding-items, accounting-export), the codebase grew a **financial-reporting
suite** during the accounting/AP-lite enhancement. Four of these reports had **no functional ADR** —
only an API-surface line, or none at all (vendor-profitability) — which the 2026-06-23 conformance
audit flagged (C20, and C17 for the missing ADR-018 entry). This ADR records their **actual scope**
so it is unambiguous and ADR-owned.

All four are built by `buildReport(name, params)` in `src/lib/reporting.ts`, exposed at
`GET /api/reports/<name>` (generate) and `POST` (generate + persist a `report_artifacts` row), and
rendered as **JSON / CSV / PDF** via the shared `report-http` layer (ADR-013).

## Decision

The financial reporting suite consists of these four reports, with the scope below.

1. **Balance Sheet** — `/api/reports/balance-sheet` (`buildBalanceSheetReport`).
   GL-based statement of financial position **as of** a date (`as_of` / `to_date`, default today).
   Reads account balances via `computeAccountBalances(asOf)` over the chart of accounts and groups by
   `account_type`: **Assets**, **Liabilities**, **Equity**. Equity includes a **Current Period Net
   Income** line (`computeNetIncome`). Metrics: `total_assets`, `total_liabilities`, `total_equity`,
   `total_liabilities_and_equity`.

2. **Income Statement (P&L)** — `/api/reports/income-statement` (`buildIncomeStatementReport`).
   GL-based profit & loss over a date range (`from_date`/`to_date`). Computation:
   **Net Revenue** = Revenue − Contra-Revenue; **Gross Profit** = Net Revenue − COGS;
   **Net Income** = Gross Profit − Operating Expenses. Sections: Revenue (with contra), COGS, Gross
   Profit, Expenses, Net Income. Metrics include each subtotal.

3. **A/R Aging** — `/api/reports/ar-aging` (`buildArAgingReport`).
   Unpaid **active** orders (`order_status='active' AND (was_paid=0 OR NULL)`) aged by
   `days_outstanding` (now − order_date) into buckets **0–30 / 31–60 / 61–90 / over-90 days**. Per
   row: order number, customer, order date, amount (grand_total), `total_cost` (item purchase +
   shipping + per-item other_costs + seller shipping), days outstanding. Metrics: `unpaid_order_count`,
   the four buckets, `total_unpaid`, `total_cost_at_risk`. (No date params — always "as of now.")

4. **Vendor Profitability** — `/api/reports/vendor-profitability` (`buildVendorProfitabilityReport`).
   Per-vendor profitability over a date range (`from_date`/`to_date`): items sold sourced from each
   vendor with revenue, cost, and profit, plus grand totals. Summary reports vendor and item counts.

**Output:** all four support JSON, CSV, and PDF (per ADR-013) and may be persisted as report
artifacts via `POST`.

## Consequences

- **Positive:** the financial suite is now ADR-owned and unambiguous; the balance sheet and income
  statement are true GL/double-entry statements (consistent with the chart-of-accounts subsystem),
  giving the owner real financial visibility for tax prep (Schedule C) and profitability.
- **Dependencies:** the GL reports are only as correct as the chart of accounts + GL transaction
  rules that feed `computeAccountBalances`; account mappings (ADR-009/077) must stay accurate.
- **Note:** ADR-006 remains the top-level reports-scope index; this ADR is the detailed spec for the
  financial-suite subset. The removed income-MTD/YTD/postal reports (ADR-036) are not part of it.
