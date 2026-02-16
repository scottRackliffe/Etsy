# ADR-006: Reports — thank you note, invoice, sales, costs, income, postal by vendor

## Status

Accepted

## Date

2025-02-15

## Context

The application must support several reports for daily operations and financial visibility: customer-facing documents (thank you note, invoice), operational views (sales, costs), and financial summaries (income month-to-date, year-to-date, postal costs by vendor). All data must come from the database.

## Decision

The following **reports** will be supported; all are backed by the database and the data models described in ADR-001–005.

| Report                     | Purpose                                                                      | Main data source                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Thank you note**         | Printable note per order (e.g. “Thank you for your order…”)                  | Customer (name, address as needed), purchase date, item purchased.                                                        |
| **Invoice**                | Per-order document: buyer, address, items, amounts, dates, payment/shipping. | Customer, purchase(s), linked inventory (description, sale revenue), shipping cost, shipper, dates.                       |
| **Sales**                  | List/summary of sales (e.g. by date range).                                  | Purchases + linked inventory (sale revenue, dates).                                                                       |
| **Costs**                  | What the seller spent (purchase cost, shipping, other costs).                | Inventory (purchase cost, shipping cost), inventory_other_costs, and shipping cost on purchase/shipment.                  |
| **Income — month to date** | Revenue for the current month.                                               | Sum of inventory.sale_revenue for items linked from purchases where date_of_purchase is in the current month (see Notes). |
| **Income — year to date**  | Revenue for the current year.                                                | Same as above for the current year.                                                                                       |
| **Postal costs by vendor** | Shipping spend by carrier.                                                   | Sum of seller’s shipping cost grouped by shipper (USPS, UPS, FedEx, DHL, Other). See ADR-005.                             |
| **Outstanding items**      | All current outstanding to-dos (same as outstanding panel/tab).              | Union of outstanding item types per ADR-020; snapshot at run time. See ADR-013.                                           |
| **AR aging**               | Unpaid orders by age bucket (0–30, 31–60, 61–90, 90+ days).                  | purchase with was_paid = 0; exclude void/cancelled; group by order_id and age bucket. See ADR-013.                        |

Output format: **PDF or CSV** per user choice (see [ADR-013](0013-report-output-pdf.md)). All reports support both; PDF for print/share, CSV for data export. The scope of _what_ each report contains is fixed above.

## Consequences

- **Positive**
  - Clear, agreed scope for each report; implementers follow the same data model and ADRs.
  - All reports use the same database; no separate reporting store required for this scope.
- **Negative**
  - Report layout and formatting will require design and implementation effort.

## Notes

- For report period filters, use `purchase.date_of_purchase` as the canonical sale date for sales, income MTD, and income YTD.
- **Income MTD/YTD:** Sum **inventory.sale_revenue** for all items linked from purchases in the selected period (filtered by `purchase.date_of_purchase`). Sale revenue is stored on inventory (ADR-002); the purchase record links to the item. Do not store a duplicate “amount” on the purchase record for revenue; use the linked inventory’s `sale_revenue`.
- Thank you note and invoice are document-style reports (per order: all purchase rows with the same order_id); sales, costs, income MTD/YTD, and postal by vendor are summary/list reports.
- **Reporting currency:** Income MTD/YTD and other monetary reports use the app default currency (settings.currency_code). Per-currency or multi-currency report aggregation is out of scope unless added in a future ADR. Per-customer currency (customer.currency_code) is used for that customer’s invoice and thank-you note (ADR-017, design-decisions-implementation §3).
