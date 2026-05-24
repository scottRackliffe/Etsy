# ADR-017: Database schema — canonical definition (no ambiguity)

## Status

Accepted

## Date

2025-02-15

## Context

The application stores all data in a SQLite database (ADR-001, ADR-012). The data model is defined across ADR-002 (inventory), ADR-003 (customer, address, purchase), ADR-004 (shipper and shipping cost on purchase), ADR-007 (auth/session), and ADR-008 (storage scope). There must be a single, unambiguous schema so implementers build exactly one structure with no guessing. This ADR is the **canonical schema** for the whole system, including Etsy linkage and auth/session persistence.

## Decision

The database consists of exactly the following tables, columns, types, and indexes. All definitions are mandatory unless marked optional in the table. SQLite is the target (ADR-012); types are SQLite types. Date columns use **TEXT** in ISO 8601 date format `YYYY-MM-DD`; timestamp columns (created_at, updated_at) use **TEXT** in ISO 8601 format (e.g. `YYYY-MM-DDTHH:MM:SSZ` or equivalent). Monetary amounts use **REAL**. Booleans use **INTEGER** (0 = false, 1 = true).

---

### 1. Table: `inventory`

One row per inventory item. Source: ADR-002.

| Column              | Type    | Constraints               | Source / notes                                                                                                  |
| ------------------- | ------- | ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| id                  | INTEGER | PRIMARY KEY AUTOINCREMENT | Surrogate key.                                                                                                  |
| item_number         | TEXT    | NOT NULL, UNIQUE          | Required, unique (ADR-002).                                                                                     |
| description         | TEXT    | —                         | Item description.                                                                                               |
| purchase_cost       | REAL    | —                         | Cost to acquire.                                                                                                |
| shipping_cost       | REAL    | —                         | Item-level shipping cost (cost of goods).                                                                       |
| sale_revenue        | REAL    | —                         | Revenue when sold; used for income reports (ADR-006).                                                           |
| date_purchased      | TEXT    | —                         | Date acquired; format YYYY-MM-DD.                                                                               |
| date_listed         | TEXT    | —                         | Date listed for sale (e.g. on Etsy).                                                                            |
| date_of_sale        | TEXT    | —                         | Date sold.                                                                                                      |
| shipping_date       | TEXT    | —                         | Date shipped (optional on inventory when also on purchase).                                                     |
| picture_1           | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| picture_2           | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| picture_3           | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| picture_4           | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| picture_5           | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| picture_6           | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| picture_7           | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| picture_8           | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| picture_9           | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| picture_10          | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| thumbnail_path      | TEXT    | —                         | Picture icon for pick lists; created at item entry or first picture (ADR-002, ADR-015). Null if no picture yet. |
| condition_code      | TEXT    | —                         | One of: Mint/Near Mint, Excellent, Very Good, Good, Fair/As-Is (ADR-002).                                       |
| has_condition_issue | INTEGER | —                         | 0 or 1; true if item has blemish/issue to document.                                                             |
| condition_notes     | TEXT    | —                         | Optional flaw description.                                                                                      |
| condition_picture_1 | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| condition_picture_2 | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| condition_picture_3 | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| condition_picture_4 | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| condition_picture_5 | TEXT    | —                         | Path or URL; null if empty.                                                                                     |
| status              | TEXT    | —                         | One of: Draft, In stock, Listed, Sold, Reserved, Retired (ADR-002).                                             |
| etsy_listing_id     | TEXT    | —                         | Optional; Etsy listing ID for linking to Etsy.                                                                  |
| quantity            | INTEGER | —                         | Default 1.                                                                                                      |
| category_tags       | TEXT    | —                         | Optional; category or tags.                                                                                     |
| listing_title       | TEXT    | —                         | Etsy listing title (AI-generated or manual); required before List on Etsy.                                      |
| listing_description | TEXT    | —                         | Etsy listing description (AI-generated or manual); required before List on Etsy.                                |
| listing_tags        | TEXT    | —                         | Etsy listing tags (comma-separated or equivalent); required before List on Etsy.                                |
| is_listed           | INTEGER | DEFAULT 0                | Boolean flag (0/1). Set to 1 only after confirmed successful Etsy publish.                                      |
| notes               | TEXT    | —                         | Optional.                                                                                                       |
| created_at          | TEXT    | —                         | ISO 8601 timestamp.                                                                                             |
| updated_at          | TEXT    | —                         | ISO 8601 timestamp.                                                                                             |

---

### 2. Table: `inventory_other_cost`

One row per “other cost” line for an inventory item (e.g. Repair $5, Cleaning $2). Source: ADR-002.

| Column       | Type    | Constraints                        | Source / notes             |
| ------------ | ------- | ---------------------------------- | -------------------------- |
| id           | INTEGER | PRIMARY KEY AUTOINCREMENT          | Surrogate key.             |
| inventory_id | INTEGER | NOT NULL, REFERENCES inventory(id) | FK to inventory.           |
| amount       | REAL    | NOT NULL                           | Cost amount.               |
| description  | TEXT    | NOT NULL                           | e.g. "Repair", "Cleaning". |
| created_at   | TEXT    | —                                  | Optional (ADR-002).        |

---

### 3. Table: `customers`

One row per person (not per order). Source: ADR-003. Customer country = billing address country; if no billing address, US. Currency = from billing country mapping; default USD (design-decisions-implementation §2, §3). **Note:** Implementation uses table name `customers` (plural); ADR-017 originally used `customer`.

| Column             | Type    | Constraints                     | Source / notes                                                                 |
| ------------------ | ------- | ------------------------------- | ------------------------------------------------------------------------------ |
| id                 | INTEGER | PRIMARY KEY AUTOINCREMENT       | Surrogate key.                                                                 |
| first_name         | TEXT    | —                               | Customer first name.                                                           |
| last_name          | TEXT    | —                               | Customer last name.                                                            |
| email              | TEXT    | —                               | Optional (e.g. from Etsy).                                                     |
| default_address_id | INTEGER | REFERENCES customer_address(id) | Billing/default address; customer country = that address’s country; null → US. |
| currency_code      | TEXT    | —                               | Effective currency (e.g. USD); set from billing country; default USD.          |
| is_active          | INTEGER | —                               | 1 = active, 0 = inactive (inactivated by maintenance). Default 1.              |
| created_at         | TEXT    | —                               | ISO 8601 timestamp.                                                            |
| updated_at         | TEXT    | —                               | ISO 8601 timestamp.                                                            |

---

### 4. Table: `addresses`

Multiple rows per customer; each row is one ship-to address. Source: ADR-003. **Note:** Implementation uses table name `addresses` with column names `first_line`/`second_line`/`state` (vs. ADR-017 original `address_line_1`/`address_line_2`/`state_province`). The implementation column names are canonical.

| Column         | Type    | Constraints                       | Source / notes                 |
| -------------- | ------- | --------------------------------- | ------------------------------ |
| id             | INTEGER | PRIMARY KEY AUTOINCREMENT         | Surrogate key.                 |
| customer_id    | INTEGER | NOT NULL, REFERENCES customer(id) | FK to customer.                |
| address_line_1 | TEXT    | —                                 | Address line 1.                |
| address_line_2 | TEXT    | —                                 | Address line 2; optional.      |
| city           | TEXT    | —                                 | City.                          |
| state_province | TEXT    | —                                 | State or province.             |
| country        | TEXT    | —                                 | Country.                       |
| postal_code    | TEXT    | —                                 | Postal code.                   |
| label          | TEXT    | —                                 | Optional; e.g. "Home", "Work". |
| created_at     | TEXT    | —                                 | ISO 8601 timestamp.            |
| updated_at     | TEXT    | —                                 | ISO 8601 timestamp.            |

---

### 5. Table: `orders`

One row per sales order. Holds ship-to snapshot and shipping/payment state. Line items are in `order_items`. Source: ADR-003, ADR-004, ADR-019.

**Note (updated 2026-05-24):** The original ADR-017 used a single `purchase` table. The implementation uses a three-table model (`orders` + `order_items` + `purchases`). This update aligns the canonical schema with the implementation. See `documents/database/SCHEMA_RECONCILIATION.md` for migration details.

| Column                        | Type    | Constraints                        | Source / notes                                                                                                                                         |
| ----------------------------- | ------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| id                            | INTEGER | PRIMARY KEY AUTOINCREMENT          | Surrogate key.                                                                                                                                         |
| order_id                      | TEXT    | NOT NULL                           | Groups rows into one order. For Etsy: use Etsy receipt ID; for manual: app-generated id (e.g. UUID). One invoice/thank-you per order_id (ADR-003).     |
| customer_id                   | INTEGER | NOT NULL, REFERENCES customer(id)  | FK to customer.                                                                                                                                        |
| customer_address_id           | INTEGER | —                                  | Optional FK to customer_address (which address was picked); canonical data is snapshot below.                                                          |
| inventory_id                  | INTEGER | NOT NULL, REFERENCES inventory(id) | Item purchased.                                                                                                                                        |
| ship_to_first_name            | TEXT    | —                                  | Snapshot: first name at time of purchase.                                                                                                              |
| ship_to_last_name             | TEXT    | —                                  | Snapshot: last name at time of purchase.                                                                                                               |
| ship_to_address_line_1        | TEXT    | —                                  | Snapshot: address line 1.                                                                                                                              |
| ship_to_address_line_2        | TEXT    | —                                  | Snapshot: address line 2.                                                                                                                              |
| ship_to_city                  | TEXT    | —                                  | Snapshot: city.                                                                                                                                        |
| ship_to_state_province        | TEXT    | —                                  | Snapshot: state/province.                                                                                                                              |
| ship_to_country               | TEXT    | —                                  | Snapshot: country.                                                                                                                                     |
| ship_to_postal_code           | TEXT    | —                                  | Snapshot: postal code.                                                                                                                                 |
| date_of_purchase              | TEXT    | —                                  | Date of purchase; format YYYY-MM-DD.                                                                                                                   |
| shipping_date                 | TEXT    | —                                  | Optional; date shipped.                                                                                                                                |
| was_paid                      | INTEGER | —                                  | 0 or 1; “Mark as paid” sets to 1 (ADR-020, ADR-021). Default 0.                                                                                        |
| order_status                  | TEXT    | —                                  | One of: active, void, cancelled. Default active. Void/cancel: exclude from revenue/active reports; no row delete.                                      |
| discount_amount               | REAL    | —                                  | Discount applied to this sale (ADR-003).                                                                                                               |
| etsy_receipt_id               | TEXT    | —                                  | Optional; Etsy receipt ID for linking to Etsy (ADR-003).                                                                                               |
| notes                         | TEXT    | —                                  | Optional.                                                                                                                                              |
| shipper                       | TEXT    | —                                  | One of: USPS, UPS, FedEx, DHL, Other (ADR-004).                                                                                                        |
| shipping_cost                 | REAL    | —                                  | Seller’s actual shipping cost (what seller pays carrier) for this shipment (ADR-004).                                                                  |
| shipped_without_paid_override | INTEGER | —                                  | 0 or 1. Set to 1 when user marks order as shipped via "Ship anyway" despite order not paid (ADR-021). Default 0. Audit only; does not change was_paid. |
| created_at                    | TEXT    | —                                  | ISO 8601 timestamp.                                                                                                                                    |

---

### 6. Table: `settings`

Key-value store for app configuration that must persist (ADR-008, ADR-009). App/session and OAuth records are SQLite-backed; cookies carry only opaque session ids (ADR-007).

| Column | Type | Constraints | Source / notes                                |
| ------ | ---- | ----------- | --------------------------------------------- |
| key    | TEXT | PRIMARY KEY | Setting name.                                 |
| value  | TEXT | —           | Setting value (string; app parses as needed). |

**Known keys (semantics; not an exhaustive list):**

| key                          | Meaning                                                                                          | Example value                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| panel_layout                 | Which side is commands vs outstanding                                                            | "commands_left" or "commands_right"                                                 |
| default_shipper              | Default carrier for new shipments                                                                | "USPS", "UPS", "FedEx", "DHL", "Other"                                              |
| currency_code                | Single app currency (ADR-008)                                                                    | "USD"                                                                               |
| business_name                | Business name for invoices                                                                       | "Trudy's Classic Treasures"                                                         |
| business_logo_path           | Path to user's logo (stored in system); used in documents (invoices, thank-you, reports, labels) | Path, e.g. "system/logo.png" or "system/assets/logo.png"; empty/null if no logo set |
| business_address_line_1      | Business address for invoices                                                                    | "123 Main St"                                                                       |
| business_address_line_2      | Business address line 2                                                                          | "" or null                                                                          |
| business_city                | Business city                                                                                    | "Anytown"                                                                           |
| business_state_province      | Business state/province                                                                          | "CA"                                                                                |
| business_country             | Business country                                                                                 | "US"                                                                                |
| business_postal_code         | Business postal code                                                                             | "12345"                                                                             |
| pictures_matter_url          | Optional; "Why pictures matter" link                                                             | URL or path                                                                         |
| tutorial_system_folder_path  | Optional; custom tips-folder path for tutorial files                                             | Path                                                                                |
| last_etsy_sync_at            | Last successful Etsy sync datetime (ISO 8601)                                                    | "2025-02-15T10:30:00Z"                                                              |
| default_picture_directory    | Remembered directory for bulk picture import                                                     | Path                                                                                |
| thumbnail_size               | User preference: small / medium / large or max dimension                                         | e.g. "200" or "medium"                                                              |
| outstanding_sort_1_field     | First sort field for outstanding list                                                            | e.g. "date", "type", "customer_name"                                                |
| outstanding_sort_1_direction | First sort direction                                                                             | "asc" or "desc"                                                                     |
| outstanding_sort_2_field     | Second sort field                                                                                | —                                                                                   |
| outstanding_sort_2_direction | Second sort direction                                                                            | "asc" or "desc"                                                                     |
| outstanding_sort_3_field     | Third sort field                                                                                 | —                                                                                   |
| outstanding_sort_3_direction | Third sort direction                                                                             | "asc" or "desc"                                                                     |
| date_format                  | User preference for date display                                                                 | e.g. "YYYY-MM-DD", "MM/DD/YYYY"                                                     |
| first_day_of_week            | First day of week for calendars                                                                  | 0=Sun, 1=Mon, etc.                                                                  |
| backup_directory             | Path for automated backups                                                                       | Path                                                                                |
| backup_schedule              | Optional; backup interval (e.g. daily)                                                           | e.g. "daily"                                                                        |
| shipping_info_usps           | Shipping Info for USPS (data needed for label: account number, return address, etc.)             | Structured value per documents/shipping-label-carrier-templates.md                  |
| shipping_info_ups            | Shipping Info for UPS                                                                            | Same                                                                                |
| shipping_info_fedex          | Shipping Info for FedEx                                                                          | Same                                                                                |
| shipping_info_dhl            | Shipping Info for DHL                                                                            | Same                                                                                |
| shipping_info_other          | Shipping Info for Other carrier                                                                  | Same                                                                                |
| etsy_access_token_encrypted  | Current Etsy access token (encrypted)                                                            | Encrypted string/blob                                                               |
| etsy_refresh_token_encrypted | Current Etsy refresh token (encrypted)                                                           | Encrypted string/blob                                                               |
| etsy_token_expires_at        | Access token expiry timestamp (ISO 8601)                                                         | "2026-02-16T10:30:00Z"                                                              |
| session_id_current           | Current opaque session id bound to auth/session record                                           | Opaque id string                                                                    |

---

### 7. Indexes (ADR-014)

Indexes are part of the initial schema. Index names are defined in the DDL below (e.g. `idx_purchase_date_of_purchase`); the following columns must be indexed.

- **purchase:** `date_of_purchase` (date-range reports, MTD/YTD); `customer_id` (purchases by customer, thank-you/invoice); `shipper` (postal-by-vendor report); optionally `order_id` (grouping for invoice/thank-you).
- **inventory:** `date_of_sale` (or equivalent date column used in reports); `id` is primary key (joins). Optionally `item_number` (unique already gives lookup).
- **customer:** `id` is primary key. Optionally `first_name`, `last_name`, or `email` if search by name/email is implemented.
- **inventory_other_cost:** `inventory_id` (FK; joins to inventory).

---

### 8. SQLite DDL (exact, no ambiguity)

The following SQL is the canonical schema. Implementations must create the same tables and indexes (names and types may not be changed without updating this ADR).

```sql
-- 1. inventory (ADR-002)
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
  quantity INTEGER,
  category_tags TEXT,
  listing_title TEXT,
  listing_description TEXT,
  listing_tags TEXT,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- 2. inventory_other_cost (ADR-002)
CREATE TABLE inventory_other_cost (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_id INTEGER NOT NULL REFERENCES inventory(id),
  amount REAL NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT
);

-- 3. customer (ADR-003)
CREATE TABLE customer (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  default_address_id INTEGER REFERENCES customer_address(id),
  currency_code TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT
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

-- 5. orders (ADR-003, ADR-004, ADR-019)
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

-- 5c. purchases — vendor sourcing (ADR-002)
CREATE TABLE purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE RESTRICT,
  vendor_name TEXT,
  purchase_date TEXT,
  purchase_price REAL,
  shipping_price REAL,
  reference_number TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 6. settings (ADR-008, ADR-009)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 7. schema_migrations
CREATE TABLE schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes (ADR-014)
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_order_date ON orders(order_date);
CREATE INDEX idx_orders_was_paid ON orders(was_paid);
CREATE INDEX idx_orders_shipping_date ON orders(shipping_date);
CREATE INDEX idx_orders_etsy_receipt_id ON orders(etsy_receipt_id);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_inventory_id ON order_items(inventory_id);
CREATE INDEX idx_purchases_inventory_id ON purchases(inventory_id);
CREATE INDEX idx_addresses_customer_id ON addresses(customer_id);
CREATE INDEX idx_customers_is_active ON customers(is_active);
CREATE INDEX idx_inventory_date_of_sale ON inventory(date_of_sale);
CREATE INDEX idx_inventory_date_listed ON inventory(date_listed);
CREATE INDEX idx_other_costs_inventory_id ON other_costs(inventory_id);
```

---

### 9. Etsy interface and SQLite persistence reference

- **Stored in DB for Etsy linkage:** `inventory.etsy_listing_id` (link listing to item); `purchase.etsy_receipt_id` (link purchase row to Etsy receipt); `purchase.order_id` can equal Etsy receipt id when order came from Etsy so that one order = one Etsy receipt.
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

- This ADR is the **authoritative** schema. Implementation migrations (e.g. SQLite CREATE TABLE and CREATE INDEX statements) must match this definition. Any divergence (e.g. extra columns for internal use) should be documented and not conflict with this definition.
- Date/time format: use consistent ISO 8601 TEXT so sorting and reporting are correct across the app.
- Currency: app default/reporting currency is `settings.currency_code`. Per-customer currency (`customer.currency_code`) is used for that customer’s invoicing and display; set from billing address country (design-decisions-implementation §3). MTD/YTD and other app-wide monetary aggregates use the app default reporting currency (ADR-006, ADR-008).
- **User logo:** When the user sets or uploads a logo in Config, the app stores the logo file in the **system** (e.g. `system/logo.png` or `system/assets/logo.png`) and sets `settings.business_logo_path` to that path. The logo can then be placed on invoices, thank-you notes, reports, and labels. If unset or missing file, documents render without a logo.
