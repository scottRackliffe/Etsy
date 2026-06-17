# ADR-038: Per-item profit/loss and margin calculation

## Status

Accepted

## Date

2026-05-24

## Context

The system tracks `purchase_cost`, `shipping_cost` (inbound), `other_costs` (repairs, cleaning via the `other_costs` table), and `sale_revenue` on each inventory item — but there is no computed profit, margin percentage, or ROI. A vintage seller needs to know "Am I making money on this item?" at a glance, both per-item and in aggregate. Without this, the seller must mentally add up costs and compare to revenue, which is error-prone and tedious.

## Decision

### 1. Computed fields (never stored in the database)

All profit/margin values are computed on read to avoid sync issues when underlying cost or revenue fields change. The formulas are:

| Field        | Formula                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| `total_cost` | `purchase_cost + shipping_cost + SUM(other_costs.amount WHERE other_costs.inventory_id = inventory.id)` |
| `net_profit` | `sale_revenue - total_cost`                                                                             |
| `margin_pct` | `(net_profit / sale_revenue) * 100`                                                                     |
| `roi_pct`    | `(net_profit / total_cost) * 100`                                                                       |

**Edge cases:**

- When `sale_revenue` is `0`, `NULL`, or missing → `margin_pct` = `NULL`; display as "—" (em dash) in the UI, never attempt division
- When `total_cost` is `0` or `NULL` → `roi_pct` = `NULL`; display as "—"
- When `purchase_cost` is `NULL` → treat as `0` in the `total_cost` sum
- When `shipping_cost` is `NULL` → treat as `0` in the `total_cost` sum
- When there are no `other_costs` rows → the `SUM` contribution is `0`
- All monetary values are in the configured currency (ADR-034 `ui.currency_code`), formatted to 2 decimal places

### 2. API changes

**Existing endpoints enhanced (no new endpoints for basic display):**

`GET /api/inventory` and `GET /api/inventory/[id]` responses include computed fields in each item object:

```json
{
  "id": 42,
  "item_number": "TCT-0042",
  "purchase_cost": 25.0,
  "shipping_cost": 8.5,
  "sale_revenue": 75.0,
  "other_costs_total": 5.0,
  "total_cost": 38.5,
  "net_profit": 36.5,
  "margin_pct": 48.67,
  "roi_pct": 94.81
}
```

The `other_costs_total` field is the `SUM(other_costs.amount)` for convenience. The computation uses a LEFT JOIN + `COALESCE(SUM(...), 0)` in the inventory query.

**New report endpoint:**

`GET /api/reports/profit-by-item` — see §4 below. Query dates: canonical `from_date` / `to_date` (ADR-018); aliases `start_date` / `end_date` accepted.

**Dashboard KPI endpoint update:**

`GET /api/dashboard` response adds:

```json
{
  "avg_margin_this_month": 42.3,
  "avg_margin_this_month_count": 15,
  "total_profit_this_month": 634.5,
  "total_profit_ytd": 4280.0
}
```

- `avg_margin_this_month`: mean of `margin_pct` for items with `status = 'Sold'` and `date_of_sale` in the current calendar month; `NULL` if no sold items this month
- `avg_margin_this_month_count`: number of sold items in the calculation
- `total_profit_this_month`: sum of `net_profit` for same set
- `total_profit_ytd`: sum of `net_profit` for items sold in the current calendar year

### 3. Where displayed in the UI

**Inventory detail panel (ADR-030):**

- Read-only "Profitability" row below the financials section
- Layout: horizontal row with four values:
  - Total Cost: `$38.50` | Net Profit: `$36.50` | Margin: `48.7%` | ROI: `94.8%`
- Only shown when `status` is `Sold` or when `sale_revenue > 0`
- When item is not yet sold: show Total Cost only (since profit/margin are meaningless without revenue)

**Inventory list (DataTable — ADR-028, ADR-029):**

- Optional columns (hidden by default, user can enable via column picker): `Total Cost`, `Net Profit`, `Margin %`
- Columns are sortable (ADR-029)
- The sort uses the computed value; the API accepts `sort_by=margin_pct` with `sort_dir=asc|desc` (per ADR-018/029 conventions) and computes in the ORDER BY clause

**Dashboard (ADR-016):**

- New KPI card: "Avg Margin This Month" — shows `42.3%` with item count subtitle "(15 items sold)"
- Below: "Profit This Month: $634.50 | Profit YTD: $4,280.00"
- Card uses standard KPI card layout from dashboard

### 4. Profit by Item report

A new report type added to the reports system (ADR-006, ADR-013).

**Report name:** "Profit by Item"

**Filters:** Date range (based on `date_of_sale`), optional status filter (default: `Sold` only)

**Columns:**

| Column        | Source                                                 |
| ------------- | ------------------------------------------------------ |
| Item #        | `inventory.item_number`                                |
| Description   | `inventory.description` (truncated to 40 chars in PDF) |
| Date Sold     | `inventory.date_of_sale`                               |
| Purchase Cost | `inventory.purchase_cost`                              |
| Shipping (In) | `inventory.shipping_cost`                              |
| Other Costs   | `SUM(other_costs.amount)`                              |
| Total Cost    | computed                                               |
| Sale Revenue  | `inventory.sale_revenue`                               |
| Net Profit    | computed                                               |
| Margin %      | computed                                               |

**Totals row at bottom:**

- Sum of Purchase Cost, Shipping, Other Costs, Total Cost, Sale Revenue, Net Profit
- Weighted average margin: `(SUM(net_profit) / SUM(sale_revenue)) * 100`

**Sort order:** By `date_of_sale` descending (most recent first)

**Empty data:** If no items match the filter, the report body shows: "No sold items found for the selected date range."

**API endpoint:**

- `GET /api/reports/profit-by-item?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD&format=pdf` → PDF
- `GET /api/reports/profit-by-item?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD&format=csv` → CSV
- Default date range: current calendar month if no dates provided
- Response follows ADR-013 report format rules (12pt Courier body, 1in margins, page numbers centered)

### 5. Color coding

- `net_profit > 0` → green text (`var(--ui-green)`)
- `net_profit < 0` → red text (`var(--ui-red)`)
- `net_profit == 0` → default body text color (`var(--ui-body)`)
- Same color coding applies to `margin_pct` display
- In the DataTable list, the Margin % cell text uses the same color rules

### 6. SQL computation pattern

The computed fields use this query pattern (example for single item):

```sql
SELECT
  i.*,
  COALESCE(i.purchase_cost, 0) + COALESCE(i.shipping_cost, 0) + COALESCE(oc.other_total, 0) AS total_cost,
  i.sale_revenue - (COALESCE(i.purchase_cost, 0) + COALESCE(i.shipping_cost, 0) + COALESCE(oc.other_total, 0)) AS net_profit,
  CASE
    WHEN COALESCE(i.sale_revenue, 0) = 0 THEN NULL
    ELSE ((i.sale_revenue - (COALESCE(i.purchase_cost, 0) + COALESCE(i.shipping_cost, 0) + COALESCE(oc.other_total, 0))) * 100.0 / i.sale_revenue)
  END AS margin_pct,
  COALESCE(oc.other_total, 0) AS other_costs_total
FROM inventory i
LEFT JOIN (
  SELECT inventory_id, SUM(amount) AS other_total
  FROM other_costs
  GROUP BY inventory_id
) oc ON oc.inventory_id = i.id
WHERE i.id = ?
```

## Consequences

- **Positive:** Sellers can instantly assess item profitability without manual calculation; the Profit by Item report provides a formal financial summary for record-keeping and tax preparation; dashboard KPIs give at-a-glance business health; no schema changes required.
- **Negative:** Computed fields add query complexity (LEFT JOIN on every inventory read); sorting by computed fields requires the full computation in the ORDER BY clause, which may be slower on large datasets; the `other_costs` table must be joined even when not displayed.

## Notes

- Cross-references: ADR-002 (inventory data model — `purchase_cost`, `shipping_cost`, `sale_revenue` fields), ADR-006 (reports scope — adds "Profit by Item" to the report list), ADR-013 (report output format — PDF layout rules apply), ADR-016 (dashboard — new KPI card), ADR-029 (sort/filter — margin as sortable column), ADR-034 (Config — `ui.currency_code` for formatting), ADR-056 (accounting export — COGS journal entry uses `purchase_cost + shipping_cost` from inventory)
- The `other_costs` table schema: `id, inventory_id, cost_type, amount, note, created_at, updated_at`
- ROI percentage is included in the detail panel but NOT in the report (to keep the report focused on margin)
- All currency values respect the `ui.currency_code` setting from ADR-034
