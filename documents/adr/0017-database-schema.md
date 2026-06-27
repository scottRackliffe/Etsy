# ADR-017: Database schema — canonical definition (no ambiguity)

## Status

Accepted

## Date

2025-02-15 (canonical DDL reconciled 2026-05-24; extended for ADR-038–069)

## Context

The application stores all data in a SQLite database (ADR-001, ADR-012). The data model is defined across ADR-002 (inventory), ADR-003 (customer, address, orders), ADR-004 (shipper and shipping cost on orders), ADR-007 (auth/session), ADR-008 (storage scope), and feature ADRs through **ADR-069**. There must be a single, unambiguous schema so implementers build exactly one structure with no guessing. This ADR is the **canonical schema** for the whole system, including Etsy linkage and auth/session persistence.

**Customer sales** use `orders` + `order_items`. **Vendor sourcing** (what Trudy bought to resell) uses `purchases`. Do not use `purchases` for Etsy/customer sales.

## Decision

The database consists of exactly the following tables, columns, types, and indexes. All definitions are mandatory unless marked optional in the table. SQLite is the target (ADR-012); types are SQLite types. Date columns use **TEXT** in ISO 8601 date format `YYYY-MM-DD`; timestamp columns (created_at, updated_at) use **TEXT** in ISO 8601 format (e.g. `YYYY-MM-DDTHH:MM:SSZ` or equivalent). Monetary amounts use **REAL**. Booleans use **INTEGER** (0 = false, 1 = true).

---

### 1. Table: `inventory`

One row per inventory item. Source: ADR-002.

| Column                         | Type    | Constraints               | Source / notes                                                                                                  |
| ------------------------------ | ------- | ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| id                             | INTEGER | PRIMARY KEY AUTOINCREMENT | Surrogate key.                                                                                                  |
| item_number                    | TEXT    | NOT NULL, UNIQUE          | Required, unique (ADR-002).                                                                                     |
| description                    | TEXT    | —                         | Item description.                                                                                               |
| purchase_cost                  | REAL    | —                         | Cost to acquire.                                                                                                |
| shipping_cost                  | REAL    | —                         | Item-level shipping cost (cost of goods).                                                                       |
| sale_revenue                   | REAL    | —                         | Revenue when sold; used for income reports (ADR-006).                                                           |
| date_purchased                 | TEXT    | —                         | Date acquired; format YYYY-MM-DD.                                                                               |
| date_listed                    | TEXT    | —                         | Date listed for sale (e.g. on Etsy).                                                                            |
| date_of_sale                   | TEXT    | —                         | Date sold.                                                                                                      |
| shipping_date                  | TEXT    | —                         | Date shipped (optional on inventory when also on purchase).                                                     |
| picture_1                      | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| picture_2                      | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| picture_3                      | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| picture_4                      | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| picture_5                      | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| picture_6                      | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| picture_7                      | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| picture_8                      | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| picture_9                      | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| picture_10                     | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| picture_11                     | TEXT    | —                         | Path or URL; null if empty. (Etsy allows up to 20 photos per listing.)                                          |
| picture_12                     | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| picture_13                     | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| picture_14                     | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| picture_15                     | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| picture_16                     | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| picture_17                     | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| picture_18                     | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| picture_19                     | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| picture_20                     | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| video_path                     | TEXT    | —                         | Path to listing video file (MP4/MOV, 5–15 sec). Null if none.                                                   |
| thumbnail_path                 | TEXT    | —                         | Picture icon for pick lists; created at item entry or first picture (ADR-002, ADR-015). Null if no picture yet. |
| condition_code                 | TEXT    | —                         | One of: Mint/Near Mint, Excellent, Very Good, Good, Fair/As-Is (ADR-002).                                       |
| has_condition_issue            | INTEGER | —                         | 0 or 1; true if item has blemish/issue to document.                                                             |
| condition_notes                | TEXT    | —                         | Optional flaw description.                                                                                      |
| condition_picture_1            | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| condition_picture_2            | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| condition_picture_3            | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| condition_picture_4            | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| condition_picture_5            | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| status                         | TEXT    | —                         | One of: Draft, In stock, Listed, Sold, Reserved, Retired (ADR-002).                                             |
| etsy_listing_id                | TEXT    | —                         | Optional; Etsy listing ID for linking to Etsy.                                                                  |
| etsy_when_made                 | TEXT    | —                         | Etsy `when_made` enum per item (e.g. `1970s`, `1980s`). Required before publish. See §1a.                       |
| etsy_taxonomy_id               | INTEGER | —                         | Etsy numeric taxonomy/category ID per item. Required before publish.                                            |
| etsy_who_made                  | TEXT    | —                         | Per-item override for `who_made` (`i_did`, `someone_else`, `collective`). Null = use global default.            |
| etsy_shipping_profile_id       | INTEGER | —                         | Per-item override for shipping profile. Null = use global default.                                              |
| etsy_return_policy_id          | INTEGER | —                         | Per-item override for return policy. Null = use global default.                                                  |
| quantity                       | INTEGER | —                         | Default 1.                                                                                                      |
| category_tags                  | TEXT    | —                         | Optional; comma-separated Etsy-facing category tags.                                                            |
| store_category                 | TEXT    | —                         | User-defined internal store category for reporting/grouping. Single value from `inventory.store_categories`.     |
| materials                      | TEXT    | —                         | JSON array of material strings (e.g. `["ceramic","glaze"]`). Sent to Etsy as `materials[]`.                     |
| item_weight                    | REAL    | —                         | Item weight for shipping calculation. Null if unknown.                                                          |
| item_weight_unit               | TEXT    | —                         | Weight unit: `oz`, `lb`, `g`, `kg`. Default `oz` when weight provided.                                          |
| item_length                    | REAL    | —                         | Item length for shipping. Null if unknown.                                                                      |
| item_width                     | REAL    | —                         | Item width for shipping. Null if unknown.                                                                       |
| item_height                    | REAL    | —                         | Item height for shipping. Null if unknown.                                                                      |
| item_dimensions_unit           | TEXT    | —                         | Dimension unit: `in`, `ft`, `mm`, `cm`, `m`. Default `in` when dimensions provided.                             |
| is_supply                      | INTEGER | DEFAULT 0                 | 0 = finished product, 1 = craft supply. Determines Etsy marketplace section.                                    |
| picture_classifications        | TEXT    | —                         | JSON array of `{slot, type}` objects. Shot types from the shot-type taxonomy (ADR-083). Null if unclassified. |
| listing_title                  | TEXT    | —                         | Etsy listing title (AI-generated or manual); required before List on Etsy.                                      |
| listing_description            | TEXT    | —                         | Etsy listing description (AI-generated or manual); required before List on Etsy.                                |
| listing_tags                   | TEXT    | —                         | Etsy listing tags (comma-separated or equivalent); required before List on Etsy.                                |
| listing_category_path          | TEXT    | —                         | Etsy category path (ADR-085).                                                                                   |
| listing_title_strategy         | TEXT    | —                         | AI-authored listing strategy field (ADR-085).                                                                   |
| listing_product_story          | TEXT    | —                         | AI-authored listing strategy field (ADR-085).                                                                   |
| listing_condition_clarity      | TEXT    | —                         | AI-authored listing strategy field (ADR-085).                                                                   |
| listing_attributes             | TEXT    | —                         | AI-authored listing strategy field (ADR-085).                                                                   |
| listing_pricing_shipping_notes | TEXT    | —                         | AI-authored listing strategy field (ADR-085).                                                                   |
| listing_quality_checklist      | TEXT    | —                         | AI-authored listing strategy field (ADR-085).                                                                   |
| listing_draft_state            | TEXT    | —                         | **DEPRECATED (ADR-085, 2026-06-21):** the ADR-023 draft-state machine is retired; column left in table but no longer read/written. Lifecycle is `listing_phase` (ADR-081). |
| listing_draft_source           | TEXT    | —                         | **DEPRECATED (ADR-085).** Modes retired; not read/written.                                                      |
| listing_export_id              | TEXT    | —                         | **DEPRECATED (ADR-085).** Portable export/import retired; not read/written.                                     |
| listing_approved_at            | TEXT    | —                         | **DEPRECATED (ADR-085).** Approve step retired; publish gate is `listing_phase = 'listing_ready'`.              |
| listing_published_at           | TEXT    | —                         | ISO 8601 timestamp when published to Etsy.                                                                      |
| is_listed                      | INTEGER | DEFAULT 0                 | Boolean flag (0/1). Set to 1 only after confirmed successful Etsy publish.                                      |
| listing_phase                  | TEXT    | —                         | Listing lifecycle phase (ADR-081): needs_data, ready_to_generate, generated, needs_quality_remediation, listing_ready. Derived-but-stored; separate from `status`. |
| listing_source_hash            | TEXT    | —                         | Hash of contributing inputs at generation time, for drift detection (ADR-081).                                  |
| listing_generated_at           | TEXT    | —                         | ISO 8601 timestamp of last successful listing generation (ADR-081).                                             |
| listing_quality_json           | TEXT    | —                         | Cached latest listing-quality result JSON: score, categories, remediation (ADR-082).                            |
| shot_list_json                 | TEXT    | —                         | AI-generated photo shot list JSON: array of {shot_type, name, purpose, pass_spec, tips, required} (ADR-083). `captured` is derived at read time. |
| dimension_annotation_json      | TEXT    | —                         | Confirmed dimensions + rendered measurement-photo metadata (slot, alt_text, optional ruler ref) for re-render (ADR-084). |
| notes                          | TEXT    | —                         | Optional.                                                                                                       |
| created_at                     | TEXT    | —                         | ISO 8601 timestamp.                                                                                             |
| updated_at                     | TEXT    | —                         | ISO 8601 timestamp.                                                                                             |

#### 1a. Etsy `when_made` enum (canonical values)

The `etsy_when_made` column must contain one of these Etsy API enum values:

`made_to_order`, `2020_2026`, `2010_2019`, `2004_2009`, `2000_2003`, `1990s`, `1980s`, `1970s`, `1960s`, `1950s`, `1940s`, `1930s`, `1920s`, `1910s`, `1900s`, `1800s`, `1700s`, `before_1700`

For vintage items (20+ years old as of 2026), the value must be `2004_2009` or earlier. AI Generate (ADR-085) suggests this from photo analysis/research; the operator confirms or overrides.

#### 1b. Etsy `who_made` enum

`i_did`, `someone_else`, `collective`

For vintage/antique resale, the default should be `someone_else`. The global default is stored in `etsy.publish.default_who_made` (settings); per-item override via `etsy_who_made` column.

#### 1c. Publish-time field resolution

At publish time, per-item values take precedence over global settings defaults:

| Field | Per-item column | Global setting fallback | Required for publish |
| --- | --- | --- | --- |
| `who_made` | `inventory.etsy_who_made` | `etsy.publish.default_who_made` | **Yes** (blocks publish; per-item value or global default must resolve and be a valid enum — `validatePublishReadiness`) |
| `when_made` | `inventory.etsy_when_made` | `etsy.publish.default_when_made` | **Yes** (blocks publish) |
| `taxonomy_id` | `inventory.etsy_taxonomy_id` | `etsy.publish.default_taxonomy_id` | **Yes** (blocks publish) |
| `shipping_profile_id` | `inventory.etsy_shipping_profile_id` | `etsy.publish.shipping_profile_id` | Recommended — **warning only, does not block** (per `validatePublishReadiness`) |
| `return_policy_id` | `inventory.etsy_return_policy_id` | `etsy.publish.return_policy_id` | **Yes** (blocks publish) |

---

### 2. Table: `other_costs`

One row per additional cost line for an inventory item (e.g. repair, cleaning). Source: ADR-002, ADR-038. **Canonical table name is `other_costs`** (not `inventory_other_cost`).

| Column       | Type    | Constraints                                          | Source / notes                              |
| ------------ | ------- | ---------------------------------------------------- | ------------------------------------------- |
| id           | INTEGER | PRIMARY KEY AUTOINCREMENT                            | Surrogate key.                              |
| inventory_id | INTEGER | NOT NULL, REFERENCES inventory(id) ON DELETE CASCADE | FK to inventory.                            |
| cost_type    | TEXT    | —                                                    | Category label (e.g. "Repair", "Cleaning"). |
| amount       | REAL    | NOT NULL DEFAULT 0                                   | Cost amount.                                |
| note         | TEXT    | —                                                    | Optional detail.                            |
| created_at   | TEXT    | NOT NULL                                             | ISO 8601 timestamp.                         |
| updated_at   | TEXT    | NOT NULL                                             | ISO 8601 timestamp.                         |

---

### 3. Table: `customers`

One row per person (not per order). Source: ADR-003, ADR-053. Primary/billing address is stored **flat on this row** in v1; additional ship-to addresses use `addresses`.

| Column             | Type    | Constraints               | Source / notes                                                         |
| ------------------ | ------- | ------------------------- | ---------------------------------------------------------------------- |
| id                 | INTEGER | PRIMARY KEY AUTOINCREMENT | Surrogate key.                                                         |
| first_name         | TEXT    | —                         | Customer first name.                                                   |
| last_name          | TEXT    | —                         | Customer last name.                                                    |
| email              | TEXT    | —                         | Optional (e.g. from Etsy).                                             |
| phone              | TEXT    | —                         | Optional phone.                                                        |
| address_1          | TEXT    | —                         | Primary/billing address line 1.                                        |
| address_2          | TEXT    | —                         | Primary/billing address line 2.                                        |
| city               | TEXT    | —                         | City.                                                                  |
| state              | TEXT    | —                         | State or province.                                                     |
| postal_code        | TEXT    | —                         | Postal code.                                                           |
| country            | TEXT    | —                         | Country; default US when empty (ADR-006).                              |
| notes              | TEXT    | —                         | Freeform customer notes (distinct from `customer_notes` log, ADR-065). |
| default_address_id | INTEGER | REFERENCES addresses(id)  | Optional link to default row in `addresses`; may be null in v1.        |
| currency_code      | TEXT    | DEFAULT 'USD'             | Display currency; v1 operations use USD only.                          |
| is_active          | INTEGER | DEFAULT 1                 | 1 = active, 0 = inactive.                                              |
| created_at         | TEXT    | NOT NULL                  | ISO 8601 timestamp.                                                    |
| updated_at         | TEXT    | NOT NULL                  | ISO 8601 timestamp.                                                    |

---

### 4. Table: `addresses`

Multiple rows per customer; each row is one ship-to (or labeled) address. Source: ADR-003, ADR-031.

| Column      | Type    | Constraints                                          | Source / notes                    |
| ----------- | ------- | ---------------------------------------------------- | --------------------------------- |
| id          | INTEGER | PRIMARY KEY AUTOINCREMENT                            | Surrogate key.                    |
| customer_id | INTEGER | NOT NULL, REFERENCES customers(id) ON DELETE CASCADE | FK to customers.                  |
| label       | TEXT    | —                                                    | Optional; e.g. "Home", "Work".    |
| first_line  | TEXT    | —                                                    | Address line 1.                   |
| second_line | TEXT    | —                                                    | Address line 2; optional.         |
| city        | TEXT    | —                                                    | City.                             |
| state       | TEXT    | —                                                    | State or province.                |
| postal_code | TEXT    | —                                                    | Postal code.                      |
| country     | TEXT    | —                                                    | Country.                          |
| is_default  | INTEGER | NOT NULL DEFAULT 0                                   | 1 = default ship-to for customer. |
| created_at  | TEXT    | NOT NULL                                             | ISO 8601 timestamp.               |
| updated_at  | TEXT    | NOT NULL                                             | ISO 8601 timestamp.               |

---

### 5. Table: `orders`

One row per sales order. Holds ship-to snapshot and shipping/payment state. Line items are in `order_items`. Source: ADR-003, ADR-004, ADR-019.

**Note (updated 2026-05-24):** The original ADR-017 used a single `purchase` table. The implementation uses a three-table model (`orders` + `order_items` + `purchases`). This update aligns the canonical schema with the implementation. See `documents/database/SCHEMA_RECONCILIATION.md` for migration details.

| Column                        | Type    | Constraints                                 | Source / notes                                                                                                                              |
| ----------------------------- | ------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| id                            | INTEGER | PRIMARY KEY AUTOINCREMENT                   | Surrogate key.                                                                                                                              |
| order_number                  | TEXT    | UNIQUE                                      | Human-readable order number. For Etsy: use Etsy receipt ID; for manual: app-generated id (ADR-003, ADR-019).                                |
| customer_id                   | INTEGER | REFERENCES customers(id) ON DELETE SET NULL | FK to customers; nullable (e.g. guest checkout from Etsy).                                                                                  |
| order_date                    | TEXT    | —                                           | Date order was placed; format YYYY-MM-DD.                                                                                                   |
| order_status                  | TEXT    | DEFAULT 'active'                            | One of: active, void, cancelled. Void/cancel: exclude from revenue/active reports; no row delete.                                           |
| payment_status                | TEXT    | —                                           | Payment status string (e.g. "paid", "unpaid", "refunded").                                                                                  |
| was_paid                      | INTEGER | DEFAULT 0                                   | 0 or 1; "Mark as paid" sets to 1 (ADR-020, ADR-021).                                                                                        |
| shipper                       | TEXT    | —                                           | One of: USPS, UPS, FedEx, DHL, Other (ADR-004).                                                                                             |
| seller_shipping_cost          | REAL    | —                                           | Seller's actual shipping cost (what seller pays carrier) for this shipment (ADR-004).                                                       |
| tracking_number               | TEXT    | —                                           | Optional carrier tracking number (ADR-031).                                                                                                 |
| shipped_without_paid_override | INTEGER | DEFAULT 0                                   | 0 or 1. Set to 1 when user marks order as shipped via "Ship anyway" despite order not paid (ADR-021). Audit only; does not change was_paid. |
| etsy_receipt_id               | TEXT    | —                                           | Optional; Etsy receipt ID for linking to Etsy (ADR-003, ADR-019).                                                                           |
| shipping_date                 | TEXT    | —                                           | Optional; date shipped; format YYYY-MM-DD.                                                                                                  |
| ship_to_first_name            | TEXT    | —                                           | Snapshot: first name at time of order.                                                                                                      |
| ship_to_last_name             | TEXT    | —                                           | Snapshot: last name at time of order.                                                                                                       |
| ship_to_address_line_1        | TEXT    | —                                           | Snapshot: address line 1.                                                                                                                   |
| ship_to_address_line_2        | TEXT    | —                                           | Snapshot: address line 2.                                                                                                                   |
| ship_to_city                  | TEXT    | —                                           | Snapshot: city.                                                                                                                             |
| ship_to_state_province        | TEXT    | —                                           | Snapshot: state/province.                                                                                                                   |
| ship_to_country               | TEXT    | —                                           | Snapshot: country.                                                                                                                          |
| ship_to_postal_code           | TEXT    | —                                           | Snapshot: postal code.                                                                                                                      |
| subtotal                      | REAL    | —                                           | Sum of line item totals before shipping/tax/discount.                                                                                       |
| shipping_total                | REAL    | —                                           | Shipping amount charged to buyer.                                                                                                           |
| tax_total                     | REAL    | —                                           | Tax collected.                                                                                                                              |
| discount_total                | REAL    | —                                           | Total discount applied to this order.                                                                                                       |
| grand_total                   | REAL    | —                                           | Final total (subtotal + shipping + tax − discount).                                                                                         |
| source_channel                | TEXT    | —                                           | Origin of the order: "etsy" or "manual".                                                                                                    |
| easypost_shipment_id          | TEXT    | —                                           | EasyPost shipment ID for label/refund/tracking lookups (ADR-074).                                                                           |
| label_url                     | TEXT    | —                                           | Local file path to purchased label PDF/PNG (ADR-074).                                                                                       |
| label_format                  | TEXT    | —                                           | Label file format: "pdf", "png", or "html" (legacy). (ADR-074).                                                                            |
| shipping_rate_cents           | INTEGER | —                                           | Postage cost in cents (e.g., 415 = $4.15). Used in profit/cost reports (ADR-074).                                                           |
| shipping_carrier_service      | TEXT    | —                                           | Carrier + service name (e.g., "USPS Ground Advantage"). (ADR-074).                                                                         |
| package_weight_oz             | REAL    | —                                           | Per-order parcel weight in ounces for rate shopping.                                                                                        |
| package_length_in             | REAL    | —                                           | Per-order parcel length in inches.                                                                                                          |
| package_width_in              | REAL    | —                                           | Per-order parcel width in inches.                                                                                                           |
| package_height_in             | REAL    | —                                           | Per-order parcel height in inches.                                                                                                          |
| notes                         | TEXT    | —                                           | Optional.                                                                                                                                   |
| created_at                    | TEXT    | NOT NULL DEFAULT (datetime('now'))          | ISO 8601 timestamp.                                                                                                                         |
| updated_at                    | TEXT    | NOT NULL DEFAULT (datetime('now'))          | ISO 8601 timestamp.                                                                                                                         |

---

### 5b. Table: `order_items`

Line items for a sales order. Source: ADR-003, ADR-019.

| Column       | Type    | Constraints                                           | Source / notes        |
| ------------ | ------- | ----------------------------------------------------- | --------------------- |
| id           | INTEGER | PRIMARY KEY AUTOINCREMENT                             | Surrogate key.        |
| order_id     | INTEGER | NOT NULL, REFERENCES orders(id) ON DELETE CASCADE     | Parent order.         |
| inventory_id | INTEGER | NOT NULL, REFERENCES inventory(id) ON DELETE RESTRICT | Sold inventory item.  |
| quantity     | INTEGER | NOT NULL DEFAULT 1                                    | Line quantity.        |
| unit_price   | REAL    | —                                                     | Price per unit.       |
| line_total   | REAL    | —                                                     | quantity × unit_price |
| created_at   | TEXT    | NOT NULL                                              | ISO 8601 timestamp.   |
| updated_at   | TEXT    | NOT NULL                                              | ISO 8601 timestamp.   |

---

### 5c. Table: `vendors`

Normalized vendor/supplier records. Source: ADR-076.

| Column                  | Type    | Constraints               | Source / notes                                                 |
| ----------------------- | ------- | ------------------------- | -------------------------------------------------------------- |
| id                      | INTEGER | PRIMARY KEY AUTOINCREMENT | Surrogate key.                                                 |
| name                    | TEXT    | NOT NULL, UNIQUE          | Business/vendor name.                                          |
| address_1               | TEXT    |                           | Street address line 1.                                         |
| address_2               | TEXT    |                           | Street address line 2 (optional).                              |
| city                    | TEXT    |                           |                                                                |
| state                   | TEXT    |                           | State / province.                                              |
| postal_code             | TEXT    |                           |                                                                |
| country                 | TEXT    |                           | Default: "US".                                                 |
| contact_person          | TEXT    |                           | Primary contact name.                                          |
| email                   | TEXT    |                           |                                                                |
| phone                   | TEXT    |                           |                                                                |
| website                 | TEXT    |                           | Vendor website or online store URL.                            |
| account_number          | TEXT    |                           | Your account number with this vendor.                          |
| payment_terms           | TEXT    |                           | e.g. "Net 30", "COD", "Prepaid".                               |
| tax_id                  | TEXT    |                           | Vendor EIN / Tax ID (for 1099 reporting).                      |
| is_preferred            | INTEGER | NOT NULL DEFAULT 0        | 1 = preferred/favorite vendor.                                 |
| vendor_category         | TEXT    |                           | e.g. "Estate sale", "Auction house", "Antique mall", "Online". |
| default_shipping_method | TEXT    |                           | How vendor typically ships to you.                             |
| notes                   | TEXT    |                           | Free-text notes about this vendor.                             |
| is_active               | INTEGER | NOT NULL DEFAULT 1        | 1 = active, 0 = inactive (soft-delete).                        |
| created_at              | TEXT    | NOT NULL                  | ISO 8601 timestamp.                                            |
| updated_at              | TEXT    | NOT NULL                  | ISO 8601 timestamp.                                            |

---

### 5d. Table: `purchases` (vendor sourcing only)

What Trudy **bought from vendors** to resell — not customer sales. Source: ADR-002, ADR-076.

| Column           | Type    | Constraints                                           | Source / notes                                        |
| ---------------- | ------- | ----------------------------------------------------- | ----------------------------------------------------- |
| id               | INTEGER | PRIMARY KEY AUTOINCREMENT                             | Surrogate key.                                        |
| inventory_id     | INTEGER | NOT NULL, REFERENCES inventory(id) ON DELETE RESTRICT | FK to inventory.                                      |
| vendor_id        | INTEGER | REFERENCES vendors(id)                                | FK to vendors. Optional for legacy rows (ADR-076).    |
| vendor_name      | TEXT    | —                                                     | Vendor name. Auto-populated from vendors.name if vendor_id set. Kept for backward compat. |
| purchase_date    | TEXT    | —                                                     | YYYY-MM-DD.                                           |
| purchase_price   | REAL    | —                                                     | Item cost.                                            |
| shipping_price   | REAL    | —                                                     | Inbound shipping.                                     |
| reference_number | TEXT    | —                                                     | Optional ref.                                         |
| notes            | TEXT    | —                                                     | Optional.                                             |
| created_at       | TEXT    | NOT NULL                                              | ISO 8601 timestamp.                                   |
| updated_at       | TEXT    | NOT NULL                                              | ISO 8601 timestamp.                                   |

---

### 5e. Table: `customer_notes`

Chronological interaction notes per customer. Source: ADR-065.

| Column      | Type    | Constraints                                          | Source / notes                                                             |
| ----------- | ------- | ---------------------------------------------------- | -------------------------------------------------------------------------- |
| id          | INTEGER | PRIMARY KEY AUTOINCREMENT                            | Surrogate key.                                                             |
| customer_id | INTEGER | NOT NULL, REFERENCES customers(id) ON DELETE CASCADE | FK to customers.                                                           |
| note_text   | TEXT    | NOT NULL                                             | Note body.                                                                 |
| note_type   | TEXT    | NOT NULL DEFAULT 'general'                           | One of: general, shipping_preference, communication, follow_up, complaint. |
| created_at  | TEXT    | NOT NULL                                             | ISO 8601 timestamp.                                                        |

---

### 5f. Table: `activity_log`

Persistent audit trail. Source: ADR-037.

| Column       | Type    | Constraints               | Source / notes                                                               |
| ------------ | ------- | ------------------------- | ---------------------------------------------------------------------------- |
| id           | INTEGER | PRIMARY KEY AUTOINCREMENT | Surrogate key.                                                               |
| action       | TEXT    | NOT NULL                  | Action id (see ADR-037 catalog).                                             |
| entity_type  | TEXT    | —                         | inventory, order, customer, address, setting, listing, sync, backup, system. |
| entity_id    | INTEGER | —                         | Affected record id.                                                          |
| entity_label | TEXT    | —                         | Human-readable label.                                                        |
| detail_json  | TEXT    | —                         | JSON details.                                                                |
| source       | TEXT    | NOT NULL DEFAULT 'user'   | user, system, etsy_sync.                                                     |
| created_at   | TEXT    | NOT NULL                  | ISO 8601 timestamp.                                                          |

---

### 5g. Supporting tables (Etsy, listing workflow, reports)

| Table                      | Purpose                                                                            | Source     |
| -------------------------- | ---------------------------------------------------------------------------------- | ---------- |
| `etsy_receipts`            | Raw Etsy receipt JSON cache (`receipt_id`, `shop_id`, `receipt_json`, `synced_at`) | ADR-019    |
| `listing_exports`          | **RETIRED (ADR-085):** portable export/import removed; table no longer written.    | ADR-023    |
| `listing_imports`          | **RETIRED (ADR-085):** portable export/import removed; table no longer written.    | ADR-023    |
| `listing_publish_previews` | **RETIRED (ADR-085):** publish-preview hash gate removed; table no longer written. | ADR-023    |
| `report_artifacts`         | Generated report metadata (`report_name`, `report_params_json`, paths)             | ADR-013    |
| `etsy_taxonomy_nodes`      | Cached Etsy seller taxonomy (category tree)                                        | ADR-017    |
| `etsy_taxonomy_properties` | Cached Etsy per-category attributes/properties                                     | ADR-017    |
| `schema_migrations`        | Applied migration versions                                                         | migrations |

---

### 6. Table: `settings`

Key-value store for app configuration that must persist (ADR-008, ADR-009). App/session and OAuth records are SQLite-backed; cookies carry only opaque session ids (ADR-007).

| Column | Type | Constraints | Source / notes                                |
| ------ | ---- | ----------- | --------------------------------------------- |
| key    | TEXT | PRIMARY KEY | Setting name.                                 |
| value  | TEXT | —           | Setting value (string; app parses as needed). |

**Known keys (semantics; not an exhaustive list):**

| key                          | Meaning                                                                                                      | Example value                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| panel_layout                 | Which side is commands vs outstanding                                                                        | "commands_left" or "commands_right"                                                 |
| default_shipper              | Default carrier for new shipments                                                                            | "USPS", "UPS", "FedEx", "DHL", "Other"                                              |
| currency_code                | Single app currency (ADR-008). Superseded by `ui.currency_code` (ADR-034); kept for backwards compatibility. | "USD"                                                                               |
| business_name                | Business name for invoices                                                                                   | "Trudy's Classic Treasures"                                                         |
| business_logo_path           | Path to user's logo (stored in system); used in documents (invoices, thank-you, reports, labels)             | Path, e.g. "system/logo.png" or "system/assets/logo.png"; empty/null if no logo set |
| business_address_line_1      | Business address for invoices                                                                                | "123 Main St"                                                                       |
| business_address_line_2      | Business address line 2                                                                                      | "" or null                                                                          |
| business_city                | Business city                                                                                                | "Anytown"                                                                           |
| business_state_province      | Business state/province                                                                                      | "CA"                                                                                |
| business_country             | Business country                                                                                             | "US"                                                                                |
| business_postal_code         | Business postal code                                                                                         | "12345"                                                                             |
| pictures_matter_url          | Optional; "Why pictures matter" link                                                                         | URL or path                                                                         |
| tutorial_system_folder_path  | Optional; custom tips-folder path for tutorial files                                                         | Path                                                                                |
| last_etsy_sync_at            | Last successful Etsy sync datetime (ISO 8601)                                                                | "2025-02-15T10:30:00Z"                                                              |
| default_picture_directory    | Remembered directory for bulk picture import                                                                 | Path                                                                                |
| thumbnail_size               | User preference: small / medium / large or max dimension                                                     | e.g. "200" or "medium"                                                              |
| outstanding_sort_1_field     | First sort field for outstanding list                                                                        | e.g. "date", "type", "customer_name"                                                |
| outstanding_sort_1_direction | First sort direction                                                                                         | "asc" or "desc"                                                                     |
| outstanding_sort_2_field     | Second sort field                                                                                            | —                                                                                   |
| outstanding_sort_2_direction | Second sort direction                                                                                        | "asc" or "desc"                                                                     |
| outstanding_sort_3_field     | Third sort field                                                                                             | —                                                                                   |
| outstanding_sort_3_direction | Third sort direction                                                                                         | "asc" or "desc"                                                                     |
| date_format                  | User preference for date display                                                                             | e.g. "YYYY-MM-DD", "MM/DD/YYYY"                                                     |
| first_day_of_week            | First day of week for calendars                                                                              | 0=Sun, 1=Mon, etc.                                                                  |
| backup_directory             | Path for automated backups                                                                                   | Path                                                                                |
| backup_schedule              | Optional; backup interval (e.g. daily)                                                                       | e.g. "daily"                                                                        |
| shipping_info_usps           | Shipping Info for USPS (data needed for label: account number, return address, etc.)                         | Structured value per documents/shipping-label-carrier-templates.md                  |
| shipping_info_ups            | Shipping Info for UPS                                                                                        | Same                                                                                |
| shipping_info_fedex          | Shipping Info for FedEx                                                                                      | Same                                                                                |
| shipping_info_dhl            | Shipping Info for DHL                                                                                        | Same                                                                                |
| shipping_info_other          | Shipping Info for Other carrier                                                                              | Same                                                                                |
| shipping.default_carrier     | Default carrier for mark-shipped flow (ADR-034)                                                              | "USPS"                                                                              |
| ui.date_format               | User date display format (ADR-034)                                                                           | "MM/DD/YYYY"                                                                        |
| ui.page_size                 | Records per page in lists (ADR-029, ADR-034)                                                                 | "25"                                                                                |
| ui.currency_code             | Display currency (ADR-034)                                                                                   | "USD"                                                                               |
| activity_log.retention_days  | Days to retain activity log entries (ADR-037)                                                                | "365"                                                                               |
| tax.default_rate             | Default sales tax rate for manual orders (ADR-039)                                                           | e.g. "0.0825"                                                                       |
| setup.completed              | First-run wizard completed or skipped (ADR-044)                                                              | "true" or absent                                                                    |
| sync.auto_interval           | Scheduled Etsy sync interval minutes; absent = disabled (ADR-057)                                            | e.g. "60"                                                                           |
| last_integrity_check         | Last SQLite integrity check timestamp (ADR-058)                                                              | ISO 8601                                                                            |
| integrity_warning            | Set when last integrity check failed (ADR-058)                                                               | "true" or absent                                                                    |
| repeat_customer_threshold    | Min orders for repeat badge; v1 default 2 if unset (ADR-066)                                                 | "2"                                                                                 |
| inventory.number_prefix      | Prefix for auto-generated item numbers                                                                       | "ITEM" (default)                                                                    |
| inventory.number_padding     | Zero-padding width for item number sequence (2–6)                                                            | "4" (default)                                                                       |
| inventory.store_categories   | Comma-separated list of user-defined store categories for inventory grouping/reporting                        | e.g. "Glassware,Jewelry,Kitchen"                                                    |
| easypost.api_key_encrypted       | EasyPost API key, encrypted at rest (AES-256-GCM, ADR-074)                                                  | Encrypted string                                                                    |
| easypost.test_api_key_encrypted  | EasyPost test API key (EZTEST…), encrypted at rest (AES-256-GCM)                                            | Encrypted string                                                                    |
| easypost.mode                    | `"production"` (default) or `"test"`; selects which encrypted key is used                                    | "production"                                                                        |
| easypost.address_validation      | Validate ship-to addresses before rate shopping (ADR-074)                                                    | "on" or "off" (default "off")                                                       |
| easypost.label_format            | Shipping label file format (ADR-074)                                                                         | "pdf" (default) or "png"                                                            |
| easypost.label_size              | Shipping label paper size (ADR-074)                                                                          | "4x6" (default) or "letter"                                                         |
| easypost.default_weight_oz       | Default parcel weight in ounces (ADR-074)                                                                    | Numeric string, e.g. "12"                                                           |
| easypost.default_length_in       | Default parcel length in inches (ADR-074)                                                                    | Numeric string, e.g. "8"                                                            |
| easypost.default_width_in        | Default parcel width in inches (ADR-074)                                                                     | Numeric string, e.g. "5"                                                            |
| easypost.default_height_in       | Default parcel height in inches (ADR-074)                                                                    | Numeric string, e.g. "5"                                                            |
| easypost.preferred_carrier       | Preferred carrier for batch operations (ADR-074)                                                             | Carrier name or empty                                                               |
| easypost.preferred_service       | Preferred service level for batch operations (ADR-074)                                                       | Service name or empty                                                               |
| etsy.active_shop_id              | Selected Etsy shop id (ADR-007)                                                                              | Shop id string                                                                      |
| etsy.publish.default_who_made    | Global default `who_made` for Etsy listings; vintage shops should set `someone_else`                         | `someone_else`                                                                      |
| etsy.publish.default_when_made   | Global default `when_made` for Etsy listings (fallback when per-item is null); must be a valid §1a enum value | `2004_2009`                                                                         |
| etsy.publish.default_taxonomy_id | Global default taxonomy ID for Etsy listings (fallback when per-item is null)                                | Numeric Etsy taxonomy ID                                                            |
| etsy.publish.shipping_profile_id | Etsy shipping profile ID (required for physical listings)                                                    | Numeric Etsy profile ID                                                             |
| etsy.publish.return_policy_id    | Etsy return policy ID (required for active listings)                                                         | Numeric Etsy return policy ID                                                       |
| etsy.publish.readiness_state_id  | Etsy readiness/processing state ID                                                                           | Numeric Etsy readiness ID                                                           |
| etsy.publish.image_max_dimension | Max pixel dimension for image upload resize                                                                  | `2000`                                                                              |
| etsy.publish.image_target_dpi    | Target DPI for image upload metadata                                                                         | `300`                                                                               |
| etsy.publish.image_jpeg_quality  | JPEG quality for upload compression                                                                          | `82`                                                                                |
| etsy.publish.allow_partial_image_upload | Allow publish when some images fail upload                                                              | `false`                                                                             |
| etsy.publish.image_upload_attempts | Retry count per image upload                                                                                | `3`                                                                                 |
| etsy.oauth.state                 | OAuth PKCE state (ADR-007)                                                                                   | Opaque string                                                                       |
| etsy.oauth.verifier              | OAuth PKCE verifier (ADR-007)                                                                                | Opaque string                                                                       |
| etsy_access_token_encrypted  | Current Etsy access token (encrypted)                                                                        | Encrypted string/blob                                                               |
| etsy_refresh_token_encrypted | Current Etsy refresh token (encrypted)                                                                       | Encrypted string/blob                                                               |
| etsy_token_expires_at        | Access token expiry timestamp (ISO 8601)                                                                     | "2026-02-16T10:30:00Z"                                                              |
| app.session.current_id       | Current opaque session id (ADR-007)                                                                          | Opaque id string                                                                    |

---

### 6b. Table: `chart_of_accounts`

GAAP chart of accounts for accounting export (ADR-056).

| Column         | Type    | Constraints               | Source / notes                                          |
| -------------- | ------- | ------------------------- | ------------------------------------------------------- |
| id             | INTEGER | PRIMARY KEY AUTOINCREMENT | Surrogate key.                                          |
| acct_number    | TEXT    | NOT NULL, UNIQUE          | GAAP account number (e.g. `1000`).                      |
| account_name   | TEXT    | NOT NULL                  | Human-readable name (e.g. `Cash`).                      |
| account_type   | TEXT    | NOT NULL                  | Asset, Liability, Equity, Revenue, Contra-Revenue, COGS, Expense. |
| normal_balance | TEXT    | NOT NULL                  | `debit` or `credit`.                                    |
| description    | TEXT    |                           | Optional explanation.                                   |
| is_active      | INTEGER | NOT NULL DEFAULT 1        | 1 = active, 0 = inactive.                               |
| created_at     | TEXT    | NOT NULL                  | ISO 8601 timestamp.                                     |
| updated_at     | TEXT    | NOT NULL                  | ISO 8601 timestamp.                                     |

### 6c. Table: `gl_transaction_rules`

GL transaction rules mapping transaction types to debit/credit accounts (ADR-056).

| Column           | Type    | Constraints               | Source / notes                                          |
| ---------------- | ------- | ------------------------- | ------------------------------------------------------- |
| id               | INTEGER | PRIMARY KEY AUTOINCREMENT | Surrogate key.                                          |
| transaction_type | TEXT    | NOT NULL                  | e.g. `Sale`, `Payment`, `COGS`, `Discount`.             |
| description      | TEXT    |                           | Human-readable explanation of the entry.                |
| debit_acct       | TEXT    | NOT NULL                  | References `chart_of_accounts.acct_number`.             |
| credit_acct      | TEXT    | NOT NULL                  | References `chart_of_accounts.acct_number`.             |
| source_table     | TEXT    |                           | Primary table the data comes from.                      |
| source_column    | TEXT    |                           | Column containing the amount.                           |
| is_active        | INTEGER | NOT NULL DEFAULT 1        | 1 = active, 0 = inactive.                               |
| created_at       | TEXT    | NOT NULL                  | ISO 8601 timestamp.                                     |
| updated_at       | TEXT    | NOT NULL                  | ISO 8601 timestamp.                                     |

---

### 6d. Table: `tax_payments`

Tax remittance payments made to tax authorities (ADR-039). Each row is a payment of collected sales tax.

| Column | Type | Constraints | Source / notes |
| ---------------- | ------- | ------------------------------------ | --------------------------------------------------- |
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Surrogate key. |
| payment_date | TEXT | NOT NULL | ISO 8601 date of payment. |
| amount | REAL | NOT NULL | Amount paid. |
| payee | TEXT | | Tax authority name (e.g. "Ohio Dept of Taxation"). |
| reason | TEXT | | Reason / description of payment. |
| period_from | TEXT | | Start of tax period covered. |
| period_to | TEXT | | End of tax period covered. |
| reference_number | TEXT | | Check number, confirmation number, etc. |
| notes | TEXT | | Free-text notes. |
| created_at | TEXT | NOT NULL DEFAULT (datetime('now')) | ISO 8601 timestamp. |

---

### 6e. Table: `receipts`

Vendor purchase receipts — tracks what Trudy bought from vendors (distinct from `etsy_receipts` which caches raw Etsy API data).

| Column | Type | Constraints | Source / notes |
| ---------------- | ------- | ------------------------------------ | --------------------------------------------------- |
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Surrogate key. |
| vendor_name | TEXT | NOT NULL | Vendor / store name (from OCR or manual entry). |
| vendor_id | INTEGER | REFERENCES vendors(id) | FK to normalized vendor record (may be NULL for legacy data). |
| purchase_date | TEXT | | Date of purchase. |
| receipt_image | TEXT | | Path to receipt image file. |
| shipping_price | REAL | | Shipping paid on this receipt. |
| reference_number | TEXT | | Receipt number, order number, etc. |
| notes | TEXT | | Free-text notes. |
| created_at | TEXT | NOT NULL DEFAULT (datetime('now')) | ISO 8601 timestamp. |
| updated_at | TEXT | NOT NULL DEFAULT (datetime('now')) | ISO 8601 timestamp. |

---

### 6f. Table: `receipt_items`

Line items on a vendor purchase receipt. Each item can optionally be linked to an inventory record.

| Column | Type | Constraints | Source / notes |
| ------------ | ------- | -------------------------------------------- | --------------------------------------------------- |
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Surrogate key. |
| receipt_id | INTEGER | NOT NULL, FK → receipts(id) ON DELETE CASCADE | Parent receipt. |
| description | TEXT | NOT NULL | Item description from receipt. |
| cost | REAL | | Item cost. |
| inventory_id | INTEGER | FK → inventory(id) ON DELETE SET NULL | Linked inventory item (NULL = unassigned). |
| created_at | TEXT | NOT NULL DEFAULT (datetime('now')) | ISO 8601 timestamp. |

---

### 6g. Table: `business_expenses`

General business overhead expenses — not directly tied to inventory COGS (ADR-039, Expenses tab). Supports categorization, tax deductibility, recurring tracking, and GL account mapping.

| Column | Type | Constraints | Source / notes |
| ------------------- | ------- | ----------------------------------------- | --------------------------------------------------- |
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Surrogate key. |
| expense_date | TEXT | NOT NULL | Date expense was incurred. |
| date_paid | TEXT | | Date payment was actually made (accrual vs cash). |
| amount | REAL | NOT NULL | Expense amount. |
| currency_code | TEXT | NOT NULL DEFAULT 'USD' | Currency code. |
| payment_method | TEXT | | e.g. "Credit card", "PayPal", "Check". |
| vendor_id | INTEGER | REFERENCES vendors(id) | FK to vendor who was paid. |
| vendor_name | TEXT | | Vendor name (backward compat / OCR fallback). |
| category | TEXT | NOT NULL | Expense category (e.g. "Software & subscriptions"). |
| subcategory | TEXT | | Finer categorization. |
| tax_deductible | INTEGER | NOT NULL DEFAULT 1 | 1 = deductible, 0 = not. |
| tax_category | TEXT | | Schedule C category. |
| business_use_pct | REAL | NOT NULL DEFAULT 100.0 | Percent business use (partial deductions). |
| is_cogs | INTEGER | NOT NULL DEFAULT 0 | 1 = cost of goods sold, 0 = operating expense. |
| is_asset | INTEGER | NOT NULL DEFAULT 0 | 1 = capital asset (not expensed). |
| depreciation_years | INTEGER | | Depreciation schedule for assets. |
| inventory_id | INTEGER | REFERENCES inventory(id) | Link to specific inventory item if applicable. |
| invoice_number | TEXT | | Vendor invoice number. |
| receipt_attached | INTEGER | NOT NULL DEFAULT 0 | 1 = receipt file attached. |
| receipt_path | TEXT | | Path to receipt/invoice file. |
| paid_by | TEXT | | Who made the purchase (Person 1 / Person 2). |
| is_recurring | INTEGER | NOT NULL DEFAULT 0 | 1 = recurring expense. |
| recurring_frequency | TEXT | | e.g. "monthly", "annual", "quarterly". |
| recurring_next_date | TEXT | | Next expected occurrence. |
| contract_end_date | TEXT | | Subscription/contract end date. |
| gl_account | TEXT | | GL account code override (default: 6200 or 5000 if COGS). |
| fiscal_quarter | TEXT | | Fiscal quarter for reporting. |
| notes | TEXT | | Free-text notes. |
| created_at | TEXT | NOT NULL DEFAULT (datetime('now')) | ISO 8601 timestamp. |
| updated_at | TEXT | NOT NULL DEFAULT (datetime('now')) | ISO 8601 timestamp. |

---

### 6h. Table: `communication_log`

Customer-outreach send tracking — payment reminders and thank-you notes. Source: ADR-078.

| Column        | Type    | Constraints                                       | Source / notes                                          |
| ------------- | ------- | ------------------------------------------------- | ------------------------------------------------------- |
| id            | INTEGER | PRIMARY KEY AUTOINCREMENT                          | Surrogate key.                                          |
| message_type  | TEXT    | NOT NULL                                          | `payment_reminder` \| `thank_you` (extensible).         |
| channel       | TEXT    | NOT NULL                                          | `email` \| `print`.                                     |
| order_id      | INTEGER | REFERENCES orders(id) ON DELETE SET NULL          | Related order (nullable).                               |
| customer_id   | INTEGER | REFERENCES customers(id) ON DELETE SET NULL       | Related customer (nullable).                            |
| recipient     | TEXT    | —                                                 | Email address, or `'print'`.                            |
| subject       | TEXT    | —                                                 | Rendered subject.                                       |
| body_snapshot | TEXT    | —                                                 | Rendered body at send time (audit).                     |
| status        | TEXT    | NOT NULL DEFAULT 'queued'                          | `queued` \| `sent` \| `printed` \| `failed`.            |
| error         | TEXT    | —                                                 | Failure detail when `status = 'failed'`.                |
| sent_at       | TEXT    | —                                                 | ISO 8601 when sent/printed.                             |
| created_at    | TEXT    | NOT NULL DEFAULT (datetime('now'))                | ISO 8601 timestamp.                                     |

---

### 7. Indexes (ADR-014)

Indexes are part of the initial schema. Index names are defined in the DDL below.

- **orders:** `order_date`, `customer_id`, `was_paid`, `shipping_date`, `etsy_receipt_id`, `shipper` (postal-by-vendor).
- **order_items:** `order_id`, `inventory_id`.
- **inventory:** `item_number` (unique), `status`, `date_of_sale`, `date_listed`.
- **customers:** `is_active`; optional search indexes on name/email per ADR-029/041.
- **other_costs:** `inventory_id`.
- **addresses:** `customer_id`.
- **customer_notes:** `customer_id`.
- **activity_log:** `created_at`, `(entity_type, entity_id)`, `action`.
- **purchases:** `inventory_id`.
- **vendors:** `name`, `is_active`.
- **tax_payments:** `payment_date`.
- **receipts:** `vendor_id`.
- **business_expenses:** `expense_date`, `category`, `vendor_id`.

---

### 8. SQLite DDL (exact, no ambiguity)

The following SQL is the **canonical schema**. Section §1–§7 narrative tables match this DDL. Implementations must create the same tables and indexes (names and types may not be changed without updating this ADR).

**Implementation note (2026-05-24):** The app bootstraps via `src/lib/sqlite.ts` and `migrations/`. Some columns/tables here (e.g. `tracking_number`, `activity_log`, `customer_notes`) may require a migration before use — add migrations rather than diverging from this DDL.

```sql
PRAGMA foreign_keys = ON;

-- 1. inventory (ADR-002, ADR-023)
CREATE TABLE inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_number TEXT NOT NULL UNIQUE,
  description TEXT,
  purchase_cost REAL,
  shipping_cost REAL,
  sale_revenue REAL,
  date_purchased TEXT,
  date_listed TEXT,
  date_of_sale TEXT,
  shipping_date TEXT,
  picture_1 TEXT,
  picture_2 TEXT,
  picture_3 TEXT,
  picture_4 TEXT,
  picture_5 TEXT,
  picture_6 TEXT,
  picture_7 TEXT,
  picture_8 TEXT,
  picture_9 TEXT,
  picture_10 TEXT,
  picture_11 TEXT,
  picture_12 TEXT,
  picture_13 TEXT,
  picture_14 TEXT,
  picture_15 TEXT,
  picture_16 TEXT,
  picture_17 TEXT,
  picture_18 TEXT,
  picture_19 TEXT,
  picture_20 TEXT,
  video_path TEXT,
  thumbnail_path TEXT,
  condition_code TEXT,
  has_condition_issue INTEGER,
  condition_notes TEXT,
  condition_picture_1 TEXT,
  condition_picture_2 TEXT,
  condition_picture_3 TEXT,
  condition_picture_4 TEXT,
  condition_picture_5 TEXT,
  status TEXT,
  etsy_listing_id TEXT,
  etsy_when_made TEXT,
  etsy_taxonomy_id INTEGER,
  etsy_who_made TEXT,
  etsy_shipping_profile_id INTEGER,
  etsy_return_policy_id INTEGER,
  quantity INTEGER,
  category_tags TEXT,
  store_category TEXT,
  materials TEXT,
  item_weight REAL,
  item_weight_unit TEXT,
  item_length REAL,
  item_width REAL,
  item_height REAL,
  item_dimensions_unit TEXT,
  is_supply INTEGER DEFAULT 0,
  picture_classifications TEXT,
  listing_title TEXT,
  listing_description TEXT,
  listing_tags TEXT,
  listing_category_path TEXT,
  listing_title_strategy TEXT,
  listing_product_story TEXT,
  listing_condition_clarity TEXT,
  listing_attributes TEXT,
  listing_pricing_shipping_notes TEXT,
  listing_quality_checklist TEXT,
  -- DEPRECATED (ADR-085): draft-state machine retired; columns kept for back-compat, not used.
  listing_draft_state TEXT,
  listing_draft_source TEXT,
  listing_export_id TEXT,
  listing_approved_at TEXT,
  listing_published_at TEXT,
  is_listed INTEGER DEFAULT 0,
  listing_phase TEXT,
  listing_source_hash TEXT,
  listing_generated_at TEXT,
  listing_quality_json TEXT,
  shot_list_json TEXT,
  dimension_annotation_json TEXT,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- 2. other_costs (ADR-002, ADR-038)
CREATE TABLE other_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  cost_type TEXT,
  amount REAL NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. customers (ADR-003)
CREATE TABLE customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  address_1 TEXT,
  address_2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT,
  notes TEXT,
  default_address_id INTEGER REFERENCES addresses(id),
  currency_code TEXT DEFAULT 'USD',
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 4. addresses (ADR-003)
CREATE TABLE addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label TEXT,
  first_line TEXT,
  second_line TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 5. orders (ADR-003, ADR-004, ADR-019, ADR-031)
CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT UNIQUE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  order_date TEXT,
  order_status TEXT DEFAULT 'active',
  payment_status TEXT,
  was_paid INTEGER DEFAULT 0,
  shipper TEXT,
  seller_shipping_cost REAL,
  tracking_number TEXT,
  shipped_without_paid_override INTEGER DEFAULT 0,
  etsy_receipt_id TEXT,
  shipping_date TEXT,
  ship_to_first_name TEXT,
  ship_to_last_name TEXT,
  ship_to_address_line_1 TEXT,
  ship_to_address_line_2 TEXT,
  ship_to_city TEXT,
  ship_to_state_province TEXT,
  ship_to_country TEXT,
  ship_to_postal_code TEXT,
  subtotal REAL,
  shipping_total REAL,
  tax_total REAL,
  discount_total REAL,
  grand_total REAL,
  source_channel TEXT,
  easypost_shipment_id TEXT,
  label_url TEXT,
  label_format TEXT,
  shipping_rate_cents INTEGER,
  shipping_carrier_service TEXT,
  package_weight_oz REAL,
  package_length_in REAL,
  package_width_in REAL,
  package_height_in REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 5b. order_items (ADR-003)
CREATE TABLE order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  inventory_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price REAL,
  line_total REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 5c. vendors (ADR-076)
CREATE TABLE vendors (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  name                    TEXT    NOT NULL UNIQUE,
  address_1               TEXT,
  address_2               TEXT,
  city                    TEXT,
  state                   TEXT,
  postal_code             TEXT,
  country                 TEXT    DEFAULT 'US',
  contact_person          TEXT,
  email                   TEXT,
  phone                   TEXT,
  website                 TEXT,
  account_number          TEXT,
  payment_terms           TEXT,
  tax_id                  TEXT,
  is_preferred            INTEGER NOT NULL DEFAULT 0,
  vendor_category         TEXT,
  default_shipping_method TEXT,
  notes                   TEXT,
  is_active               INTEGER NOT NULL DEFAULT 1,
  created_at              TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 5d. purchases — vendor sourcing only (ADR-002, ADR-076)
CREATE TABLE purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE RESTRICT,
  vendor_id INTEGER REFERENCES vendors(id),
  vendor_name TEXT,
  purchase_date TEXT,
  purchase_price REAL,
  shipping_price REAL,
  reference_number TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 5e. customer_notes (ADR-065)
CREATE TABLE customer_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  note_type TEXT NOT NULL DEFAULT 'general',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 5f. activity_log (ADR-037)
CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  entity_label TEXT,
  detail_json TEXT,
  source TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 5f. Etsy receipt cache (ADR-019)
CREATE TABLE etsy_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id TEXT UNIQUE NOT NULL,
  shop_id TEXT NOT NULL,
  receipt_json TEXT NOT NULL,
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 5g. Listing workflow audit (ADR-023) — RETIRED by ADR-085 (no longer written; kept for back-compat)
CREATE TABLE listing_exports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  export_id TEXT UNIQUE NOT NULL,
  inventory_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE listing_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  export_id TEXT,
  payload_json TEXT NOT NULL,
  source_label TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE listing_publish_previews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  preview_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 5h. Report artifacts (ADR-013)
CREATE TABLE report_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_name TEXT NOT NULL,
  report_params_json TEXT NOT NULL,
  artifact_path TEXT,
  artifact_json TEXT,
  generated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 6. settings (ADR-008)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- etsy_taxonomy_nodes — cached Etsy seller taxonomy (category tree)
CREATE TABLE etsy_taxonomy_nodes (
  id INTEGER PRIMARY KEY,
  parent_id INTEGER,
  name TEXT NOT NULL,
  full_path TEXT,
  level INTEGER NOT NULL DEFAULT 0
);

-- etsy_taxonomy_properties — cached Etsy per-category attributes
CREATE TABLE etsy_taxonomy_properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  taxonomy_id INTEGER NOT NULL,
  property_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT,
  is_required INTEGER NOT NULL DEFAULT 0,
  supports_attributes INTEGER NOT NULL DEFAULT 0,
  supports_variations INTEGER NOT NULL DEFAULT 0,
  possible_values_json TEXT,
  scales_json TEXT,
  UNIQUE(taxonomy_id, property_id)
);

-- 7. schema_migrations
CREATE TABLE schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes (ADR-014)
CREATE INDEX idx_inventory_item_number ON inventory(item_number);
CREATE INDEX idx_inventory_status ON inventory(status);
CREATE INDEX idx_inventory_date_of_sale ON inventory(date_of_sale);
CREATE INDEX idx_inventory_date_listed ON inventory(date_listed);
CREATE INDEX idx_other_costs_inventory_id ON other_costs(inventory_id);
CREATE INDEX idx_customers_is_active ON customers(is_active);
CREATE INDEX idx_addresses_customer_id ON addresses(customer_id);
CREATE INDEX idx_customer_notes_customer_id ON customer_notes(customer_id);
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_order_date ON orders(order_date);
CREATE INDEX idx_orders_was_paid ON orders(was_paid);
CREATE INDEX idx_orders_shipping_date ON orders(shipping_date);
CREATE INDEX idx_orders_etsy_receipt_id ON orders(etsy_receipt_id);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_inventory_id ON order_items(inventory_id);
CREATE INDEX idx_purchases_inventory_id ON purchases(inventory_id);
CREATE INDEX idx_etsy_receipts_shop_id ON etsy_receipts(shop_id);
CREATE INDEX idx_listing_exports_inventory_id ON listing_exports(inventory_id);
CREATE INDEX idx_listing_imports_inventory_id ON listing_imports(inventory_id);
CREATE INDEX idx_listing_publish_previews_inventory_id ON listing_publish_previews(inventory_id);
CREATE INDEX idx_activity_log_created_at ON activity_log(created_at);
CREATE INDEX idx_activity_log_entity ON activity_log(entity_type, entity_id);
CREATE INDEX idx_activity_log_action ON activity_log(action);
CREATE INDEX idx_etsy_taxonomy_nodes_parent ON etsy_taxonomy_nodes(parent_id);
CREATE INDEX idx_etsy_taxonomy_properties_taxonomy ON etsy_taxonomy_properties(taxonomy_id);
CREATE INDEX idx_orders_shipper ON orders(shipper);
CREATE INDEX idx_vendors_is_active ON vendors(is_active);
-- Indexes for tax_payments, receipts, receipt_items, and business_expenses are created
-- immediately after their CREATE TABLE statements below (those tables are defined later in
-- this script, so their indexes must follow the table definitions, not precede them).

-- chart_of_accounts (ADR-056)
CREATE TABLE chart_of_accounts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  acct_number    TEXT    NOT NULL UNIQUE,
  account_name   TEXT    NOT NULL,
  account_type   TEXT    NOT NULL,
  normal_balance TEXT    NOT NULL,
  description    TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- gl_transaction_rules (ADR-056)
CREATE TABLE gl_transaction_rules (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_type TEXT    NOT NULL,
  description      TEXT,
  debit_acct       TEXT    NOT NULL,
  credit_acct      TEXT    NOT NULL,
  source_table     TEXT,
  source_column    TEXT,
  is_active        INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 6d. tax_payments (ADR-039)
CREATE TABLE IF NOT EXISTS tax_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_date TEXT NOT NULL,
  amount REAL NOT NULL,
  payee TEXT,
  reason TEXT,
  period_from TEXT,
  period_to TEXT,
  reference_number TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 6e. receipts (vendor purchase receipts)
CREATE TABLE IF NOT EXISTS receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_name TEXT NOT NULL,
  vendor_id INTEGER REFERENCES vendors(id),
  purchase_date TEXT,
  receipt_image TEXT,
  shipping_price REAL,
  reference_number TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 6f. receipt_items
CREATE TABLE IF NOT EXISTS receipt_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  cost REAL,
  inventory_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(receipt_id) REFERENCES receipts(id) ON DELETE CASCADE,
  FOREIGN KEY(inventory_id) REFERENCES inventory(id) ON DELETE SET NULL
);

-- 6g. business_expenses
CREATE TABLE IF NOT EXISTS business_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_date TEXT NOT NULL,
  date_paid TEXT,
  amount REAL NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'USD',
  payment_method TEXT,
  vendor_id INTEGER REFERENCES vendors(id),
  vendor_name TEXT,
  category TEXT NOT NULL,
  subcategory TEXT,
  tax_deductible INTEGER NOT NULL DEFAULT 1,
  tax_category TEXT,
  business_use_pct REAL NOT NULL DEFAULT 100.0,
  is_cogs INTEGER NOT NULL DEFAULT 0,
  is_asset INTEGER NOT NULL DEFAULT 0,
  depreciation_years INTEGER,
  inventory_id INTEGER REFERENCES inventory(id),
  invoice_number TEXT,
  receipt_attached INTEGER NOT NULL DEFAULT 0,
  receipt_path TEXT,
  paid_by TEXT,
  is_recurring INTEGER NOT NULL DEFAULT 0,
  recurring_frequency TEXT,
  recurring_next_date TEXT,
  contract_end_date TEXT,
  gl_account TEXT,
  fiscal_quarter TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for the later-defined tables (must follow their CREATE TABLE statements above)
CREATE INDEX IF NOT EXISTS idx_tax_payments_date ON tax_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_receipts_vendor_id ON receipts(vendor_id);
CREATE INDEX IF NOT EXISTS idx_business_expenses_date ON business_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_business_expenses_category ON business_expenses(category);
CREATE INDEX IF NOT EXISTS idx_business_expenses_vendor_id ON business_expenses(vendor_id);

-- 6h. communication_log (ADR-078) — customer outreach audit (payment reminders, thank-you notes)
CREATE TABLE IF NOT EXISTS communication_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  message_type  TEXT NOT NULL,                  -- payment_reminder | thank_you | (future)
  channel       TEXT NOT NULL,                  -- email | print
  order_id      INTEGER,
  customer_id   INTEGER,
  recipient     TEXT,                           -- email address, or 'print'
  subject       TEXT,
  body_snapshot TEXT,
  status        TEXT NOT NULL DEFAULT 'queued', -- queued | sent | printed | failed
  error         TEXT,
  sent_at       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE SET NULL,
  FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_comm_log_order ON communication_log(order_id);
CREATE INDEX IF NOT EXISTS idx_comm_log_type ON communication_log(message_type);
CREATE INDEX IF NOT EXISTS idx_comm_log_created ON communication_log(created_at);
```

> **§6h `communication_log` (ADR-078):** outreach send tracking. `message_type`:
> `payment_reminder | thank_you` (extensible). `channel`: `email | print`. `status`:
> `queued | sent | printed | failed`. Related `settings` keys (ADR-078 §4–§5, ADR-034):
> `email.smtp_host/port/secure/user`, `email.smtp_pass_encrypted`, `email.from_name`,
> `email.from_address`, `email.enabled`, and `comm.template.<type>.subject|body`.

---

### 9. Etsy interface and SQLite persistence reference

- **Stored in DB for Etsy linkage:** `inventory.etsy_listing_id` (link listing to item); `orders.etsy_receipt_id` (link order row to Etsy receipt); `orders.order_number` can equal Etsy receipt id when order came from Etsy so that one order = one Etsy receipt.
- **Auth/session persistence:** Etsy OAuth token state and session linkage are persisted in SQLite-backed records. HTTP-only cookies carry opaque session ids only.
- **Etsy data persistence:** Etsy shop/receipt data used by application workflows is persisted in SQLite structures as defined by this ADR and ADR-019.

---

## Consequences

- **Positive**
  - Single canonical schema; no ambiguity for implementers.
  - Every table and column is traceable to an ADR.
  - Indexes and Etsy-related columns are explicit.

- **Negative**
  - Schema changes require updating this ADR (or superseding it) and migrations.

## Notes

- This ADR is the **authoritative** schema. Implementation migrations and `src/lib/sqlite.ts` bootstrap must converge to this definition. Any temporary divergence requires a tracked migration in `migrations/` and `documents/database/SCHEMA_RECONCILIATION.md`.
- **`payment_status` on orders:** Typical values `unpaid`, `paid`, `refunded` (ADR-039). Stored as TEXT; validate per ADR-021.
- **`entity_type` in activity_log:** Includes `system` for scheduled sync and integrity events (ADR-057, ADR-058) in addition to ADR-037 catalog types.
- Date/time format: use consistent ISO 8601 TEXT so sorting and reporting are correct across the app.
- Currency: app default/reporting currency is `settings.ui.currency_code` (default USD). For v1, all operations use USD only; multi-currency per customer is a future enhancement. MTD/YTD and other app-wide monetary aggregates use the app default reporting currency (ADR-006, ADR-008).
- **User logo:** When the user sets or uploads a logo in Config, the app stores the logo file in the **system** (e.g. `system/logo.png` or `system/assets/logo.png`) and sets `settings.business_logo_path` to that path. The logo can then be placed on invoices, thank-you notes, reports, and labels. If unset or missing file, documents render without a logo.
