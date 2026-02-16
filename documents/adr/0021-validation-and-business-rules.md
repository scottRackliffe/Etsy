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

### 2. Inventory other cost (ADR-002)

| Field       | Rule                                   | Error message if violated                         |
| ----------- | -------------------------------------- | ------------------------------------------------- |
| amount      | Required. Number >= 0.                 | “Amount is required and must be zero or greater.” |
| description | Required. Non-empty string after trim. | “Description is required.”                        |

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

### 4. Customer address (ADR-003)

| Field          | Rule                                                                                                                                                                                                                                                      | Error message if violated     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| address_line_1 | Required for “complete” address (used in outstanding list). For create/update: required if we enforce “at least one complete address per customer” elsewhere; here we allow partial. **Decision:** Required on create/update—non-empty string after trim. | “Address line 1 is required.” |
| address_line_2 | Optional.                                                                                                                                                                                                                                                 | —                             |
| city           | Required. Non-empty string after trim.                                                                                                                                                                                                                    | “City is required.”           |
| state_province | Optional.                                                                                                                                                                                                                                                 | —                             |
| country        | Required. Non-empty string after trim.                                                                                                                                                                                                                    | “Country is required.”        |
| postal_code    | Required. Non-empty string after trim.                                                                                                                                                                                                                    | “Postal code is required.”    |
| label          | Optional.                                                                                                                                                                                                                                                 | —                             |

---

### 5. Purchase / order (ADR-003, ADR-004)

**Create order (POST /api/orders):**

| Field                   | Rule                                                                         | Error message if violated                           |
| ----------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------- |
| customer_id             | Required. Must exist in customer table.                                      | “Customer is required.” / “Customer not found.”     |
| customer_address_id     | Optional. If present, must exist and must belong to customer_id.             | “Address not found or does not belong to customer.” |
| items                   | Required. Non-empty array. Each element: { inventory_id, discount_amount? }. | “At least one item is required.”                    |
| items[].inventory_id    | Required. Must exist in inventory table.                                     | “Invalid or missing inventory item.”                |
| items[].discount_amount | Optional. If present, number >= 0.                                           | “Discount must be zero or greater.”                 |
| date_of_purchase        | Optional. If present, valid date YYYY-MM-DD. Default: today.                 | “Invalid date.”                                     |

**Update purchase (PATCH /api/purchases/[id]):**

| Field           | Rule                                                        | Error message if violated                |
| --------------- | ----------------------------------------------------------- | ---------------------------------------- |
| shipping_date   | Optional. If present, valid date YYYY-MM-DD.                | “Invalid date.”                          |
| shipper         | Optional. If present, one of: USPS, UPS, FedEx, DHL, Other. | “Invalid shipper.”                       |
| shipping_cost   | Optional. If present, number >= 0.                          | “Shipping cost must be zero or greater.” |
| discount_amount | Optional. If present, number >= 0.                          | “Discount must be zero or greater.”      |
| was_paid        | Optional. If present, 0 or 1.                               | —                                        |

**Ship until paid or override:** The system **does not allow** "Mark as shipped" (or equivalent) until the order is **paid** (all purchase rows in the order have was_paid = 1), **unless** the user **explicitly overrides** (e.g. "Ship anyway" or "Mark as shipped even though not paid" with a confirmation). No silent ship-when-unpaid. When the user attempts to mark an order as shipped and it is not paid, show a clear message in user terms (e.g. "This order is not marked paid. Mark as paid first, or choose 'Ship anyway' to record shipping."). If the user chooses "Ship anyway," record the override: set purchase.shipped_without_paid_override = 1 for each purchase row in the order (schema: ADR-017). This provides an audit trail that shipment was recorded without paid.

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

| Report                         | Parameter          | Rule                                                                 | Error message if violated                 |
| ------------------------------ | ------------------ | -------------------------------------------------------------------- | ----------------------------------------- |
| Thank-you note, Invoice        | order_id           | Required. Must exist (at least one purchase row with that order_id). | “Order is required.” / “Order not found.” |
| Sales, Costs, Postal by vendor | from_date, to_date | Optional. If present, valid YYYY-MM-DD; from_date <= to_date.        | “Invalid date range.”                     |
| Income MTD / YTD               | —                  | None.                                                                | —                                         |

---

## Consequences

- **Positive:** Single place for all validation rules; API and UI can share the same rules; clear error messages.
- **Negative:** Any new field or rule must update this ADR.

## Notes

- “Non-empty string after trim” means: value is string, and after trimming leading/trailing whitespace, length > 0. Empty string or whitespace-only is invalid when field is required.
- Client and server must both enforce these rules; server is authoritative (client may validate for UX but server must reject invalid data).
