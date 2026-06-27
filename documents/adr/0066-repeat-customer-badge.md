# ADR-066: Repeat customer badge and highlight

## Status

Accepted

## Date

2026-05-24

## Context

Repeat customers are high-value but there is no visual indicator distinguishing them from first-time buyers. The system should flag returning buyers so the user can prioritize service and recognize loyalty.

## Decision

### Definition

A **repeat customer** is any customer with 2 or more orders where `order_status = 'active'`. Void and cancelled orders do not count.

### SQL

```sql
SELECT c.id, COUNT(o.id) AS order_count
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id AND o.order_status = 'active'
GROUP BY c.id
HAVING order_count >= 2;
```

### Badge display

A `Badge` (variant `info`, text "Repeat") appears next to the customer name in these locations:

| Location                            | How                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Customer list DataTable**         | Inline with the customer name cell. If `order_count >= 2`, render `<Badge variant="info">Repeat</Badge>` after the name. |
| **Customer detail panel header**    | Next to the customer's full name at the top of the detail panel.                                                         |
| **Order detail "Customer" section** | Next to the linked customer name shown in order details.                                                                 |

### VIP threshold (future)

- A setting `repeat_customer_threshold` (default `2`) stored in the `settings` table controls the minimum order count for the "Repeat" badge.
- A future "VIP" badge (variant `success`, text "VIP") can be added at `>= 5` orders. This is deferred — only the "Repeat" badge is implemented now.

### API changes

- `GET /api/customers` (list): Each customer object includes an `order_count` field computed via a `LEFT JOIN` and `COUNT`. This is an integer.
- `GET /api/customers/[id]` (detail): Same — includes `order_count`.
- No new table or column is required. The count is computed from the existing `orders.customer_id` relationship.

### Dashboard integration

- A new KPI stat on the Dashboard: **"Repeat customers this month"** — count of distinct customers with `>= 2` active orders where at least one order has `order_date` in the current calendar month.
- This stat is included in the existing `GET /api/dashboard/stats` response as `repeat_customers_this_month`.

### Performance

- The `LEFT JOIN` + `COUNT` for the customer list query is acceptable for the expected data volume (hundreds to low thousands of customers).
- An index on `orders(customer_id, order_status)` already supports this query efficiently.

## Consequences

- **Positive:** Instant visibility into customer loyalty; encourages personalized service; no schema changes needed; lightweight computation.
- **Negative:** Badge adds visual noise if many customers are repeats (mitigated by using the subtle `info` variant).

## Notes

- Cross-ref: ADR-028 (Badge shared component), ADR-016 (dashboard KPI cards), ADR-052 (purchase history context).
- The `order_count` field is read-only and computed — it is never stored or updated directly.
- Default threshold is 2 (configurable via Settings → Settings or the `repeat_customer_threshold` setting). The threshold is read from the `settings` table at runtime; if absent, the default of 2 is used. (Reconciliation note 2026-06-09: removed prior note that threshold was hardcoded — the Decision section's `repeat_customer_threshold` setting is canonical.)
- When displaying in the DataTable, the badge should not interfere with sorting by customer name. The sort key remains the name string; the badge is decorative.
