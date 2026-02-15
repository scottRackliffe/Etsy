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
| **Income — month to date** | Revenue for the current month. | Sum of sale revenue (or purchase amounts) where date of sale is in the current month. |
| **Income — year to date** | Revenue for the current year. | Same as above for the current year. |
| **Postal costs by vendor** | Shipping spend by carrier. | Sum of seller’s shipping cost grouped by shipper (USPS, UPS, FedEx, DHL, Other). See ADR-005. |

Output format (PDF, print, screen) can be decided at implementation time. The scope of *what* each report contains is fixed above.

## Consequences

- **Positive**
  - Clear, agreed scope for each report; implementation can follow the same data model and ADRs.
  - All reports use the same database; no separate reporting store required for this scope.
- **Negative**
  - Report layout and formatting will require design and implementation effort.

## Notes

- “Date of sale” for MTD/YTD should align with the field used on inventory or purchase (e.g. purchase date or date_of_sale on inventory).
- Thank you note and invoice are document-style reports; sales, costs, income MTD/YTD, and postal by vendor are summary/list reports.
