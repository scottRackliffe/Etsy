# ADR-064: Inventory value summary dashboard widget

## Status

Accepted

## Date

2026-05-24

## Context

There is no total value of current inventory at cost or at sale price displayed anywhere in the app. This is a basic business health metric that the user needs at a glance on the dashboard.

## Decision

### Widget definition

A new "Inventory Value" card on the Dashboard page displays three key numbers:

| Metric               | Calculation                                                             |
| -------------------- | ----------------------------------------------------------------------- |
| **At cost**          | `SUM(purchase_cost + shipping_cost)` for all unsold inventory items     |
| **At sale price**    | `SUM(sale_revenue)` for the same items                                  |
| **Potential margin** | `at_sale_price - at_cost` (with percentage: `(margin / at_cost) * 100`) |

### Unsold inventory filter

"Unsold" means `status IN ('Draft', 'In stock', 'Listed', 'Reserved')`. Items with status `Sold` or `Retired` are excluded.

### Null handling

- Items with `NULL` `purchase_cost` are treated as `$0.00` cost.
- Items with `NULL` `shipping_cost` are treated as `$0.00` shipping cost.
- Items with `NULL` `sale_revenue` are treated as `$0.00` sale price.
- The `item_count` reflects all unsold items regardless of null fields.

### API endpoint

`GET /api/dashboard/inventory-value`

Response:

```json
{
  "at_cost": 1250.0,
  "at_sale_price": 3400.0,
  "potential_margin": 2150.0,
  "potential_margin_pct": 172.0,
  "item_count": 42
}
```

- All monetary values are numbers (not strings), rounded to 2 decimal places.
- `potential_margin_pct` is `null` when `at_cost` is 0 (avoid division by zero).

### UI display

- Uses the `Stat` component pattern (consistent with other dashboard KPI cards).
- Layout: three stats in a row within the card — "At Cost", "At Sale Price", "Potential Margin".
- Margin stat uses `var(--ui-green)` accent when positive, `var(--ui-red)` when negative, `var(--ui-muted)` when zero.
- Percentage shown in parentheses next to the margin dollar amount.
- Card subtitle: "{item_count} unsold items".

### Refresh

- Auto-refreshes with the dashboard polling interval (60 seconds per ADR-016).
- Also refreshes when the user navigates to the Dashboard tab.

## Consequences

- **Positive:** Instant visibility into inventory investment and potential return; helps pricing decisions; lightweight query.
- **Negative:** Margin is theoretical (assumes all items sell at `sale_revenue`); items without prices skew the numbers toward zero.

## Notes

- Cross-ref: ADR-016 (dashboard content and behavior), ADR-002 (inventory data model fields), ADR-038 (profit/loss calculations).
- The query should use `COALESCE` for null handling: `COALESCE(purchase_cost, 0) + COALESCE(shipping_cost, 0)`.
- `other_costs` are intentionally excluded from this widget to keep it simple. A full cost analysis belongs in the Income reports (ADR-013).
