# ADR-005: Postal costs by vendor (seller’s spend, DHL included)

## Status

Accepted

## Date

2025-02-15

## Context

The user wants a report showing postal/shipping costs broken down by carrier. The metric of interest is **what the seller pays** to ship (actual cost to USPS, UPS, FedEx, DHL), not the amount charged to the customer. We also need to include DHL as a vendor.

## Decision

- **Report name:** “Postal costs by vendor” (or equivalent).
- **Metric:** Sum of **seller’s shipping cost** (the amount the seller pays to the carrier) for each vendor.
- **Vendors:** **USPS**, **UPS**, **FedEx**, **DHL**, and **Other** (from the shipper field on purchase/shipment records; see ADR-004).
- **Data source:** Database: purchase/shipment table, grouped by shipper, summing the stored shipping cost field.
- **Scope:** All time or a chosen date range; implementation can add filters (e.g. month, year) as needed.

## Consequences

- **Positive**
  - Clear definition: report reflects actual spend per carrier, including DHL.
  - Aligns with ADR-004 (shipper and shipping cost on purchases).
- **Negative**
  - None significant; requires that users (or Etsy import) populate shipper and shipping cost when recording a sale/shipment.

## Notes

- If a sale has no shipper or cost entered, those amounts can be excluded or shown in “Other”/“Unspecified” depending on product preference.
