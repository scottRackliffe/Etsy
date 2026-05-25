# ADR-003: Customer and customer-purchase data model

## Status

Accepted

## Date

2025-02-15

## Context

The application must maintain a “customer inventory”: who bought what, when, and where to ship. We need customer identity, full address, and a link to the item(s) purchased and date(s). Data should support thank-you notes, invoices, and sales reporting. A **person can have multiple purchases** over time; linking those to one customer record supports loyalty, repeat-customer reporting, and discounts. The same person may have **multiple ship-to addresses** (e.g. home, work, gift recipient); the system **must hold multiple ship-to addresses** per customer as a **convenience for input** (user picks from existing addresses when entering a purchase). The **purchase record must hold all data as it appeared at the time** — including which address was used and the full ship-to details — so invoices and history stay correct even if the customer or their addresses change later. Each sale should record any **discount amount** applied so invoices and reports are accurate.

## Decision

**Customer table (one row per person)**

One customer record per **person** (not per order). That person can have **multiple purchases** and **multiple ship-to addresses**; the same customer_id links all their purchases and addresses. This supports discounts, loyalty, and repeat-customer reporting.

Store in the database:

- **Name:** customer first name, customer last name
- **Optional:** email (e.g. from Etsy)
- **Audit:** created_at, updated_at

(Addresses are stored in the **customer_address** table below.)

**Customer_address table (multiple rows per customer)**

The system **must hold multiple ship-to addresses** per customer. This is a **convenience for input**: when creating a purchase, the user picks from the customer's saved addresses (e.g. Home, Work). Each row is one address for that customer.

- **Links:** customer_id (FK to customer)
- **Address:** addr line 1, addr line 2, city, state/province, country, postal code
- **Optional:** label (e.g. "Home", "Work") to help the user choose when creating an order
- **Audit:** created_at, updated_at

**Purchase/shipment table (e.g. customer_purchases or sales)**

The purchase record **holds all data as it appeared at the time** of the sale. When the user picks a customer and (optionally) one of their addresses, the app copies that address — and the customer name — onto the purchase record at save time. So the purchase is a **snapshot**: invoices and thank-you notes always show what was actually used then; later changes to the customer or their addresses do not change past orders.

- **Links:** customer_id (FK to customer), **customer_address_id** (optional FK — which address was picked, for convenience; the canonical data is the snapshot below), inventory_id (FK to inventory — “item purchased”). **Order grouping (optional):** Add an **order_id** (or local_receipt_id) column so multiple purchase rows can belong to the same order (one row per item). Etsy receipt ID groups Etsy orders; for manual orders the app assigns a local order id when creating a “New order.” Thank-you note and invoice are generated per order (all purchase rows with the same order_id); see ADR-006.
- **Snapshot (stored on this record):** **Ship-to name** (first name, last name as at time of purchase), **Ship-to address** (addr line 1, addr line 2, city, state/province, country, postal code as at time of purchase). These are copied from the customer and chosen address when the purchase is saved.
- **Date:** date of purchase (and optionally shipping date if not on inventory)
- **Discount:** **discount amount** (e.g. currency amount applied to this sale) — identified per sale so invoices and reports show the discount for each transaction
- **Optional:** Etsy receipt/order ID for linking to Etsy
- **Optional:** notes
- **Audit:** created_at

“Item purchased” and “date” are stored on this purchase record; the full ship-to name and address as they were at the time are stored on this purchase record (snapshot). Every field listed for “customer inventory” is stored in the database.

## Consequences

- **Positive**
  - Purchase record holds a **snapshot** of ship-to name and address at time of sale; invoices and history stay correct even if the customer or their addresses change later.
  - One place for customer name; multiple addresses per customer as a convenience for input (user picks when entering a purchase).
  - Clear relationship: **one customer (person) → many addresses, many purchases** → many inventory items; supports discounts and repeat-customer visibility.
  - Discount amount per sale keeps invoices and reports accurate.
  - Supports reports (thank you note, invoice, sales) and future features (e.g. marking shipped, shipper per shipment).
- **Negative**
  - Slightly more schema (customer_address table) and UI to pick address when creating an order; acceptable for correct modeling.

## Notes

- Shipping cost and shipper are stored on the purchase/shipment record (ADR-004), not only on inventory.
- Customer data may be initially populated from Etsy orders and then edited or extended in-app.

### Schema mapping (updated 2026-05-24)

The concepts in this ADR map to the implementation schema as follows (see ADR-017 for canonical DDL):

| ADR-003 concept | Implementation table | Notes |
|-----------------|---------------------|-------|
| Customer table | `customers` | Flat address (billing fields inline), plus `phone`, `notes`. No `default_address_id` or `currency_code` in v1. |
| Customer_address table | `addresses` | Ship-to addresses. Column names: `first_line`, `second_line`, `state` (not `address_line_1`, `state_province`). |
| Purchase/shipment table | `orders` + `order_items` | `orders` holds header, ship-to snapshot, shipping, payment. `order_items` holds line items (inventory_id, quantity, unit_price, line_total). |
| order_id grouping | `orders.order_number` | Each `orders` row IS the order. Line items are in `order_items`. |
| date_of_purchase | `orders.order_date` | |
| shipping_cost (seller) | `orders.seller_shipping_cost` | |
| discount_amount | `orders.discount_total` | |

The snapshot principle (ship-to address copied at order time) and the one-customer-many-addresses design remain unchanged from this ADR.
