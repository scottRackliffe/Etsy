# ADR-052: Customer purchase history timeline

## Status

Accepted

## Date

2026-05-24

## Context

The customer detail view shows name, contact info, and addresses but provides no visual history of purchases. Repeat customers are the most valuable segment for a vintage/antique business — their purchase history should be visible at a glance to inform communication and sales decisions.

## Decision

Add a purchase history timeline section to the customer detail panel, showing all orders associated with the customer in reverse chronological order.

### Location in UI

- Customer detail panel (inline on the Customers page per ADR-024 — no separate route).
- Positioned below the addresses section.
- Section header: "Order History"

### API endpoint

```
GET /api/customers/[id]/orders
```

Query parameters:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 10 | Max orders to return |
| `offset` | number | 0 | Pagination offset |

Response:

```json
{
  "summary": {
    "total_orders": 12,
    "total_spent": 1456.78,
    "first_order_date": "2024-03-15",
    "last_order_date": "2026-05-20"
  },
  "items": [
    {
      "id": 42,
      "order_number": "ORD-2026-042",
      "order_date": "2026-05-20",
      "order_status": "active",
      "payment_status": "paid",
      "source_channel": "etsy",
      "grand_total": 89.99,
      "shipped": true,
      "items": [
        {
          "inventory_id": 101,
          "description": "Blue ceramic vase",
          "quantity": 1,
          "unit_price": 89.99
        }
      ]
    }
  ],
  "pagination": {
    "limit": 25,
    "offset": 0,
    "total": 12,
    "has_more": false
  }
}
```

- The `items` array within each order is joined from `order_items` → `inventory.description`.
- Only orders with `order_status = 'active'` are included in the `summary.total_spent` calculation. Void/cancelled orders still appear in the timeline but are visually distinct and excluded from totals.
- The `shipped` boolean is derived from: `shipping_date IS NOT NULL`.

### Summary stats bar

Displayed at the top of the Order History section as a compact stats row:

```
12 orders | Total spent: $1,456.78 | First: Mar 15, 2024 | Last: May 20, 2026
```

- Uses the app's configured date format (from settings `ui.date_format`).
- Currency formatted per locale.
- If zero orders: do not show the stats bar.

### Timeline display

Vertical list of order cards, each showing:

| Element           | Content                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| Date              | `order_date` formatted per app settings                                                            |
| Order number      | Clickable link                                                                                     |
| Items             | Comma-separated list of `inventory.description` values (truncated to 80 chars total with "...")    |
| Total             | `grand_total` formatted as currency                                                                |
| Status badges     | Payment status badge (green "Paid" / yellow "Unpaid") + Source badge (grey "Etsy" / blue "Manual") |
| Shipped indicator | Green checkmark if shipped; grey clock if not                                                      |

### Order card fields (summary)

Each order card shows the following fields at a glance:

1. **order_number** — clickable link that navigates to Sales tab with deep-link param (`/sales?orderId=<id>`)
2. **order_date** — formatted per app's `ui.date_format` setting
3. **grand_total** — formatted per currency setting (`ui.currency_code`)
4. **payment_status badge** — green "Paid", yellow "Unpaid", or grey "Refunded"
5. **Item count** — total number of line items in the order (e.g., "3 items")
6. **"View order" link** — navigates to Sales tab with deep-link param (same as order_number click)

### Visual treatment for void/cancelled orders

- Void/cancelled orders show with reduced opacity (50%) and a strikethrough on the order number.
- A small badge shows "Void" (red) or "Cancelled" (grey).
- These orders are NOT included in summary totals.

### Click behavior

- Clicking an order number or the order card navigates to `/sales?orderId=<id>` (ADR-035 deep link).
- The Sales page reads the `orderId` param, selects the order, and opens the detail panel.

### Empty state

When the customer has no orders:

- Show: "No orders yet for this customer."
- No stats bar displayed.

### Pagination

- The timeline initially loads the 10 most recent orders. A "Load more" button at the bottom loads the next 10. Orders are sorted by `order_date DESC`.
- "Load more" button is shown only when `has_more` is true (not infinite scroll).
- Each "Load more" click fetches the next 10 orders and appends to the list.

### Performance

- The API joins `orders` → `order_items` → `inventory` in a single query.
- Summary stats are computed server-side in a separate aggregation query (not by summing client-side).
- Index on `orders.customer_id` + `orders.order_date` ensures efficient lookup.

## Consequences

- **Positive**: Gives immediate visibility into customer value and purchase patterns. Helps identify repeat customers. Enables quick navigation to related orders. Summary stats provide at-a-glance customer lifetime value.
- **Negative**: Additional API endpoint and query complexity. Large customers (100+ orders) require pagination. Joining through order_items to inventory adds query cost (mitigated by limit).

## Notes

- Cross-references: ADR-003 (customer data model — customer ↔ orders relationship), ADR-031 (order detail view — the target when clicking an order), ADR-035 (deep links — navigation from timeline to sales page), ADR-024 (frontend architecture — inline detail panel, no sub-routes)
- The endpoint does NOT duplicate `GET /api/orders?customer_id=<id>` — it adds the `summary` object and includes inline `items` descriptions for display without requiring a second request per order.
- Future consideration: add a "Reorder" button that pre-fills a new order with the same items. Not in scope for v1.

### Reconciliation note (updated 2026-06-09)

Updated 2026-06-09: Changed default page size from 25 to 10 orders for initial load (and subsequent "Load more" batches). Added explicit order card field specification listing all six visible fields per card. Added "View order" deep-link navigation to Sales tab.
