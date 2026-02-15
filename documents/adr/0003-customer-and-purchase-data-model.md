# ADR-003: Customer and customer-purchase data model

## Status

Accepted

## Date

2025-02-15

## Context

The application must maintain a “customer inventory”: who bought what, when, and where to ship. We need customer identity, full address, and a link to the item(s) purchased and date(s). Data should support thank-you notes, invoices, and sales reporting.

## Decision

**Customer table (one row per customer)**

Store in the database:

- **Name:** customer first name, customer last name
- **Address:** addr line 1, addr line 2, city, state/province, country, postal code
- **Optional:** email (e.g. from Etsy)
- **Audit:** created_at, updated_at

**Purchase/shipment table (e.g. customer_purchases or sales)**

- **Links:** customer_id (FK to customer), inventory_id (FK to inventory — “item purchased”)
- **Date:** date of purchase (and optionally shipping date if not on inventory)
- **Optional:** Etsy receipt/order ID for linking to Etsy
- **Optional:** notes
- **Audit:** created_at

“Item purchased” and “date” are stored on this purchase record; all address and name fields live in the customer table. Every field listed for “customer inventory” is stored in the database.

## Consequences

- **Positive**
  - One place for customer address and name; purchases reference it.
  - Clear relationship: customer → many purchases → many inventory items.
  - Supports reports (thank you note, invoice, sales) and future features (e.g. marking shipped, shipper per shipment).
- **Negative**
  - Duplicate addresses if the same person has multiple ship-to addresses; we treat “customer” as one record per person or per order depending on product needs (can refine later).

## Notes

- Shipping cost and shipper are stored on the purchase/shipment record (ADR-004), not only on inventory.
- Customer data may be initially populated from Etsy orders and then edited or extended in-app.
