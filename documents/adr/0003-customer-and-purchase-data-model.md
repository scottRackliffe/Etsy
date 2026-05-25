# ADR-003: Customer and customer-purchase data model

## Status

Accepted

## Date

2025-02-15

## Context

The application must maintain a “customer inventory”: who bought what, when, and where to ship. We need customer identity, full address, and a link to the item(s) purchased and date(s). Data should support thank-you notes, invoices, and sales reporting. A **person can have multiple purchases** over time; linking those to one customer record supports loyalty, repeat-customer reporting, and discounts. The same person may have **multiple ship-to addresses** (e.g. home, work, gift recipient); the system **must hold multiple ship-to addresses** per customer as a **convenience for input** (user picks from existing addresses when entering a purchase). The **purchase record must hold all data as it appeared at the time** — including which address was used and the full ship-to details — so invoices and history stay correct even if the customer or their addresses change later. Each sale should record any **discount amount** applied so invoices and reports are accurate.

## Decision

> **Terminology (2026-05-24):** **Customer sale** = `orders` + `order_items`. **Vendor buy** = `purchases` table (inventory sourcing only). Canonical DDL: ADR-017.

**`customers` table (one row per person)**

One row per buyer. Multiple orders and multiple ship-to addresses link via `customer_id`.

- **Identity:** `first_name`, `last_name`, optional `email`, `phone`
- **Primary/billing address (v1):** flat fields `address_1`, `address_2`, `city`, `state`, `postal_code`, `country` on the customer row
- **Optional:** `notes`, `currency_code` (display; v1 ops use USD)
- **Audit:** `created_at`, `updated_at`

**`addresses` table (multiple ship-to rows per customer)**

Convenience for input when creating orders. User may pick a saved address; the order still stores a **snapshot** on `orders`.

- **Links:** `customer_id` → `customers`
- **Fields:** `first_line`, `second_line`, `city`, `state`, `postal_code`, `country`, optional `label`, `is_default`
- **Audit:** `created_at`, `updated_at`

**`orders` table (customer sale header)**

Holds payment, shipping, totals, and **ship-to snapshot** at time of sale. Invoices and thank-you notes read from `orders` + `order_items`, not live customer/address rows.

- **Links:** `customer_id` (nullable for guest Etsy orders), optional `etsy_receipt_id`
- **Snapshot:** `ship_to_first_name`, `ship_to_last_name`, `ship_to_address_line_1`, `ship_to_address_line_2`, `ship_to_city`, `ship_to_state_province`, `ship_to_country`, `ship_to_postal_code`
- **Dates / money:** `order_date`, `subtotal`, `discount_total`, `shipping_total`, `tax_total`, `grand_total`, `seller_shipping_cost` (ADR-004)
- **Status:** `order_status` (active | void | cancelled), `was_paid`, `payment_status`, `shipper`, `shipping_date`, `tracking_number`
- **Audit:** `created_at`, `updated_at`

**`order_items` table (line items)**

One row per item sold on an order.

- **Links:** `order_id` → `orders`, `inventory_id` → `inventory`
- **Fields:** `quantity`, `unit_price`, `line_total`
- **Audit:** `created_at`, `updated_at`

Thank-you note and invoice are generated **per order** (all `order_items` for that `orders.id`). See ADR-006.

## Consequences

- **Positive**
  - `orders` row holds a **snapshot** of ship-to name and address at time of sale; invoices and history stay correct even if the customer or their addresses change later.
  - One place for customer name; multiple `addresses` rows per customer as a convenience for input (user picks when creating an order).
  - Clear relationship: **one customer → many addresses, many orders** → many inventory items; supports discounts and repeat-customer visibility.
  - Discount amount per sale keeps invoices and reports accurate.
  - Supports reports (thank you note, invoice, sales) and future features (e.g. marking shipped, shipper per shipment).
- **Negative**
  - Slightly more schema (`addresses` table) and UI to pick address when creating an order; acceptable for correct modeling.

## Notes

- Shipping cost and shipper are stored on the `orders` row (ADR-004), not only on inventory.
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
