# ADR-021: Validation and business rules (no ambiguity)

## Status

Accepted

## Date

2025-02-15

## Context

When the user creates or updates inventory, customers, addresses, purchases, and settings, the app must enforce validation so data stays consistent and reports are correct. Every required field, format, and cross-field rule must be specified so implementers have no ambiguity.

## Decision

The following rules apply. “Required” means the field must be present and (for strings) non-empty after trim. “Optional” means the field may be null or omitted. API returns 400 (Bad Request) with a clear message when validation fails; the message must identify the field(s) that failed.

**Checks on every add/change:** Every create and update runs validation and **context checks** at save time. Context checks ensure consistency across associated records (e.g. customer_id exists; default_address_id belongs to customer; dates and statuses consistent). **Errors in user terms:** Every error is raised to the user and explained in user terms (e.g. "Please select a customer for this order"). **Auto-correct or what to do next:** For each error, either (1) automatically correct when safe and unambiguous, or (2) tell the user what to do next. When the system does not auto-correct, it may create an outstanding to-do item (ADR-020: validation/context-check issues).

---

### 1. Inventory (ADR-002, ADR-017)

| Field                                                    | Rule                                                                                                                                      | Error message if violated                                  |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| item_number                                              | Required. Non-empty string after trim. Must be unique across all inventory (check on create; on update, uniqueness excludes current row). | “Item number is required.” / “Item number must be unique.” |
| description                                              | Optional. If present, string; max length 2000 characters.                                                                                 | "Description must be 2000 characters or less."             |
| purchase_cost, shipping_cost, sale_revenue               | Optional. If present, must be a number >= 0.                                                                                              | “Amount must be zero or greater.”                          |
| date_purchased, date_listed, date_of_sale, shipping_date | Optional. If present, must be valid date string YYYY-MM-DD (or implementation’s accepted format).                                         | “Invalid date format.”                                     |
| status                                                   | Optional. If present, must be one of: Draft, In stock, Listed, Sold, Reserved, Retired.                                                   | “Invalid status.”                                          |
| condition_code                                           | Optional. If present, must be one of: Mint/Near Mint, Excellent, Very Good, Good, Fair/As-Is.                                             | “Invalid condition code.”                                  |
| has_condition_issue                                      | Optional. If present, 0 or 1 (boolean).                                                                                                   | —                                                          |
| quantity                                                 | Optional. If present, integer >= 1. Default 1.                                                                                            | “Quantity must be at least 1.”                             |
| etsy_listing_id                                          | Optional. String. No format validation.                                                                                                   | —                                                          |

All other inventory fields (pictures, thumbnail, condition_notes, category_tags, notes, etc.): optional; no additional validation beyond type (string, number) where applicable.

---

### 2. Inventory other cost (ADR-002, ADR-017 `other_costs`)

| Field     | Rule                                   | Error message if violated                         |
| --------- | -------------------------------------- | ------------------------------------------------- |
| amount    | Required. Number >= 0.                 | “Amount is required and must be zero or greater.” |
| cost_type | Optional. Non-empty string if present. | —                                                 |
| note      | Optional.                              | —                                                 |

inventory_id is set by the API path (POST /api/inventory/[id]/other-costs); no client-supplied inventory_id in body.

---

### 3. Customer (ADR-003)

| Field      | Rule                                                                                         | Error message if violated |
| ---------- | -------------------------------------------------------------------------------------------- | ------------------------- |
| first_name | Optional. If present, string.                                                                | —                         |
| last_name  | Optional. If present, string.                                                                | —                         |
| email      | Optional. If present, string; must be valid email format (RFC 5322 addr-spec or equivalent). | “Invalid email format.”   |

**Cross-field rule:** At least one of first_name or last_name must be non-empty (after trim). So: (first_name trimmed non-empty) OR (last_name trimmed non-empty). If both missing or both empty, 400: “Customer must have at least a first name or last name.”

---

### 4. Customer address (`addresses`, ADR-003)

| Field       | Rule                                              | Error message if violated     |
| ----------- | ------------------------------------------------- | ----------------------------- |
| first_line  | Required on create/update — non-empty after trim. | “Address line 1 is required.” |
| second_line | Optional.                                         | —                             |
| city        | Required. Non-empty after trim.                   | “City is required.”           |
| state       | Optional.                                         | —                             |
| country     | Required. Non-empty after trim.                   | “Country is required.”        |
| postal_code | Required. Non-empty after trim.                   | “Postal code is required.”    |
| label       | Optional.                                         | —                             |

**Postal code lookup (non-blocking):** On blur, the UI calls `GET /api/zip-lookup?zip=&country=` (proxied to Zippopotam.us). If a match is found, city and state are auto-filled (only when empty, or when the postal code itself changes). If no match is found, a red warning is shown under the field: `"{zip}" doesn't appear to be a valid postal code for {country}.` The warning is non-blocking — the user can still save. The warning clears when the user types a new value.

**Phone number formatting:** On blur, phone numbers are formatted using `libphonenumber-js` based on the customer's country code. The formatted value replaces the raw input (e.g. `2125551234` → `(212) 555-1234` for US).

---

### 5. Order (ADR-003, ADR-004, ADR-017)

**Create order (`POST /api/orders`):**

| Field                | Rule                                                                     | Error message if violated            |
| -------------------- | ------------------------------------------------------------------------ | ------------------------------------ |
| customer_id          | Optional. If present, must exist in `customers`.                         | “Customer not found.”                |
| items                | Required. Non-empty array of `{ inventory_id, quantity?, unit_price? }`. | “At least one item is required.”     |
| items[].inventory_id | Required. Must exist in `inventory`.                                     | “Invalid or missing inventory item.” |
| order_date           | Optional. Valid `YYYY-MM-DD`. Default: today.                            | “Invalid date.”                      |

**Update order (`PATCH /api/orders/[id]`):**

| Field                | Rule                                            | Error message if violated                |
| -------------------- | ----------------------------------------------- | ---------------------------------------- |
| shipping_date        | Optional. Valid `YYYY-MM-DD`.                   | “Invalid date.”                          |
| shipper              | Optional. One of: USPS, UPS, FedEx, DHL, Other. | “Invalid shipper.”                       |
| seller_shipping_cost | Optional. Number >= 0.                          | “Shipping cost must be zero or greater.” |
| discount_total       | Optional. Number >= 0.                          | “Discount must be zero or greater.”      |
| was_paid             | Optional. 0 or 1.                               | —                                        |
| tracking_number      | Optional. String.                               | —                                        |
| payment_status       | Optional. Must be one of: `unpaid`, `paid`, `refunded`. When `payment_status` changes to `paid`, set `was_paid = 1`. When `payment_status` changes to `refunded`, `was_paid` remains `1` (payment was received then refunded). | "Invalid payment status." |

**Ship-to validation for manual orders:** Manual order create (`source_channel = 'manual'`) requires at least `ship_to_first_name` and `ship_to_last_name`. If ship-to address fields are empty, the system should auto-copy from the linked customer's billing address (flat fields on `customers`) or their default address (`addresses` where `is_default = 1`). If no customer address is available, ship-to fields remain empty and the order appears in Outstanding type 5 (missing address).

**Ship until paid or override:** The system **does not allow** "Mark as shipped" until the **order** is paid (`orders.was_paid = 1`), **unless** the user explicitly chooses "Ship anyway" with confirmation (ADR-031, ADR-040). No silent ship-when-unpaid. On override, set `orders.shipped_without_paid_override = 1` on the order header (ADR-017) — not on `order_items`. Applies to `POST /api/orders/[id]/mark-shipped` and batch `mark_shipped`.

---

### 6. Settings (ADR-017)

| Key                                              | Rule                                               | Error message if violated  |
| ------------------------------------------------ | -------------------------------------------------- | -------------------------- |
| panel_layout                                     | If present, one of: commands_left, commands_right. | “Invalid panel layout.”    |
| default_shipper                                  | If present, one of: USPS, UPS, FedEx, DHL, Other.  | “Invalid default shipper.” |
| currency_code                                    | If present, non-empty string (e.g. ISO 4217).      | —                          |
| business\_\*                                     | Optional strings. No format validation.            | —                          |
| pictures_matter_url, tutorial_system_folder_path | Optional strings.                                  | —                          |

---

### 7. Reports (parameters)

| Report                         | Parameter          | Rule                                                          | Error message if violated                 |
| ------------------------------ | ------------------ | ------------------------------------------------------------- | ----------------------------------------- |
| Thank-you note, Invoice        | order_id           | Required. Must exist in `orders`.                             | “Order is required.” / “Order not found.” |
| Sales, Costs, Postal by vendor | from_date, to_date | Optional. If present, valid YYYY-MM-DD; from_date <= to_date. | “Invalid date range.”                     |
| Income MTD / YTD               | —                  | None.                                                         | —                                         |

---

## Consequences

- **Positive:** Single place for all validation rules; API and UI can share the same rules; clear error messages.
- **Negative:** Any new field or rule must update this ADR.

## Notes

- “Non-empty string after trim” means: value is string, and after trimming leading/trailing whitespace, length > 0. Empty string or whitespace-only is invalid when field is required.
- Client and server must both enforce these rules; server is authoritative (client may validate for UX but server must reject invalid data).

### Listing generation gate (ADR-081 / ADR-085)

AI listing generation (`POST /api/inventory/[id]/generate-listing-content`) is allowed once the
item has: `item_number`, `description`, `condition_code`, and **at least one picture**. **Price
(`sale_revenue`) is NOT required to generate (ADR-085)** — the AI recommends it. Listing title /
description / tags rules still apply to the generated content. (The former Listing Coach validation
in ADR-072 is retired with the Coach.)

### 8. Listing publish / List on Etsy validation

These rules apply when publishing a listing to Etsy. Publishing is gated on **`listing_phase =
'listing_ready'`** (ADR-085 §5 — the rubric passed) **plus** the Etsy field checks below. They are
**not** required for draft creation or AI generation — only at publish time.

| Field | Rule | Error message if violated |
| --- | --- | --- |
> **Severity model (aligned to `validatePublishReadiness`, 2026-06-23):** every rule below is
> **blocking** (adds to `errors`) **except** `etsy_shipping_profile_id`, which is warning-only.
> The "required" fields each resolve from the **per-item value OR a global default** (ADR-017 §1c);
> the readiness gate and the publish route honor the **same** fallbacks (audit C7).

| `etsy_when_made` | **Required** (blocking). Resolves from per-item value **or** global default (`etsy.publish.default_when_made`); must be a valid Etsy `when_made` enum (see ADR-017 §1a). | "Era (when made) is required before publishing to Etsy." |
| `etsy_taxonomy_id` | **Required** (blocking). Resolves from per-item value **or** global default (`etsy.publish.default_taxonomy_id`); must be a positive integer. | "Category ID (taxonomy) is required before publishing to Etsy." / "Category ID must be a positive integer." |
| `materials` | Optional. **If provided, blocking:** must be a JSON array of strings, each ≤ 45 characters. No character-set restriction is enforced; invalid JSON or a non-array is rejected. | "Materials must be a JSON array of strings." / "Materials[i] exceeds 45 characters (…)." / "Materials is not valid JSON. Expected an array like [\"ceramic\",\"glaze\"]." |
| `item_weight` / `item_weight_unit` | Optional. **If `item_weight` is provided, blocking:** it must be a positive number and `item_weight_unit` one of `oz`, `lb`, `g`, `kg`. Missing weight is not flagged. | "Item weight must be a positive number." / "Weight unit is required when weight is set. Must be one of: oz, lb, g, kg." |
| `item_length`, `item_width`, `item_height` / `item_dimensions_unit` | Optional. **If any dimension is provided, blocking:** `item_dimensions_unit` must be one of `in`, `ft`, `mm`, `cm`, `m`, and each provided dimension must be a positive number. Not all three are required — partial dimensions are allowed. | "Dimensions unit is required when any dimension is set. Must be one of: in, ft, mm, cm, m." / "Length must be a positive number." |
| `etsy_return_policy_id` | **Required** (blocking). Resolves from per-item value **or** global default (`etsy.publish.return_policy_id`). | "A return policy is required. Set one on this item or configure a default in Settings → Etsy Publish Defaults." |
| `etsy_shipping_profile_id` | Recommended — **warning only, does not block** publish. Resolves from per-item value or global default (`etsy.publish.shipping_profile_id`). | "No shipping profile set. A default or per-item shipping profile is recommended." |
| `etsy_who_made` | **Required** (blocking). Resolves from per-item value **or** global default (`etsy.publish.default_who_made`); must be a valid `who_made` enum (`i_did`, `someone_else`, `collective`). | "Who made it is required before publishing to Etsy. Set it on this item or configure a default in Settings → Etsy Publish Defaults." |

### Schema mapping (updated 2026-05-24)

This ADR uses original data model terms. The implementation maps as follows:

| ADR-021 term                           | Implementation                         | Notes                                                                      |
| -------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------- |
| `PATCH /api/purchases/[id]`            | `PATCH /api/orders/[id]`               | Order update endpoint                                                      |
| purchase row(s)                        | `orders` + `order_items`               |                                                                            |
| purchase.shipped_without_paid_override | `orders.shipped_without_paid_override` | Audit flag on order header                                                 |
| customer_address_id                    | Not used in v1                         | Ship-to is a snapshot on `orders` (`ship_to_*` fields)                     |
| default_address_id                     | Not used in v1                         | Context check: address must belong to customer via `addresses.customer_id` |
| date_of_purchase                       | `orders.order_date`                    |                                                                            |
| shipping_cost                          | `orders.seller_shipping_cost`          |                                                                            |
| discount_amount                        | `orders.discount_total`                |                                                                            |
