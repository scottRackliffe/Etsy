# ADR-004: Shipper field and shipping cost on purchases

## Status

Accepted

## Date

2025-02-15

## Context

We need to report "postal costs by vendor" (USPS, UPS, FedEx, DHL). That requires knowing which carrier was used for each shipment and how much was spent on shipping. Shipping can vary per sale (e.g. different package, different carrier), so it should be recorded at the sale/shipment level, not only on the inventory item.

## Decision

- **Where to store:** Add **shipper** (and **shipping cost** if not already present) to the **purchase/shipment** record (the table that links customer + item + date), not only on inventory.
- **Shipper values (allowed vendors):** **USPS**, **UPS**, **FedEx**, **DHL**, and **Other**. "Other" is required for unspecified or unknown carrier; the "Postal costs by vendor" report shows a row for Other (ADR-005).
- **Shipping cost:** Store the **seller's actual shipping cost** (what the seller pays to the carrier) on this record so it can be summed by shipper for the "postal costs by vendor" report.

All values are stored in the database; reports will group and sum by these vendor values.

## Consequences

- **Positive**
  - Per-shipment carrier and cost; accurate "postal costs by vendor" (including DHL).
  - Single source of truth for who shipped and how much was spent.
- **Negative**
  - If shipping cost is also stored on inventory for "cost of goods" purposes, we keep both: inventory shipping cost for item-level costing, purchase-level shipping cost for vendor reporting.

## Notes

- DHL was explicitly added alongside USPS, UPS, and FedEx.
- **"Other" here = other shippers (carriers), not "other costs".** "Other" is a **shipper** value (unspecified or alternative carrier). "Other costs" (e.g. repair, cleaning per item) are defined in ADR-002 (inventory_other_costs) and are unrelated to this ADR.
- "Other" allows future or rare carriers without schema change.

### Schema mapping (updated 2026-05-24)

The "purchase/shipment record" referenced in this ADR maps to the `orders` table in the implementation (see ADR-017). Specifically: `orders.shipper` stores the carrier, `orders.seller_shipping_cost` stores the seller's shipping cost, and `orders.tracking_number` stores the carrier tracking number (added by ADR-031).
