# ADR-006: Reports — thank you note, invoice, sales, costs, and financial reporting suite

## Status

Accepted

## Date

2025-02-15

## Context

The application must support several reports for daily operations and financial visibility: customer-facing documents (thank you note, invoice), operational views (sales, costs), and financial summaries. All data must come from the database. Note: the standalone "Income — month-to-date," "Income — year-to-date," and "Postal costs by vendor" reports were originally in scope but were removed (2026-06-17, ADR-036); they are not supported and are described here only as historical context.

## Decision

> **Implementation model (2026-05-24):** Customer sales use `orders` + `order_items` (not legacy per-row `purchase` records). Vendor buys use `purchases`. See schema mapping in Notes.

The following **reports** will be supported; all are backed by the database and the data models described in ADR-001–005 and ADR-017.

| Report                     | Purpose                                                                      | Main data source                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Thank you note**         | Printable note per order (e.g. "Thank you for your order…")                  | `orders` snapshot + `order_items` / `inventory` (order date, items).                                     |
| **Invoice**                | Per-order document: buyer, address, items, amounts, dates, payment/shipping. | `orders` + `order_items` + `inventory`; `seller_shipping_cost`, `shipper`, totals on order.              |
| **Sales**                  | List/summary of sales (e.g. by date range).                                  | `orders` + `order_items` + `inventory` (`order_date`, sale revenue).                                     |
| **Costs**                  | What the seller spent (purchase cost, shipping, other costs) — includes postal/shipping spend by carrier. | `inventory` + `other_costs`; `orders.seller_shipping_cost` grouped by `orders.shipper`.        |
| **Outstanding items**      | All current outstanding to-dos (same as outstanding panel/tab).              | Union of outstanding item types per ADR-020; snapshot at run time. See ADR-013.                          |
| **AR aging**               | Unpaid orders by age bucket (0–30, 31–60, 61–90, 90+ days).                  | `orders` with `was_paid = 0`; exclude `order_status` void/cancelled; age from `order_date`. See ADR-013. |
| **Profit by item**         | Per-item cost, revenue, margin, and profit for a date range.                 | `inventory` + `other_costs` + sold `order_items` / `orders.order_date`. See ADR-038, ADR-013.            |
| **Sales tax summary**      | Tax collected by period for filing reference.                                | `orders.tax_total`, `orders.order_date`; active orders only. See ADR-039, ADR-013.                       |
| **Inventory aging**        | Slow movers and days-in-stock / days-listed.                                 | `inventory.date_purchased`, `date_listed`, `status`. See ADR-054, ADR-013.                               |
| **Accounting export**      | Double-entry journal export for external accounting tools.                   | `orders`, `order_items`, `inventory`, `other_costs`, `tax_payments`, `chart_of_accounts`, `gl_transaction_rules`. See ADR-056. GAAP account numbers. CSV-only. |

> **Removed (2026-06-17, ADR-036):** the standalone **Income — month-to-date**, **Income —
> year-to-date**, and **Postal costs by vendor** reports were removed. Income figures now appear on
> the dashboard KPIs (ADR-038); postal/shipping spend is folded into the **Costs** report. The
> codebase has no `income-mtd` / `income-ytd` / `postal-by-vendor` report routes.

Output format: **PDF or CSV** per user choice (see [ADR-013](0013-report-output-pdf.md)). All reports support both; PDF for print/share, CSV for data export. The scope of _what_ each report contains is fixed above.

## Consequences

- **Positive**
  - Clear, agreed scope for each report; implementers follow the same data model and ADRs.
  - All reports use the same database; no separate reporting store required for this scope.
- **Negative**
  - Report layout and formatting will require design and implementation effort.

## Notes

- For report period filters, use the order date as the canonical sale date for sales and profit reports.
- ~~**Income MTD/YTD** and **Postal costs by vendor**~~ — **REMOVED (2026-06-17, ADR-036).** Income figures now appear on the dashboard KPIs (ADR-038); postal/shipping spend is folded into the Costs report. The implementation guidance below for these removed reports is retained for historical reference only and must not be treated as current scope.
  - ~~Sum **inventory.sale_revenue** for all items linked from orders in the selected period (filtered by order date). Sale revenue is stored on inventory (ADR-002); the order_items record links to the item. Do not store a duplicate "amount" on the order record for revenue; use the linked inventory's `sale_revenue`.~~
- Thank you note and invoice are document-style reports (per order); sales, costs, and the financial reporting suite are summary/list reports.
- **Reporting currency:** Monetary reports use the app default currency (`ui.currency_code` setting; see ADR-034). Per-currency or multi-currency report aggregation is out of scope unless added in a future ADR.

> **Note (2026-06-09):** The canonical currency setting is `ui.currency_code` (see ADR-034). The legacy `settings.currency_code` key is retained for backwards compatibility but `ui.currency_code` is authoritative.
- **Per-order documents (ADR-036):** Invoice and thank-you note can be generated for a single order via path-based endpoints: `/api/reports/invoice/[orderId]` and `/api/reports/thank-you-note/[orderId]`.

### Schema mapping (updated 2026-05-24)

The "purchase" references in this ADR's table map to the implementation schema as follows:

| ADR-006 term                     | Implementation                                        | Notes                                               |
| -------------------------------- | ----------------------------------------------------- | --------------------------------------------------- |
| purchase / purchase record       | `orders` + `order_items`                              | `orders` = order header; `order_items` = line items |
| purchase.date_of_purchase        | `orders.order_date`                                   |                                                     |
| purchase.shipping_cost (seller)  | `orders.seller_shipping_cost`                         |                                                     |
| purchase.shipper                 | `orders.shipper`                                      |                                                     |
| purchase.was_paid                | `orders.was_paid`                                     |                                                     |
| purchase rows with same order_id | `order_items` rows for one `orders` row               | Each `orders` row IS the order                      |
| linked inventory.sale_revenue    | `order_items.inventory_id` → `inventory.sale_revenue` | Join through order_items                            |
