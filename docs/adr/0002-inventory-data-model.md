# ADR-002: Inventory data model and fields

## Status

Accepted

## Date

2025-02-15

## Context

The application must track sellable items with full financial and operational detail: identification, description, costs, revenue, dates, pictures, and optional categorization. “Other costs” can be multiple line items per item (each with a description), so they need a flexible structure.

## Decision

**Primary table: Inventory (one row per item)**

Store the following in the database:

- **Identity:** item number
- **Description:** description (text)
- **Financial:** purchase cost, shipping cost, sale revenue
- **Dates:** date of purchase, date of sale, shipping date
- **Media:** picture 1 through picture 10 (stored as paths or URLs in the database; files stored on disk or object storage)
- **Status:** e.g. In stock, Listed, Sold, Reserved, Retired
- **Optional:** Etsy listing ID (for linking to Etsy), quantity (default 1), category/tags, notes
- **Audit:** created_at, updated_at

**Other costs**

- Use a **separate table** (e.g. `inventory_other_costs`) for “other costs” so each item can have multiple cost lines.
- Each row: reference to inventory item, **amount**, **description** (text), and optional created_at.
- This supports multiple entries such as “Repair $5”, “Cleaning $2”, etc., all stored in the database.

## Consequences

- **Positive**
  - All requested inventory fields are in the database.
  - Other costs are flexible and queryable (e.g. total “other” costs per item or across items).
  - Pictures are referenced in the DB; actual files can be stored in a consistent location (e.g. by item id).
- **Negative**
  - Ten picture columns (or a normalized picture table) adds some schema size; we accepted this for simplicity of “pictures 1–10”.

## Notes

- Shipper is not on inventory; it is on the purchase/shipment record (see ADR-004).
- Sale revenue and dates may be filled when an item is sold and linked to a customer purchase.
