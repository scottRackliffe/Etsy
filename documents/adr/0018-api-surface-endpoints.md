# ADR-018: API surface — endpoints and behavior (no ambiguity)

## Status

Accepted

## Date

2025-02-15

## Context

The application exposes a set of API routes (Next.js App Router or equivalent). Every endpoint must be specified so an implementer knows exactly what to build: method, path, purpose, request shape (if any), response shape or behavior, and error handling. No endpoint may be left implied.

## Decision

The following endpoints constitute the full API surface. All routes are relative to the app base (e.g. `/api` for backend routes). Request/response bodies are JSON unless stated otherwise. Authentication: where “Etsy auth” is required, the server resolves auth via SQLite-backed auth/session records (session id in HTTP-only cookie). Unauthenticated requests to protected routes return 401. Where “none” is stated, the route is public.

---

### Global API contract (applies to all endpoints)

**1) Standard error response (JSON endpoints)**

All JSON error responses use this shape:

```json
{
  "ok": false,
  "error": {
    "code": "OPTIONAL_MACHINE_CODE",
    "message": "Developer-oriented message",
    "user_message": "User-friendly explanation",
    "actions": ["Step the user can take"],
    "can_retry": true
  },
  "fields": {
    "field_name": ["validation message"]
  }
}
```

- `fields` appears only for validation errors (400).
- For non-validation errors, omit `fields`.
- Protected endpoints return 401 when auth/session is missing or invalid.

**2) Status-code baseline**

- 200: successful read/update action.
- 201: resource created.
- 204: successful delete/no-content action.
- 400: validation or malformed request.
- 401: not authenticated.
- 404: resource not found.
- 409: conflict (for example delete blocked by referential-integrity rule in ADR-022).
- 429: rate-limited upstream/dependency response when surfaced by proxy endpoints.
- 500: unexpected server error.
- 503: upstream temporarily unavailable (optional where dependency outage is explicit).

**3) Pagination contract (list endpoints)**

List endpoints return:

```json
{
  "items": [],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 0,
    "has_more": false
  }
}
```

- `total` may be `null` only if total-count calculation is intentionally skipped for performance.
- `has_more` is computed from available rows and pagination inputs.

**4) PATCH semantics**

- Omitted field: unchanged.
- Field explicitly set to `null`: clear the field (if nullable in ADR-017).
- Empty string for optional text fields: treated as empty string unless endpoint validation normalizes to null (must be documented per endpoint).
- Immutable system fields (for example `id`, `created_at`) cannot be changed via PATCH.

**5) Idempotency policy**

- `POST /api/sync/etsy` is idempotent by receipt id (ADR-019).
- Other POST routes are non-idempotent unless explicitly documented otherwise.
- Duplicate unique-key writes (for example `inventory.item_number`) return 409.

**6) Date/time handling**

- Date-only fields use `YYYY-MM-DD` (ADR-017).
- Timestamps use ISO 8601 UTC (`YYYY-MM-DDTHH:MM:SSZ`).
- Date filtering (`from_date`, `to_date`) is inclusive on both bounds unless endpoint table states otherwise.

---

### 1. Auth (ADR-007)

| Method | Path                    | Auth | Purpose          | Request            | Response / behavior                                                                                                                                                                                              |
| ------ | ----------------------- | ---- | ---------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | /api/auth/etsy          | None | Start Etsy OAuth | None               | Persist OAuth state/verifier in SQLite auth/session storage; redirect 302 to Etsy authorization URL.                                                                                                             |
| GET    | /api/auth/etsy/callback | None | OAuth callback   | Query: code, state | Validate state; exchange code for tokens; persist auth/session token state in SQLite; set opaque session id cookie; redirect 302 to home (e.g. /). On error: redirect to home with query param error= (message). |
| POST   | /api/auth/logout        | None | Log out          | None               | Invalidate SQLite auth/session records and clear opaque session id cookie; respond 200 or 204.                                                                                                                   |

---

### 2. Etsy proxy (SQLite-backed)

| Method | Path          | Auth | Purpose                  | Request                                                                     | Response / behavior                                                                                                                                                                                                                                                                                                                          |
| ------ | ------------- | ---- | ------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | /api/shop     | Etsy | List user’s Etsy shops   | None                                                                        | 200: `{ items: [ { shop_id, shop_name } ], pagination }` (single page if upstream has no paging). 401 if not connected.                                                                                                                                                                                                                      |
| GET    | /api/receipts | Etsy | List receipts for a shop | Query: shop_id (required), limit (optional, default 100), offset (optional) | 200: `{ items: [ receipt objects ], pagination }`. Receipt object: receipt_id, order_id, name, first_line, second_line, city, state, zip, country_iso, total_price, total_shipping_cost, currency_code, was_paid, was_shipped, creation_tsz, message_from_buyer (or equivalent from Etsy API). 401 if not connected. 400 if shop_id missing. |

---

### 3. Etsy sync (persist Etsy orders to DB)

| Method | Path           | Auth | Purpose                          | Request                                                         | Response / behavior                                                                                                                                                                                                                                                                                                                                                                   |
| ------ | -------------- | ---- | -------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | /api/sync/etsy | Etsy | Sync Etsy receipts into local DB | Body (optional): { shop_id: number } or none (use default shop) | Fetch receipts from Etsy for the shop; for each receipt not already present (by etsy_receipt_id in purchase), create customer (if new), customer_address (if new), and purchase row(s) per line item; set order_id = etsy_receipt_id, etsy_receipt_id on each purchase. Exact behavior: ADR-019. 200: { synced: number, created_orders: number } or equivalent. 401 if not connected. |

---

### 4. Inventory (ADR-002, ADR-017)

| Method | Path                                         | Auth | Purpose                                               | Request                                                                                                | Response / behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------ | -------------------------------------------- | ---- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | /api/inventory                               | App  | List inventory items                                  | Query: status (optional filter), limit, offset                                                         | 200: `{ items: [ inventory row ], pagination }`. Each row: all columns per ADR-017 inventory table (id, item_number, description, …).                                                                                                                                                                                                                                                                                                                                                                                       |
| GET    | /api/inventory/[id]                          | App  | Get one inventory item                                | Path: id                                                                                               | 200: single inventory object. 404 if not found.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| POST   | /api/inventory                               | App  | Create inventory item                                 | Body: { item_number, description?, purchase_cost?, … } per schema; validation per ADR-021              | 201: created object (with id, created_at, updated_at). 400 if validation fails (ADR-021).                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| PATCH  | /api/inventory/[id]                          | App  | Update inventory item                                 | Body: partial object (only fields to update)                                                           | 200: updated object. 404 if not found. 400 if validation fails.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| GET    | /api/inventory/[id]/listing-readiness        | App  | Check if item is ready for listing-generation request | Path: id                                                                                               | 200: `{ item_id, ready, missing_fields, checks, picture_count }`. Uses same preflight rules as generate endpoint: item_number, description, condition_code, sale_revenue (>0), and at least one picture. 404 if item not found.                                                                                                                                                                                                                                                                                             |
| POST   | /api/inventory/[id]/listing-export           | App  | Export portable AI package                            | Path: id                                                                                               | 200: `{ package }` where package includes schema_version, export_id, item context, picture references, required output schema, and quality instructions. 400 if readiness checks fail.                                                                                                                                                                                                                                                                                                                                     |
| POST   | /api/inventory/[id]/listing-import           | App  | Import portable AI draft                              | Path: id; Body: portable package output JSON                                                           | Validates schema_version/item_id and required listing fields, stores import audit, updates listing draft fields, marks draft source as portable import. 200 updated item; 400 for schema/validation errors.                                                                                                                                                                                                                                                                                                                |
| POST   | /api/inventory/[id]/listing-approve          | App  | Approve listing draft                                 | Path: id                                                                                               | Requires readiness checks and non-empty listing title/description/tags. Sets listing draft state to approved. 200 updated item.                                                                                                                                                                                                                                                                                                                                                                                           |
| POST   | /api/inventory/[id]/publish-to-etsy          | App  | Publish approved listing to Etsy                      | Path: id                                                                                               | Requires approved draft and Etsy publish settings (`etsy.active_shop_id`, taxonomy/shipping/readiness settings; image ids optional). Calls Etsy `createDraftListing`, uploads local item pictures one-by-one with retry policy, activates listing state, persists `etsy_listing_id`, marks draft state `published`. Default behavior blocks publish if any local image upload fails (quality-first); override is optional via settings flag. 409 if not approved; 400 if required publish settings missing; 409 if no listing images are available for activation.                                                                                      |
| DELETE | /api/inventory/[id]                          | App  | Delete or retire inventory                            | Path: id. Query or body: action = "delete" \| "retire" if both supported                               | Behavior per ADR-022 (referential integrity). If delete: 204 or 200. If inventory has purchases: 409 or 400 with message per ADR-022.                                                                                                                                                                                                                                                                                                                                                                                       |
| POST   | /api/inventory/[id]/pictures                 | App  | Add or replace pictures                               | Multipart: files and/or slot numbers; or JSON with directory path for “import from folder” per ADR-010 | Store files per ADR-010; update picture_1…picture_10; generate and store thumbnail per ADR-002/015. 200: { picture_slots: [...] }. 400 if invalid.                                                                                                                                                                                                                                                                                                                                                                          |
| PATCH  | /api/inventory/[id]/pictures/reorder         | App  | Reorder picture slots                                 | Body: { order: [ slot indices or picture ids ] }                                                       | Update picture_1…picture_10 order. 200: updated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| DELETE | /api/inventory/[id]/pictures/[slot]          | App  | Remove picture from slot                              | Path: id, slot (1–10 or 1–5 for condition)                                                             | Set picture_N or condition_picture_N to null. 200 or 204.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| POST   | /api/inventory/[id]/generate-listing-content | App  | Generate listing content via AI                       | Path: id                                                                                               | Preflight validation required before request is allowed: item_number, description, condition_code, sale_revenue (>0), and at least one picture. Then send **all** item pictures (picture_1…10, condition_picture_1…5 — every non-empty) plus item context to AI per etsy-listing-template-and-requirements.md §3. Return listing_title, listing_description, listing_tags; write to inventory. 200: { listing_title, listing_description, listing_tags }. 400 with field errors if prerequisites missing. 404 if not found. |

“App” auth: session or cookie that identifies the user (same as Etsy cookie when connected, or app-specific session when we add non-Etsy users). For single-user app, “App” may mean “any authenticated session.”

---

### 5. Inventory other costs (ADR-002)

| Method | Path                            | Auth | Purpose                      | Request                                           | Response / behavior                                                             |
| ------ | ------------------------------- | ---- | ---------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| GET    | /api/inventory/[id]/other-costs | App  | List other costs for an item | Path: id                                          | 200: { costs: [ { id, inventory_id, amount, description, created_at }, ... ] }. |
| POST   | /api/inventory/[id]/other-costs | App  | Add other cost line          | Body: { amount, description }; validation ADR-021 | 201: created row. 400 if validation fails.                                      |
| PATCH  | /api/other-costs/[id]           | App  | Update other cost line       | Body: { amount?, description? }                   | 200: updated. 404 if not found.                                                 |
| DELETE | /api/other-costs/[id]           | App  | Delete other cost line       | Path: id                                          | 204. 404 if not found.                                                          |

---

### 6. Customer (ADR-003)

| Method | Path                          | Auth | Purpose                                        | Request                                                                                                           | Response / behavior                                                               |
| ------ | ----------------------------- | ---- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| GET    | /api/customers                | App  | List customers                                 | Query: q (search name/email optional), limit, offset                                                              | 200: `{ items: [ ... ], pagination }`.                                            |
| GET    | /api/customers/[id]           | App  | Get customer with addresses and purchase count | Path: id                                                                                                          | 200: customer + addresses[] + purchaseCount or purchases[]. 404 if not found.     |
| POST   | /api/customers                | App  | Create customer                                | Body: { first_name?, last_name?, email? }; validation ADR-021                                                     | 201: created. 400 if validation fails.                                            |
| PATCH  | /api/customers/[id]           | App  | Update customer                                | Body: partial; validation ADR-021                                                                                 | 200: updated. 404/400.                                                            |
| DELETE | /api/customers/[id]           | App  | Delete customer                                | Path: id                                                                                                          | Behavior ADR-022. If has purchases: 409 with message. Else 204.                   |
| GET    | /api/customers/[id]/addresses | App  | List addresses for customer                    | Path: id                                                                                                          | 200: { addresses: [ ... ] }.                                                      |
| POST   | /api/customers/[id]/addresses | App  | Add address                                    | Body: { address_line_1, address_line_2?, city, state_province, country, postal_code, label? }; validation ADR-021 | 201: created. 400 if validation fails.                                            |
| PATCH  | /api/addresses/[id]           | App  | Update address                                 | Body: partial                                                                                                     | 200: updated. 404.                                                                |
| DELETE | /api/addresses/[id]           | App  | Delete address                                 | Path: id                                                                                                          | ADR-022. If used in purchase: 409 or allow (snapshot on purchase). 204 otherwise. |

---

### 7. Purchase / orders (ADR-003, ADR-004)

| Method        | Path                             | Auth | Purpose                                      | Request                                                                                                                                       | Response / behavior                                                                                                                                                                         |
| ------------- | -------------------------------- | ---- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET           | /api/purchases                   | App  | List purchases (orders)                      | Query: customer_id?, order_id?, from_date?, to_date?, limit, offset                                                                           | 200: `{ items: [ ... ], pagination }`. Each row per ADR-017 purchase table; optionally include customer name, inventory description.                                                        |
| GET           | /api/orders/[order_id]           | App  | Get all purchase rows for one order          | Path: order_id                                                                                                                                | 200: { order_id, purchases: [ ... ] } (all rows with that order_id). 404 if none.                                                                                                           |
| GET           | /api/purchases/[id]              | App  | Get one purchase row                         | Path: id                                                                                                                                      | 200: purchase object. 404 if not found.                                                                                                                                                     |
| POST          | /api/orders                      | App  | Create new order (one or more purchase rows) | Body: { customer_id, customer_address_id?, items: [ { inventory_id, discount_amount? } ], date_of_purchase? }                                 | Create order_id (e.g. UUID); for each item create purchase row with snapshot from customer/address; set order_id. 201: { order_id, purchases: [ ... ] }. 400 if validation fails (ADR-021). |
| PATCH         | /api/purchases/[id]              | App  | Update purchase (e.g. mark shipped, notes)   | Body: partial: shipping_date?, shipper?, shipping_cost?, discount_amount?, notes? (validation ADR-021). For mark paid use mark-paid endpoint. | 200: updated. 404. 400 if validation fails.                                                                                                                                                 |
| POST or PATCH | /api/orders/[order_id]/mark-paid | App  | Mark order as paid                           | Path: order_id                                                                                                                                | Set was_paid=1 for all purchase rows with that order_id. 200: { updated: number }. 404 if order_id not found.                                                                               |

**Mark as paid (order):** The UI “Mark as paid” applies to an order (all purchase rows with the same order_id). The API provides a single endpoint: POST or PATCH /api/orders/[order_id]/mark-paid — sets was_paid=1 for every purchase row with that order_id. 200: { updated: number }. 404 if order_id not found. (Endpoint is in the table above.)

No DELETE for purchases: we do not support deleting purchase rows (audit trail). Corrections are done via PATCH or support process.

---

### 8. Settings (ADR-008, ADR-009)

| Method | Path                | Auth | Purpose          | Request         | Response / behavior                                                                                                 |
| ------ | ------------------- | ---- | ---------------- | --------------- | ------------------------------------------------------------------------------------------------------------------- |
| GET    | /api/settings       | App  | Get all settings | None            | 200: { key: value, ... } for all keys in settings table (ADR-017).                                                  |
| GET    | /api/settings/[key] | App  | Get one setting  | Path: key       | 200: { key, value }. 404 if not set.                                                                                |
| PUT    | /api/settings/[key] | App  | Set one setting  | Body: { value } | Upsert; 200: { key, value }. Keys per ADR-017 §6 (panel*layout, default_shipper, currency_code, business*\*, etc.). |
| GET    | /api/settings/ai    | App  | Get AI settings  | None            | 200: masked AI config and capability flags (api key configured, model/provider, budgets).                         |
| PUT    | /api/settings/ai    | App  | Save AI settings | Body: provider/model/api key/base url/timeout/retry/token budget | 200: masked AI config. Validation errors return 400 with actionable guidance.                    |
| POST   | /api/settings/ai/test-connection | App | Test AI settings | None | 200 on successful provider response; error envelope on failure. |

---

### 9. Reports (ADR-006, ADR-013)

Reports are generated on demand. Request format via query `format=pdf` or `format=csv` (default pdf). Parameters and content per ADR-006 and ADR-013. After generation the UI offers **Print, Export PDF, Export CSV, Cancel** (ADR-013).

| Method      | Path                           | Auth | Purpose                                | Request                                                                | Response / behavior                                                       |
| ----------- | ------------------------------ | ---- | -------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| GET or POST | /api/reports/thank-you-note    | App  | Thank-you note for one order           | Query or body: order_id (required), format? (pdf \| csv, default pdf)  | 200: PDF or CSV per ADR-013. 404 if order not found. Content per ADR-013. |
| GET or POST | /api/reports/invoice           | App  | Invoice for one order                  | Query or body: order_id (required), format? (pdf \| csv, default pdf)  | 200: PDF or CSV per ADR-013. 404 if order not found. Content per ADR-013. |
| GET or POST | /api/reports/sales             | App  | Sales report                           | Query or body: from_date?, to_date?, format? (pdf \| csv, default pdf) | 200: PDF or CSV. Content per ADR-013.                                     |
| GET or POST | /api/reports/costs             | App  | Costs report                           | Query or body: from_date?, to_date?, format? (pdf \| csv, default pdf) | 200: PDF or CSV. Content per ADR-013.                                     |
| GET or POST | /api/reports/income-mtd        | App  | Income month-to-date                   | Query or body: format? (pdf \| csv, default pdf)                       | 200: PDF or CSV. Content per ADR-013.                                     |
| GET or POST | /api/reports/income-ytd        | App  | Income year-to-date                    | Query or body: format? (pdf \| csv, default pdf)                       | 200: PDF or CSV. Content per ADR-013.                                     |
| GET or POST | /api/reports/postal-by-vendor  | App  | Postal costs by vendor                 | Query or body: from_date?, to_date?, format? (pdf \| csv, default pdf) | 200: PDF or CSV. Content per ADR-013.                                     |
| GET or POST | /api/reports/outstanding-items | App  | Outstanding items (all to-dos)         | Query or body: format? (pdf \| csv, default pdf)                       | 200: PDF or CSV. Content per ADR-013 (Outstanding items).                 |
| GET or POST | /api/reports/ar-aging          | App  | AR aging (unpaid orders by age bucket) | Query or body: format? (pdf \| csv, default pdf)                       | 200: PDF or CSV. Content per ADR-013 (AR aging).                          |

---

### 10. Pick list (ADR-015)

| Method | Path                     | Auth | Purpose                                              | Request                                                                      | Response / behavior                                                                                                                                                                     |
| ------ | ------------------------ | ---- | ---------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | /api/inventory/pick-list | App  | List inventory for item picker (picture icon + name) | Query: q? (filter by item name/substring, case-insensitive), limit?, offset? | 200: `{ items: [ { id, item_number, description, thumbnail_path, name_or_description } ], pagination }`. Used by “New order” and “Add sale for this customer.” Filter by q per ADR-015. |

---

### Appendix A: Concrete JSON examples (implementation reference)

**1) POST `/api/inventory` request**

```json
{
  "item_number": "TC-0001",
  "description": "Royal China Currier & Ives dinnerware set",
  "purchase_cost": 32.5,
  "shipping_cost": 8.25,
  "sale_revenue": 98,
  "date_purchased": "2026-02-16",
  "status": "In stock",
  "condition_code": "Excellent",
  "has_condition_issue": 0,
  "quantity": 1,
  "etsy_listing_id": "1234567890",
  "notes": "Estate sale find"
}
```

**2) POST `/api/inventory` success (201)**

```json
{
  "id": 101,
  "item_number": "TC-0001",
  "description": "Royal China Currier & Ives dinnerware set",
  "purchase_cost": 32.5,
  "shipping_cost": 8.25,
  "sale_revenue": 98,
  "date_purchased": "2026-02-16",
  "date_listed": null,
  "date_of_sale": null,
  "status": "In stock",
  "created_at": "2026-02-16T17:22:10Z",
  "updated_at": "2026-02-16T17:22:10Z"
}
```

**3) Validation error example (400)**

```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "fields": {
    "item_number": ["Item number is required"],
    "status": ["Status must be one of: Draft, In stock, Listed, Sold, Reserved, Retired"]
  }
}
```

**4) PATCH `/api/inventory/[id]` request (partial update)**

```json
{
  "status": "Listed",
  "date_listed": "2026-02-16",
  "notes": null
}
```

**5) GET `/api/purchases` success (200, paginated)**

```json
{
  "items": [
    {
      "id": 9001,
      "order_id": "R-10001",
      "customer_id": 77,
      "inventory_id": 101,
      "date_of_purchase": "2026-02-16",
      "was_paid": 1,
      "order_status": "active"
    }
  ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 1,
    "has_more": false
  }
}
```

**6) POST `/api/orders` request**

```json
{
  "customer_id": 77,
  "customer_address_id": 300,
  "date_of_purchase": "2026-02-16",
  "items": [
    { "inventory_id": 101, "discount_amount": 0 },
    { "inventory_id": 102, "discount_amount": 5.0 }
  ]
}
```

**7) POST `/api/orders` success (201)**

```json
{
  "order_id": "f9f6d8e8-9a9c-4f8e-9f7e-7f6bb4c6ef8c",
  "purchases": [
    { "id": 9001, "inventory_id": 101, "was_paid": 0, "order_status": "active" },
    { "id": 9002, "inventory_id": 102, "was_paid": 0, "order_status": "active" }
  ]
}
```

**8) POST `/api/orders/[order_id]/mark-paid` success (200)**

```json
{
  "updated": 2
}
```

**9) POST `/api/sync/etsy` success (200)**

```json
{
  "synced": 5,
  "created_orders": 5,
  "created_purchases": 7
}
```

**10) GET `/api/receipts` success (200, paginated proxy shape)**

```json
{
  "items": [
    {
      "receipt_id": 123456789,
      "order_id": "123456789",
      "name": "Jane Doe",
      "city": "Portland",
      "country_iso": "US",
      "total_price": "98.00",
      "currency_code": "USD",
      "was_paid": true,
      "was_shipped": false,
      "creation_tsz": 1763232000
    }
  ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 1,
    "has_more": false
  }
}
```

**11) Standard unauthorized response (401)**

```json
{
  "error": "Authentication required",
  "code": "UNAUTHORIZED"
}
```

**12) Report endpoint response behavior**

- For `format=pdf`: return `200`, `Content-Type: application/pdf`, and binary PDF content.
- For `format=csv`: return `200`, `Content-Type: text/csv`, and RFC4180 CSV content.
- For missing order-specific input (for example invoice without `order_id`): return `400` with standard error JSON shape.

---

## Consequences

- **Positive:** Single place for all endpoints; no ambiguity for implementers.
- **Negative:** Any new endpoint or change must update this ADR.

## Notes

- “App” auth: for single-user app, use the same Etsy cookie when the user is connected; no separate session mechanism is required; protected routes must return 401 when not authenticated.
- File upload for pictures: multipart/form-data; server stores files per ADR-010 and updates inventory picture columns and thumbnail (ADR-002).
- Report content: exact content and data for each report type are specified in **ADR-013** (Report content section).
- Listing generation mode strategy (manual vs integrated AI vs portable handoff) is governed by **ADR-023**. Any API additions for export/import/approve flow must be added here before implementation is considered complete.
- **Print shipping label:** Sales UI command (no separate API required). **No automated connection to any shipping service.** App generates and prints the label using order ship-to and stored Shipping Info. If required Shipping Info is missing, tell user and how to navigate to Config → Shipping Info. See `documents/shipping-label-carrier-templates.md`. If the order has no carrier or ship-to data, show a message and prompt the user to complete the order first. See `ui-design.md` and `design-decisions-implementation.md` §1.
