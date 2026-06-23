# ADR-054: Inventory Aging and Slow-Mover Report

## Status

Accepted

## Date

2026-05-24

## Context

There is no way to see how long inventory items have been sitting unsold. Vintage and antique sellers need to identify dead stock so they can reprice, relist, or retire items that aren't moving. Without aging visibility, capital stays tied up in slow inventory with no alert mechanism.

## Decision

### Aging calculation

- `days_in_stock = today - date_purchased`
- If `date_purchased` is NULL, fall back to `date_listed`
- If both are NULL, fall back to `created_at`
- Only one fallback chain; the first non-NULL value wins

### Aging buckets

| Bucket   | Range       |
| -------- | ----------- |
| Fresh    | 0–30 days   |
| Moderate | 30–60 days  |
| Aging    | 60–90 days  |
| Slow     | 90–180 days |
| Stale    | 180+ days   |

Buckets are exclusive of the lower bound and inclusive of the upper bound. 0–30 means 0 < days ≤ 30. 30–60 means 30 < days ≤ 60. 60–90 means 60 < days ≤ 90. 90–180 means 90 < days ≤ 180. 180+ means days > 180.

Age is calculated from `date_listed` for Listed items, and from `created_at` for In stock items without a `date_listed`.

`Slow mover` threshold is 90 days (displayed as a badge on inventory list per ADR-030).

> **Reconciliation note (2026-06-09):** Clarified bucket boundary ownership (exclusive lower, inclusive upper), age calculation source fields, and slow-mover threshold.

### Report: "Inventory Aging"

Table columns:

- `item_number`
- `description`
- `status`
- `days_in_stock`
- `aging_bucket` (computed from days_in_stock)
- `purchase_cost`
- `sale_revenue` (if priced; NULL otherwise)
- `date_purchased`
- `date_listed`

Filter: unsold items only — status IN (`Draft`, `In stock`, `Listed`, `Reserved`). Items with status `Sold` or `Retired` are excluded.

Sort options (user-selectable):

- By age descending (default)
- By purchase cost descending
- By status alphabetical

Summary row at bottom: total item count, total purchase_cost invested, average days_in_stock.

### Dashboard widget

- "Aging Inventory" card on the Dashboard (ADR-016)
- Displays bucket counts, e.g., "5 items 0–30 days · 8 items 31–60 days · 12 items > 90 days"
- Items > 90 days unsold are flagged with a yellow `Badge` reading "Slow mover"
- Card links to the full Inventory Aging report on the Reports tab

### PDF/CSV output

- PDF layout follows the ADR-013 report layout (brand layout: Crimson Text + Raleway, brand banner)
- CSV export uses the same columns as the table above
- User actions after generation: Print | Export PDF | Export CSV | Cancel (per ADR-013)

### API

```
GET /api/reports/inventory-aging?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD&format=pdf|csv
```

- `from_date` / `to_date`: optional; filter by `date_purchased` (or fallback date) range per § Aging calculation
- **Output format (ADR-018 §6, ADR-013):** Query param `format=pdf` or `format=csv` returns the report file (`Content-Type` application/pdf or text/csv). Omit `format` only if the implementation exposes a JSON preview for the Reports UI: `{ items: [...], summary: { total_items, total_cost, avg_days_in_stock, buckets: { "0-30": N, "31-60": N, ... } } }` — not used for Print/Export actions.
- Standard error envelope on failure (ADR-018)

## Consequences

- **Positive:** Sellers can identify dead stock and take action (reprice, relist, retire). Dashboard card gives at-a-glance aging visibility without navigating to Reports. Supports data-driven inventory management decisions.
- **Negative:** Aging calculation depends on `date_purchased` being populated; items entered without a purchase date use less accurate fallbacks. Adds one more report to generate and maintain.

## Notes

- Cross-references: ADR-002 (inventory data model — status values, date fields), ADR-006 (reports scope), ADR-013 (report output format), ADR-016 (dashboard content — new widget), ADR-017 (database schema — inventory table columns)
- The "Slow mover" badge uses `--ui-yellow` (#FFCC00) per the color system
- Bucket thresholds are hardcoded (not configurable) in v1; consider making them configurable via settings in a future iteration
