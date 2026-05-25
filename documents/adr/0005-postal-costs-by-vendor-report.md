# ADR-005: Postal costs by vendor (seller’s spend, DHL included)

## Status

Accepted

## Date

2025-02-15

## Context

The user wants a report showing postal/shipping costs broken down by carrier. The metric of interest is **what the seller pays** to ship (actual cost to USPS, UPS, FedEx, DHL), not the amount charged to the customer. We also need to include DHL as a vendor.

## Decision

> **Data source (2026-05-24):** `orders` table per ADR-004 and ADR-013. Global filter: `order_status = 'active'` only.

- **Report name:** “Postal costs by vendor” (or equivalent).
- **Metric:** Sum of **`orders.seller_shipping_cost`** (seller’s actual postage spend) per carrier.
- **Vendors:** **USPS**, **UPS**, **FedEx**, **DHL**, **Other** — from **`orders.shipper`** (ADR-004).
- **Query:** `SELECT shipper, SUM(seller_shipping_cost) FROM orders WHERE order_status = 'active' [AND order_date in range] GROUP BY shipper`. Null shipper → “Other” or “Unspecified” (ADR-013).
- **Scope:** All time or date range via **`from_date` / `to_date`** on `orders.order_date`. Output PDF + CSV per ADR-013.

## Consequences

- **Positive**
  - Clear definition: report reflects actual spend per carrier, including DHL.
  - Aligns with ADR-004 (`orders.shipper`, `orders.seller_shipping_cost`).
- **Negative**
  - None significant; requires that users (or Etsy import) populate shipper and shipping cost when recording a sale/shipment.

## Notes

- If a sale has no shipper or cost entered, show those amounts in “Other” or “Unspecified” so the report is complete; do not exclude them.
