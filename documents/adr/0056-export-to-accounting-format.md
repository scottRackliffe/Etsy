# ADR-056: Export to Accounting Format

## Status

Accepted

## Date

2026-05-24

## Context

Business owners need to feed sales and expense data to their accountant or import into accounting software (QuickBooks, Wave, Excel). Currently there is no structured export that maps transactions to standard accounting categories. Generating this manually from raw report data is time-consuming and error-prone.

## Decision

### New report: "Accounting Export"

- CSV-only output (no PDF). Accounting software universally accepts CSV; PDF adds no value here.
- Available from the Reports tab alongside other reports

### CSV columns

| Column             | Description                                                                           | Example                         |
| ------------------ | ------------------------------------------------------------------------------------- | ------------------------------- |
| `Date`             | Transaction date (`YYYY-MM-DD`)                                                       | `2026-05-15`                    |
| `Transaction Type` | One of: `Sale`, `Purchase`, `Shipping`, `Other Cost`, `Tax`                           | `Sale`                          |
| `Reference`        | `order_number` for sale/shipping/tax rows; `item_number` for purchase/other-cost rows | `ORD-0042`                      |
| `Description`      | Human-readable line description                                                       | `Sale: Vintage Lamp (INV-0012)` |
| `Debit`            | Amount debited (blank if credit)                                                      | `12.50`                         |
| `Credit`           | Amount credited (blank if debit)                                                      | `45.00`                         |
| `Account`          | Account category                                                                      | `Sales Revenue`                 |

### Transaction type mapping

| Source data                              | Transaction Type | Debit/Credit | Account          |
| ---------------------------------------- | ---------------- | ------------ | ---------------- |
| `order_items.line_total` (per item sold) | Sale             | Credit       | Sales Revenue    |
| `orders.seller_shipping_cost`            | Shipping         | Debit        | Shipping Expense |
| `orders.tax_total`                       | Tax              | Credit       | Tax Collected    |
| `purchases.purchase_price`               | Purchase         | Debit        | Cost of Goods    |
| `purchases.shipping_price`               | Purchase         | Debit        | Cost of Goods    |
| `other_costs.amount`                     | Other Cost       | Debit        | Other Expense    |

### Data rules

- Only orders with `order_status = 'active'` are included (void/cancelled excluded per global report rule)
- Date range filter via `from_date` and `to_date` query parameters (per ADR-036)
- For Sale rows, `Date` = `orders.order_date`
- For Purchase rows, `Date` = `purchases.purchase_date`
- For Other Cost rows, `Date` = `other_costs.created_at` (date portion)
- Rows sorted by `Date` ascending, then by `Transaction Type` alphabetical
- Amounts formatted to 2 decimal places, no currency symbol (accounting software adds its own)
- Empty date range = all time

### Description field format

| Transaction Type | Description format                                                |
| ---------------- | ----------------------------------------------------------------- |
| Sale             | `"Sale: {inventory.description} ({inventory.item_number})"`       |
| Shipping         | `"Shipping: Order {orders.order_number}"`                         |
| Tax              | `"Tax collected: Order {orders.order_number}"`                    |
| Purchase         | `"Purchase: {inventory.description} ({inventory.item_number})"`   |
| Other Cost       | `"Other cost: {other_costs.cost_type} - {inventory.item_number}"` |

### API

```
GET /api/reports/accounting-export?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD&format=csv
```

- `format` parameter must be `csv` (only supported value; return 400 if other value provided)
- Response: `Content-Type: text/csv`, `Content-Disposition: attachment; filename="accounting-export-YYYY-MM-DD.csv"`
- Standard error envelope on failure (ADR-018)
- Empty result: return CSV with header row only (no data rows), not an error

## Consequences

- **Positive:** Enables direct import into QuickBooks, Wave, Excel, or handoff to an accountant. Standardized double-entry format reduces manual bookkeeping errors. Date range filter lets users export by month/quarter/year.
- **Negative:** Single account mapping may not match every user's chart of accounts — but the standard categories (Sales Revenue, COGS, Shipping Expense, Tax Collected, Other Expense) cover the common case. Users with complex accounting needs can adjust after import.

## Notes

- Cross-references: ADR-006 (reports scope — this is a new report type), ADR-013 (report format — CSV column conventions), ADR-017 (database schema — orders, order_items, purchases, other_costs tables), ADR-036 (date range filter), ADR-038 (profit/loss — uses similar data but different aggregation)
- The `format=csv` parameter is included for forward-compatibility in case other formats (e.g., QBO, OFX) are added later
- No PDF variant is intentional — accounting exports are machine-readable by design
