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
| POST   | /api/sync/etsy | Etsy | Sync Etsy receipts into local DB | Body (optional): { shop_id: number } or none (use default shop) | Fetch receipts from Etsy for the shop; for each receipt not already present (by etsy_receipt_id in orders), create customer (if new), address (if new), order + order_items rows per line item; set orders.etsy_receipt_id. Exact behavior: ADR-019. 200: { synced: number, created_orders: number } or equivalent. 401 if not connected. |

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

### 7. Orders (ADR-003, ADR-004, ADR-019)

| Method        | Path                             | Auth | Purpose                                 | Request                                                                                                    | Response / behavior                                                                                                                          |
| ------------- | -------------------------------- | ---- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| GET           | /api/orders                      | App  | List orders                             | Query: customer_id?, from_date?, to_date?, search?, sort_by?, sort_dir?, limit, offset                     | 200: `{ items: [ order objects ], pagination }`. Each row per ADR-017 orders table; includes customer name, line item count.                  |
| GET           | /api/orders/[id]                 | App  | Get one order with line items           | Path: id                                                                                                   | 200: `{ ...order, items: [ order_items ] }`. 404 if not found.                                                                               |
| POST          | /api/orders                      | App  | Create new order                        | Body: { order_number?, customer_id?, items: [ { inventory_id, quantity?, unit_price? } ], order_date? }     | Create order + order_items rows with ship-to snapshot from customer/address. 201: created order with items. 400 if validation fails (ADR-021). |
| PATCH         | /api/orders/[id]                 | App  | Update order fields                     | Body: partial order fields (shipping_date?, shipper?, seller_shipping_cost?, notes?, ship_to fields?, etc.) | 200: updated order. 404 if not found. 400 if validation fails.                                                                               |
| POST or PATCH | /api/orders/[id]/mark-paid       | App  | Mark order as paid                      | Path: id                                                                                                   | Set was_paid=1 on the order. 200: updated order. 404 if not found.                                                                           |

**Mark as paid (order):** The UI "Mark as paid" applies to an order. The API provides a single endpoint: POST or PATCH /api/orders/[id]/mark-paid — sets was_paid=1. 200: updated order. 404 if order not found.

No DELETE for orders: we do not support deleting order rows (audit trail). Void/cancel by setting `order_status` to ‘void’ or ‘cancelled’. Corrections are done via PATCH.

**Note (updated 2026-05-24):** The original ADR-018 used `/api/purchases` paths from the single-purchase-table design. The implementation uses `/api/orders` and `/api/orders/[id]` for the three-table model (orders + order_items + purchases). The `/api/purchases` paths are deprecated and should not be used for new development. Mark-shipped and link-customer endpoints are defined in section "Additional endpoints and changes" (§13, §14).

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

**5) GET `/api/orders` success (200, paginated)**

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
- File upload for pictures: multipart/form-data; server stores files per ADR-010/ADR-026 and updates inventory picture columns and thumbnail (ADR-002).
- Report content: exact content and data for each report type are specified in **ADR-013** (Report content section).
- Listing generation mode strategy (manual vs integrated AI vs portable handoff) is governed by **ADR-023**. Any API additions for export/import/approve flow must be added here before implementation is considered complete.
- **Print shipping label:** Sales UI command (no separate API required). **No automated connection to any shipping service.** App generates and prints the label using order ship-to and stored Shipping Info. If required Shipping Info is missing, tell user and how to navigate to Config → Shipping Info. See `documents/shipping-label-carrier-templates.md`. If the order has no carrier or ship-to data, show a message and prompt the user to complete the order first. See `ui-design.md` and `design-decisions-implementation.md` §1.

### Additional endpoints and changes (updated 2026-05-24)

The following endpoints and modifications are specified by ADRs 029-037. They extend the API surface defined in sections 1-10 above.

**11. List endpoint query parameters (ADR-029)**

All list endpoints (`GET /api/inventory`, `GET /api/customers`, `GET /api/orders`) accept these additional optional query parameters:

| Parameter  | Type   | Description                                                                 |
| ---------- | ------ | --------------------------------------------------------------------------- |
| `search`   | string | Free-text search across relevant text columns (item_number, description, customer name, etc.) |
| `sort_by`  | string | Column name to sort by (e.g. `created_at`, `order_date`, `item_number`)     |
| `sort_dir` | string | `asc` or `desc` (default `desc`)                                            |

The existing `limit`/`offset` pagination contract (section "Pagination contract") applies unchanged.

**12. Outstanding endpoint (ADR-020 implementation)**

| Method | Path              | Auth | Purpose                    | Request                          | Response / behavior                                                          |
| ------ | ----------------- | ---- | -------------------------- | -------------------------------- | ---------------------------------------------------------------------------- |
| GET    | /api/outstanding  | App  | Aggregated outstanding list | Query: type? (filter by type)   | 200: `{ items: [ { type, type_label, entity_id, summary, date, ... } ] }`. All 6 outstanding types aggregated server-side. |

**13. Mark shipped (ADR-031)**

| Method | Path                              | Auth | Purpose          | Request                                                      | Response / behavior                    |
| ------ | --------------------------------- | ---- | ---------------- | ------------------------------------------------------------ | -------------------------------------- |
| POST   | /api/orders/[id]/mark-shipped     | App  | Mark order shipped | Body: `{ shipper, tracking_number?, shipping_date? }`       | 200: updated order. Sets shipping_date, shipper, tracking_number on the order row. |

**14. Link customer to order (ADR-031)**

| Method | Path                              | Auth | Purpose              | Request                           | Response / behavior                    |
| ------ | --------------------------------- | ---- | -------------------- | --------------------------------- | -------------------------------------- |
| POST   | /api/orders/[id]/link-customer    | App  | Assign customer to order | Body: `{ customer_id }`         | 200: updated order.                    |

**15. Image serving (ADR-033)**

| Method | Path                    | Auth | Purpose                                   | Request        | Response / behavior                                                         |
| ------ | ----------------------- | ---- | ----------------------------------------- | -------------- | --------------------------------------------------------------------------- |
| GET    | /api/uploads/[...path]  | App  | Serve uploaded images and thumbnails      | Path segments  | 200: image binary with correct Content-Type. 404 if file not found. Serves from `uploads/` directory per ADR-026. |

**16. Per-order report documents (ADR-036)**

| Method | Path                                  | Auth | Purpose                          | Request                        | Response / behavior                         |
| ------ | ------------------------------------- | ---- | -------------------------------- | ------------------------------ | ------------------------------------------- |
| GET    | /api/reports/invoice/[orderId]        | App  | Invoice PDF/CSV for one order    | Query: format? (pdf/csv)       | 200: PDF or CSV per ADR-013. 404 if not found. |
| GET    | /api/reports/thank-you-note/[orderId] | App  | Thank-you note for one order     | Query: format? (pdf/csv)       | 200: PDF or CSV per ADR-013. 404 if not found. |

These are convenience aliases for the existing `/api/reports/invoice?order_id=X` and `/api/reports/thank-you-note?order_id=X` endpoints in section 9 above. Both patterns are valid; the path-based routes are preferred for per-order documents.

**17. Activity log (ADR-037)**

| Method | Path           | Auth | Purpose              | Request                                                                 | Response / behavior                                                |
| ------ | -------------- | ---- | -------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| GET    | /api/activity  | App  | Activity log entries | Query: entity_type?, entity_id?, action?, limit? (default 50), offset? | 200: `{ items: [ { id, action, entity_type, entity_id, entity_label, detail_json, source, created_at } ], pagination }`. |
