# ADR-004: Shipper field and seller shipping cost on orders

## Status

Accepted

## Date

2025-02-15

## Context

We need to report "postal costs by vendor" (USPS, UPS, FedEx, DHL). That requires knowing which carrier was used for each order and how much was spent on shipping. Shipping can vary per sale (e.g. different package, different carrier), so it should be recorded at the order level, not only on the inventory item.

## Decision

> **Storage (2026-05-24):** Customer sale shipping is on the **`orders`** header (ADR-017), not on `order_items` or vendor `purchases`.

- **Where to store:** **`orders.shipper`** and **`orders.seller_shipping_cost`** (seller’s actual postage spend). Optional **`orders.tracking_number`** and **`orders.shipping_date`** when shipped (ADR-031). Inventory **`shipping_cost`** remains item-level acquisition cost (ADR-002), separate from seller postage on the sale.
- **Shipper values (allowed):** **USPS**, **UPS**, **FedEx**, **DHL**, **Other**. "Other" is required for unspecified carrier; postal-by-vendor report includes Other/Unspecified (ADR-005).
- **Shipping cost:** **`orders.seller_shipping_cost`** — what the seller pays the carrier; summed by `orders.shipper` for “Postal costs by vendor” (ADR-013).

All values are stored in the database; reports group and sum per ADR-013/006.

## Consequences

- **Positive**
  - Per-shipment carrier and cost; accurate "postal costs by vendor" (including DHL).
  - Single source of truth for who shipped and how much was spent.
- **Negative**
  - Inventory `shipping_cost` (acquisition) and `orders.seller_shipping_cost` (postage on sale) serve different purposes; both are kept.

## Notes

- DHL was explicitly added alongside USPS, UPS, and FedEx.
- **"Other" here = other shippers (carriers), not "other costs".** Item-level other costs use table **`other_costs`** (ADR-002, ADR-017), unrelated to shipper.
- "Other" allows future or rare carriers without schema change.

### Schema mapping (updated 2026-05-24)

The "purchase/shipment record" referenced in this ADR maps to the `orders` table in the implementation (see ADR-017). Specifically: `orders.shipper` stores the carrier, `orders.seller_shipping_cost` stores the seller's shipping cost, and `orders.tracking_number` stores the carrier tracking number (added by ADR-031).

> **Reconciled 2026-06-09:** Terminology updated from legacy "purchase" to "orders" per ADR-017 schema. Title, heading, and Context section now use order-centric language.
