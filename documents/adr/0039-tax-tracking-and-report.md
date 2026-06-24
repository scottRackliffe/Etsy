# ADR-039: Tax tracking and tax report

## Status

Accepted

## Date

2026-05-24

## Context

The `orders` table already has a `tax_total` column, but there is no tax report, no default tax rate configuration, and no tax-period summary. A business owner needs consolidated tax data for state/local tax compliance and end-of-year filing. Without a tax report, the seller must manually extract tax data from individual orders, which is time-consuming and error-prone.

## Decision

### 1. Canonical tax field

`orders.tax_total` is the single source of truth for tax collected on an order. No new database columns are added. The field stores the absolute dollar amount of tax collected (not a rate).

- Data type: `REAL` (already exists in the `orders` table)
- Default: `0` for tax-exempt orders
- No separate "tax exempt" flag is needed — `tax_total = 0` means no tax was collected

### 2. Default tax rate configuration

A new setting key is added to the `settings` table:

| Key                | Example value | Description                                                                                   |
| ------------------ | ------------- | --------------------------------------------------------------------------------------------- |
| `tax.default_rate` | `8.25`        | Default tax rate as a percentage (8.25 = 8.25%); `NULL` or absent = no auto-calculation       |

> **Reconciliation note (2026-06-09):** The tax rate is stored as a percentage number (e.g., `8.25` for 8.25%), NOT as a decimal fraction (`0.0825`). Auto-calculation formula: `tax_total = subtotal × (rate / 100)`. This matches the Config UI in ADR-034 §2b which presents a percentage input.

**Behavior on manual order creation:**

- When `tax.default_rate` is set and the user creates a manual order (`source_channel = 'manual'`), the system auto-populates `tax_total = subtotal * (tax.default_rate / 100)` rounded to 2 decimal places
- The auto-populated value is shown in the order form and the user can override it before saving
- If `tax.default_rate` is not set, `tax_total` defaults to `0` and the user must enter it manually if applicable
- Auto-population happens client-side when `subtotal` changes; the server does NOT enforce the rate

**Behavior on Etsy sync:**

- `tax_total` is populated from the Etsy receipt's `total_tax_cost` field (converted from Etsy's cent-based integer to dollars: `total_tax_cost / 100`)
- The default tax rate setting is NOT applied to synced orders — the Etsy-provided value is always used
- If the Etsy receipt has no `total_tax_cost` or it is `0`, `tax_total` is stored as `0`

**Config UI (ADR-034):**

- Add a "Tax Settings" field in the Settings page under a "Tax" subsection (or within the existing "Business" section)
- Input: percentage field with label "Default Sales Tax Rate" — user enters `8.25` for 8.25%, stored as `8.25` (percentage number)
- Input step: `0.01`
- Helper text: "Enter as percentage, e.g. 8.25 for 8.25%. Applied automatically to new manual orders. Etsy orders use the tax amount from Etsy."

### 3. Sales Tax Summary report

A new report type added to the reports system.

**Report name:** "Sales Tax Summary"

**API endpoint:**

- `GET /api/reports/sales-tax-summary?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD&format=pdf` → PDF
- `GET /api/reports/sales-tax-summary?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD&format=csv` → CSV
- **Date params (ADR-018 §6):** Canonical `from_date` / `to_date`. Aliases `start_date` / `end_date` accepted and normalized server-side.
- Default date range: current calendar year if no dates provided

**Data filter:** Only orders with `order_status = 'active'` are included (void and cancelled orders are excluded per ADR-013 global rule).

**Report layout — grouped by month:**

| Column         | Source / Formula                                                                           |
| -------------- | ------------------------------------------------------------------------------------------ |
| Month          | Formatted as "January 2026" (from `orders.order_date`)                                     |
| Order Count    | `COUNT(*)` of orders in that month                                                         |
| Gross Sales    | `SUM(subtotal)` for orders in that month                                                   |
| Taxable Sales  | `SUM(subtotal) WHERE tax_total > 0` (orders that had tax collected)                        |
| Tax Collected  | `SUM(tax_total)` for orders in that month                                                  |
| Effective Rate | `(Tax Collected / Taxable Sales) * 100`, displayed as percentage; "—" if Taxable Sales = 0 |

**Totals row at bottom:**

- Sum of Order Count, Gross Sales, Taxable Sales, Tax Collected
- Weighted average Effective Rate: `(Total Tax Collected / Total Taxable Sales) * 100`

**Sort order:** Chronological (earliest month first)

**Empty data:** "No orders found for the selected date range."

**PDF format:** Follows the ADR-013 report layout (brand layout: Crimson Text headings + Raleway body, brand banner, cream alternating rows).

### 4. SQL query pattern

```sql
SELECT
  strftime('%Y-%m', o.order_date) AS month_key,
  strftime('%m', o.order_date) AS month_num,
  COUNT(*) AS order_count,
  SUM(o.subtotal) AS gross_sales,
  SUM(CASE WHEN o.tax_total > 0 THEN o.subtotal ELSE 0 END) AS taxable_sales,
  SUM(o.tax_total) AS tax_collected,
  CASE
    WHEN SUM(CASE WHEN o.tax_total > 0 THEN o.subtotal ELSE 0 END) = 0 THEN NULL
    ELSE (SUM(o.tax_total) * 100.0 / SUM(CASE WHEN o.tax_total > 0 THEN o.subtotal ELSE 0 END))
  END AS effective_rate
FROM orders o
WHERE o.order_status = 'active'
  AND o.order_date >= ?
  AND o.order_date <= ?
GROUP BY month_key
ORDER BY month_key ASC
```

### 5. Order detail display

In the order detail panel (ADR-031), the `tax_total` field is displayed in the order totals section:

```
Subtotal:      $45.00
Shipping:      $8.50
Tax:           $3.15
Discount:     -$0.00
─────────────────────
Grand Total:   $56.65
```

The tax line is always shown, even if `$0.00`, so it is clear that tax was considered.

### 6. Grand total recalculation

When `tax_total` is edited on a manual order, `grand_total` is recalculated:

```
grand_total = subtotal + shipping_total + tax_total - discount_total
```

This recalculation happens in the API `PATCH /api/orders/[id]` handler whenever any of the four component fields change.

### 7. On-time filing compliance focus (added 2026-06-23, audit C22)

CT sales-tax remittance is compliance-critical — there are penalties for **late filing**, so the
system must keep the operator focused on filing **on time**, not merely record payments after the
fact.

**Outstanding liability** is already a fact derived from data: `balance_due = tax_collected −
total_remitted` (tax collected = `SUM(orders.tax_total)` for active orders; remitted = `SUM` of tax
payments incl. the Expenses/AP-lite "Tax Remittance" category). This is computed by
`getTaxPaymentSummary()` and surfaced in the Sales Tax Summary report (`current_liability`).

**Filing timeliness** is computed by `getTaxComplianceStatus()` (`src/lib/tax-payments.ts`) against
an **operator-configured** schedule — the system does **not** hardcode any jurisdiction's filing
calendar. New `settings` keys:

| Key | Example | Notes |
| --- | --- | --- |
| `tax.next_filing_due_date` | `2026-07-31` | ISO date of the next filing deadline (operator-supplied fact) |
| `tax.filing_frequency` | `quarterly` | `monthly` \| `quarterly` \| `annual` (informational label) |
| `tax.filing_reminder_days` | `14` | Lead-time window for the "due soon" warning (default 14) |

`filing_status` ∈ `current` (nothing owed) · `no_schedule` (owed, no due date set) · `overdue`
(owed, past due) · `due_soon` (owed, within the reminder window) · `ok` (owed, beyond the window),
with `days_until_due`.

**Surfacing:** `getTaxComplianceStatus()` is returned by `GET /api/tax-payments/summary` and included
in `getDashboardStats()` (`tax_compliance`) so the status is available to the dashboard "Needs
attention" surface and the Tax Payments screen. (The dashboard/Tax-screen visual badge + the
Settings form inputs for the three keys are the UI finish; the data/logic layer is in place.)

## Consequences

- **Positive:** Sellers have a ready-made tax report for compliance filing; auto-population of tax on manual orders reduces data entry errors; no schema migration required (uses existing `tax_total` column and `settings` table).
- **Negative:** The system does not support per-item tax rates or multi-jurisdiction tax; the "taxable sales" metric is inferred from `tax_total > 0` rather than an explicit flag, which could misclassify orders where tax was intentionally set to $0 for a taxable item; sellers with complex tax situations may still need external tax software.

## Notes

- Cross-references: ADR-006 (reports scope — adds "Sales Tax Summary" to the report list), ADR-013 (report output format — PDF layout rules), ADR-017 (schema — `orders.tax_total` column, `settings` table, `tax_payments` table), ADR-019 (Etsy sync — `total_tax_cost` field mapping), ADR-034 (Config — UI for tax rate setting), ADR-036 (date picker for report date range), ADR-056 (accounting export — tax collected and tax remittance journal entries with GAAP account 2100 Sales Tax Payable)
- Future consideration: per-state tax rate support could be added by keying rates to ship-to state, but this is out of scope for v1
- The setting key `tax.default_rate` uses dot-notation consistent with existing settings keys (e.g., `etsy.active_shop_id`)
