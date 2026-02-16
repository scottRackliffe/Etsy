# ADR-006: Reports — thank you note, invoice, sales, costs, income, postal by vendor

## Status

Accepted

## Date

2025-02-15

## Context

The application must support several reports for daily operations and financial visibility: customer-facing documents (thank you note, invoice), operational views (sales, costs), and financial summaries (income month-to-date, year-to-date, postal costs by vendor). All data should come from the database.

## Decision

The following **reports** will be supported; all are backed by the database and the data models described in ADR-001–005.

| Report | Purpose | Main data source |
|--------|---------|-------------------|
| **Thank you note** | Printable note per order (e.g. “Thank you for your order…”) | Customer (name, address as needed), purchase date, item purchased. |
| **Invoice** | Per-sale document: buyer, address, items, amounts, dates, payment/shipping. | Customer, purchase(s), linked inventory (description, sale revenue), shipping cost, shipper, dates. |
| **Sales** | List/summary of sales (e.g. by date range). | Purchases + linked inventory (sale revenue, dates). |
| **Costs** | What the seller spent (purchase cost, shipping, other costs). | Inventory (purchase cost, shipping cost), inventory_other_costs, and shipping cost on purchase/shipment. |
| **Income — month to date** | Revenue for the current month. | Sum of inventory.sale_revenue for items linked from purchases where date_of_purchase is in the current month (see Notes). |
| **Income — year to date** | Revenue for the current year. | Same as above for the current year. |
| **Postal costs by vendor** | Shipping spend by carrier. | Sum of seller’s shipping cost grouped by shipper (USPS, UPS, FedEx, DHL, Other). See ADR-005. |
| **Outstanding items** | All current outstanding to-dos (same as outstanding panel/tab). | Union of outstanding item types per ADR-020; snapshot at run time. See ADR-013. |
| **AR aging** | Unpaid orders by age bucket (0–30, 31–60, 61–90, 90+ days). | purchase with was_paid = 0; exclude void/cancelled; group by order_id and age bucket. See ADR-013. |

Output format is **PDF** for all reports (see [ADR-013](0013-report-output-pdf.md)) so they look professional and can be printed or shared. The scope of *what* each report contains is fixed above.

## Consequences

- **Positive**
  - Clear, agreed scope for each report; implementation can follow the same data model and ADRs.
  - All reports use the same database; no separate reporting store required for this scope.
- **Negative**
  - Report layout and formatting will require design and implementation effort.

## Notes

- “Date of sale” for MTD/YTD should align with the field used on inventory or purchase (e.g. purchase date or date_of_sale on inventory).
- **Income MTD/YTD:** Sum **inventory.sale_revenue** for all items linked from purchases (or from inventory date of sale) in the selected period. Sale revenue is stored on inventory (ADR-002); the purchase record links to the item. Do not store a duplicate “amount” on the purchase record for revenue; use the linked inventory’s sale_revenue.
- Thank you note and invoice are document-style reports (per order: all purchase rows with the same order_id); sales, costs, income MTD/YTD, and postal by vendor are summary/list reports.
