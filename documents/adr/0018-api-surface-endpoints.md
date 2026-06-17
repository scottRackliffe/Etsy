# ADR-018: API surface — endpoints and behavior (no ambiguity)

## Status

Accepted

## Date

2025-02-15 (extended through ADR-069, 2026-05-24)

## Context

The application exposes a set of API routes (Next.js App Router). Every endpoint must be specified so an implementer knows exactly what to build: method, path, purpose, request shape (if any), response shape or behavior, and error handling. No endpoint may be left implied.

Schema: **ADR-017**. Customer sales: **`/api/orders`** + **`order_items`**. Vendor buys: **`/api/purchases`** (buy-side only). Deprecated: **`/api/purchases`** paths for customer sales (pre-reconciliation).

## Decision

The following endpoints constitute the **full API surface** (sections 1–10 and Extensions §11–§29). All routes are relative to the app base (`/api`). Request/response bodies are JSON unless stated otherwise. Authentication: where “Etsy auth” is required, the server resolves auth via SQLite-backed auth/session records (session id in HTTP-only cookie). Unauthenticated requests to protected routes return 401. Where “none” is stated, the route is public.

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
- 202: accepted; long-running work started (returns `job_id` per §8).
- 204: successful delete/no-content action.
- 400: validation or malformed request.
- 401: not authenticated.
- 404: resource not found.
- 409: conflict (referential integrity ADR-022, concurrent edit ADR-046, duplicate key).
- 413: request entity too large (e.g. CSV import per ADR-047).
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
- **Report and list date filters:** canonical query params are `from_date` and `to_date` (inclusive on both bounds). Endpoints introduced in ADR-038/039 may also accept `start_date`/`end_date` as aliases; servers should normalize to `from_date`/`to_date`.

**7) Concurrent edit — `If-Match` (ADR-046)**

- Protected **PATCH** requests for `inventory`, `orders`, `customers`, and `addresses` should include header `If-Match: "<updated_at>"` (ISO 8601 from last GET).
- If the row’s current `updated_at` differs: **409** with error code `CONCURRENT_EDIT` and `user_message` prompting reload.
- Excluded: POST create, DELETE, batch POST (ADR-040), CSV import POST (ADR-047), settings PUT, undo-driven PATCH without If-Match (ADR-067 — client must reload on 409).

**8) Long-running operations — jobs (ADR-043)**

Operations that may exceed ~3s (Etsy sync, large batch, backup, CSV import, combined print queue) return **202**:

```json
{ "ok": true, "job_id": "job_<opaque>", "status": "running" }
```

Poll `GET /api/jobs/[job_id]` or subscribe via `GET /api/jobs/[job_id]/stream` (SSE). Cancel: `DELETE /api/jobs/[job_id]`. Completed jobs include `result` JSON; failed jobs include error envelope in `result` or `error`.

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

| Method | Path           | Auth | Purpose                          | Request                                                         | Response / behavior                                                                                                                                                                                                                                                                                                                       |
| ------ | -------------- | ---- | -------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | /api/sync/etsy | Etsy | Sync Etsy receipts into local DB | Body (optional): { shop_id: number } or none (use default shop) | Fetch receipts from Etsy for the shop; for each receipt not already present (by etsy_receipt_id in orders), create customer (if new), address (if new), order + order_items rows per line item; set orders.etsy_receipt_id. Exact behavior: ADR-019. 200: { synced: number, created_orders: number } or equivalent. 401 if not connected. |

---

### 4. Inventory (ADR-002, ADR-017)

| Method | Path                                         | Auth | Purpose                                               | Request                                                                                                | Response / behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------ | -------------------------------------------- | ---- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | /api/inventory/next-number                   | App  | Get next auto-generated item number                   | —                                                                                                      | 200: `{ next_number, next_id, prefix, padding }`. Uses `inventory.number_prefix` and `inventory.number_padding` settings with `MAX(id)+1`.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| GET    | /api/orders/next-number                      | App  | Get next auto-generated order number                  | —                                                                                                      | 200: `{ next_number, next_id, prefix, padding }`. Uses `order.number_prefix` and `order.number_padding` settings. Scans `orders` for highest manual order number matching the prefix pattern.                                                                                                                                                                                                                                                                                                                                                                       |
| GET    | /api/zip-lookup                              | App  | Lookup city/state from postal code                    | Query: `zip` (required), `country` (optional, default "US")                                            | 200: `{ city, state }`. Proxies to Zippopotam.us API. Returns `{ city: null, state: null }` if not found (used by UI to show validation warning).                                                                                                                                                                                                                                                                                                                                                                                                                  |
| GET    | /api/inventory                               | App  | List inventory items                                  | Query: status, store_category (optional filters), limit, offset                                        | 200: `{ items: [ inventory row ], pagination }`. Each row: all columns per ADR-017 inventory table (id, item_number, description, …).                                                                                                                                                                                                                                                                                                                                                                                                                              |
| GET    | /api/inventory/[id]                          | App  | Get one inventory item                                | Path: id                                                                                               | 200: single inventory object. 404 if not found.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| POST   | /api/inventory                               | App  | Create inventory item                                 | Body: { item_number, description?, purchase_cost?, … } per schema; validation per ADR-021              | 201: created object (with id, created_at, updated_at). 400 if validation fails (ADR-021).                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| PATCH  | /api/inventory/[id]                          | App  | Update inventory item                                 | Body: partial object (only fields to update)                                                           | 200: updated object. 404 if not found. 400 if validation fails.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| GET    | /api/inventory/[id]/listing-readiness        | App  | Check if item is ready for listing-generation request | Path: id                                                                                               | 200: `{ item_id, ready, missing_fields, checks, picture_count }`. Uses same preflight rules as generate endpoint: item_number, description, condition_code, sale_revenue (>0), and at least one picture. 404 if item not found.                                                                                                                                                                                                                                                                                                                                    |
| POST   | /api/inventory/[id]/listing-export           | App  | Export portable AI package                            | Path: id                                                                                               | 200: `{ package }` where package includes schema_version, export_id, item context, picture references, required output schema, and quality instructions. 400 if readiness checks fail.                                                                                                                                                                                                                                                                                                                                                                             |
| POST   | /api/inventory/[id]/listing-import           | App  | Import portable AI draft                              | Path: id; Body: portable package output JSON                                                           | Validates schema_version/item_id and required listing fields, stores import audit, updates listing draft fields, marks draft source as portable import. 200 updated item; 400 for schema/validation errors.                                                                                                                                                                                                                                                                                                                                                        |
| POST   | /api/inventory/[id]/listing-approve          | App  | Approve listing draft                                 | Path: id                                                                                               | Requires readiness checks and non-empty listing title/description/tags. Sets listing draft state to approved. 200 updated item.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| POST   | /api/inventory/[id]/publish-to-etsy          | App  | Publish approved listing to Etsy                      | Path: id                                                                                               | Requires approved draft and Etsy publish settings. Per-item fields (`etsy_when_made`, `etsy_taxonomy_id`, `etsy_who_made`, `etsy_shipping_profile_id`, `etsy_return_policy_id`) override global defaults per ADR-017 §1c. Sends `who_made`, `when_made`, `taxonomy_id`, `shipping_profile_id`, `return_policy_id`, `readiness_state_id`, `materials[]`, `item_weight/length/width/height` + units, `is_supply`, `type=physical` to Etsy `createDraftListing`. Uploads local pictures (1–20) + optional video one-by-one with retry. Activates listing, persists `etsy_listing_id`, marks `published`. Blocks if any required Etsy field missing (400), if not approved (409), or if no images available (409). |
| DELETE | /api/inventory/[id]                          | App  | Delete or retire inventory                            | Path: id. Query or body: action = "delete" \| "retire" if both supported                               | Behavior per ADR-022. If delete: 204 or 200. If inventory has **order_items** (customer sales): 409 per ADR-022; retire instead.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| POST   | /api/inventory/[id]/pictures                 | App  | Add or replace pictures                               | Multipart: files and/or slot numbers; or JSON with directory path for “import from folder” per ADR-010 | Store files per ADR-010; update picture_1…picture_20; generate and store thumbnail per ADR-002/015. 200: { picture_slots: [...] }. 400 if invalid.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| PATCH  | /api/inventory/[id]/pictures/reorder         | App  | Reorder picture slots                                 | Body: { order: [ slot indices or picture ids ] }                                                       | Update picture_1…picture_20 order. 200: updated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| DELETE | /api/inventory/[id]/pictures/[slot]          | App  | Remove picture from slot                              | Path: id, slot (1–20 or 1–5 for condition)                                                             | Set picture_N or condition_picture_N to null. 200 or 204.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| POST   | /api/inventory/[id]/generate-listing-content | App  | Generate listing content via AI                       | Path: id                                                                                               | Preflight validation required before request is allowed: item_number, description, condition_code, sale_revenue (>0), and at least one picture. Then send **all** item pictures (picture_1…20, condition_picture_1…5 — every non-empty) plus item context to AI per etsy-listing-template-and-requirements.md §3. Return listing_title, listing_description, listing_tags; write to inventory. 200: { listing_title, listing_description, listing_tags }. 400 with field errors if prerequisites missing. 404 if not found.                                        |

“App” auth: session or cookie that identifies the user (same as Etsy cookie when connected, or app-specific session when we add non-Etsy users). For single-user app, “App” may mean “any authenticated session.”

---

### 5. Inventory other costs (ADR-002, ADR-017 `other_costs`)

| Method | Path                            | Auth | Purpose                      | Request                                                 | Response / behavior                                                                                                     |
| ------ | ------------------------------- | ---- | ---------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| GET    | /api/inventory/[id]/other-costs | App  | List other costs for an item | Path: id                                                | 200: `{ items: [ { id, inventory_id, cost_type, amount, note, created_at, updated_at } ] }` or equivalent list wrapper. |
| POST   | /api/inventory/[id]/other-costs | App  | Add other cost line          | Body: { amount, cost_type?, note? }; validation ADR-021 | 201: created row. 400 if validation fails.                                                                              |
| PATCH  | /api/other-costs/[id]           | App  | Update other cost line       | Body: { amount?, cost_type?, note? }                    | 200: updated. 404 if not found.                                                                                         |
| DELETE | /api/other-costs/[id]           | App  | Delete other cost line       | Path: id                                                | 204. 404 if not found.                                                                                                  |

---

### 6. Customer (ADR-003)

| Method | Path                          | Auth | Purpose                                        | Request                                                                                                           | Response / behavior                                                                                                          |
| ------ | ----------------------------- | ---- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| GET    | /api/customers                | App  | List customers                                 | Query: q (search name/email optional), limit, offset                                                              | 200: `{ items: [ ... ], pagination }`.                                                                                       |
| GET    | /api/customers/[id]           | App  | Get customer with addresses and purchase count | Path: id                                                                                                          | 200: customer + addresses[] + purchaseCount or purchases[]. 404 if not found.                                                |
| POST   | /api/customers                | App  | Create customer                                | Body: { first_name?, last_name?, email? }; validation ADR-021                                                     | 201: created. 400 if validation fails.                                                                                       |
| PATCH  | /api/customers/[id]           | App  | Update customer                                | Body: partial; validation ADR-021                                                                                 | 200: updated. 404/400.                                                                                                       |
| DELETE | /api/customers/[id]           | App  | Delete customer                                | Path: id                                                                                                          | Behavior ADR-022. If customer has **orders**: 409 with message. Else 204.                                                    |
| GET    | /api/customers/[id]/addresses | App  | List addresses for customer                    | Path: id                                                                                                          | 200: { addresses: [ ... ] }.                                                                                                 |
| POST   | /api/customers/[id]/addresses | App  | Add address                                    | Body: { address_line_1, address_line_2?, city, state_province, country, postal_code, label? }; validation ADR-021 | 201: created. 400 if validation fails.                                                                                       |
| PATCH  | /api/addresses/[id]           | App  | Update address                                 | Body: partial                                                                                                     | 200: updated. 404.                                                                                                           |
| DELETE | /api/addresses/[id]           | App  | Delete address                                 | Path: id                                                                                                          | ADR-022. Orders use ship-to snapshot only; address delete allowed if not referenced as `default_address_id`. 204 on success. |

---

### 7. Orders (ADR-003, ADR-004, ADR-019)

| Method        | Path                       | Auth | Purpose                       | Request                                                                                                     | Response / behavior                                                                                                                            |
| ------------- | -------------------------- | ---- | ----------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| GET           | /api/orders                | App  | List orders                   | Query: customer_id?, from_date?, to_date?, search?, sort_by?, sort_dir?, limit, offset                      | 200: `{ items: [ order objects ], pagination }`. Each row per ADR-017 orders table; includes customer name, line item count.                   |
| GET           | /api/orders/[id]           | App  | Get one order with line items | Path: id                                                                                                    | 200: `{ ...order, items: [ order_items ] }`. 404 if not found.                                                                                 |
| POST          | /api/orders                | App  | Create new order              | Body: { order_number?, customer_id?, items: [ { inventory_id, quantity?, unit_price? } ], order_date? }     | Create order + order_items rows with ship-to snapshot from customer/address. 201: created order with items. 400 if validation fails (ADR-021). |
| PATCH         | /api/orders/[id]           | App  | Update order fields           | Body: partial order fields (shipping_date?, shipper?, seller_shipping_cost?, notes?, ship_to fields?, etc.) | 200: updated order. 404 if not found. 400 if validation fails.                                                                                 |
| POST or PATCH | /api/orders/[id]/mark-paid | App  | Mark order as paid            | Path: id                                                                                                    | Set was_paid=1 on the order. 200: updated order. 404 if not found.                                                                             |

**Mark as paid (order):** The UI "Mark as paid" applies to an order. The API provides a single endpoint: POST or PATCH /api/orders/[id]/mark-paid — sets was_paid=1. 200: updated order. 404 if order not found.

No DELETE for orders: we do not support deleting order rows (audit trail). Void/cancel by setting `order_status` to ‘void’ or ‘cancelled’. Corrections are done via PATCH.

**Note (updated 2026-05-24):** Customer sales use `/api/orders` (not deprecated `/api/purchases` sale paths). Vendor buy-side records use `/api/purchases` per ADR-017. Mark-shipped: Extensions §14; link-customer: §15.

---

### 8. Settings (ADR-008, ADR-009)

| Method | Path                             | Auth | Purpose          | Request                                                          | Response / behavior                                                                                                 |
| ------ | -------------------------------- | ---- | ---------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| GET    | /api/settings                    | App  | Get all settings | None                                                             | 200: { key: value, ... } for all keys in settings table (ADR-017).                                                  |
| GET    | /api/settings/[key]              | App  | Get one setting  | Path: key                                                        | 200: { key, value }. 404 if not set.                                                                                |
| PUT    | /api/settings/[key]              | App  | Set one setting  | Body: { value }                                                  | Upsert; 200: { key, value }. Keys per ADR-017 §6 (panel*layout, default_shipper, currency_code, business*\*, etc.). |
| GET    | /api/settings/ai                 | App  | Get AI settings  | None                                                             | 200: masked AI config and capability flags (api key configured, model/provider, budgets).                           |
| PUT    | /api/settings/ai                 | App  | Save AI settings | Body: provider/model/api key/base url/timeout/retry/token budget | 200: masked AI config. Validation errors return 400 with actionable guidance.                                       |
| POST   | /api/settings/ai/test-connection | App  | Test AI settings | None                                                             | 200 on successful provider response; error envelope on failure.                                                     |

---

### 9. Reports (ADR-006, ADR-013)

Reports are generated on demand. Request format via query `format=pdf` or `format=csv` (default pdf). Parameters and content per ADR-006 and ADR-013. After generation the UI offers **Print, Export PDF, Export CSV, Cancel** (ADR-013).

| Method      | Path                           | Auth | Purpose                                 | Request                                                                | Response / behavior                                                       |
| ----------- | ------------------------------ | ---- | --------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| GET or POST | /api/reports/thank-you-note    | App  | Thank-you note for one order            | Query or body: order_id (required), format? (pdf \| csv, default pdf)  | 200: PDF or CSV per ADR-013. 404 if order not found. Content per ADR-013. |
| GET or POST | /api/reports/invoice           | App  | Invoice for one order                   | Query or body: order_id (required), format? (pdf \| csv, default pdf)  | 200: PDF or CSV per ADR-013. 404 if order not found. Content per ADR-013. |
| GET or POST | /api/reports/sales             | App  | Sales report                            | Query or body: from_date?, to_date?, format? (pdf \| csv, default pdf) | 200: PDF or CSV. Content per ADR-013.                                     |
| GET or POST | /api/reports/costs             | App  | Costs report                            | Query or body: from_date?, to_date?, format? (pdf \| csv, default pdf) | 200: PDF or CSV. Content per ADR-013.                                     |
| GET or POST | /api/reports/income-mtd        | App  | Income month-to-date                    | Query or body: format? (pdf \| csv, default pdf)                       | 200: PDF or CSV. Content per ADR-013.                                     |
| GET or POST | /api/reports/income-ytd        | App  | Income year-to-date                     | Query or body: format? (pdf \| csv, default pdf)                       | 200: PDF or CSV. Content per ADR-013.                                     |
| GET or POST | /api/reports/postal-by-vendor  | App  | Postal costs by vendor                  | Query or body: from_date?, to_date?, format? (pdf \| csv, default pdf) | 200: PDF or CSV. Content per ADR-013.                                     |
| GET or POST | /api/reports/outstanding-items | App  | Outstanding items (all to-dos)          | Query or body: format? (pdf \| csv, default pdf)                       | 200: PDF or CSV. Content per ADR-013 (Outstanding items).                 |
| GET or POST | /api/reports/ar-aging          | App  | AR aging (unpaid orders by age bucket)  | Query or body: format? (pdf \| csv, default pdf)                       | 200: PDF or CSV. Content per ADR-013 (AR aging).                          |
| GET or POST | /api/reports/profit-by-item    | App  | Per-item profit and margin (ADR-038)    | Query: from_date?, to_date? (aliases start_date/end_date), format?     | 200: PDF or CSV. Active orders filter per ADR-006/013.                    |
| GET or POST | /api/reports/sales-tax-summary | App  | Sales tax summary (ADR-039)             | Query: from_date?, to_date? (aliases start_date/end_date), format?     | 200: PDF or CSV.                                                          |
| GET or POST | /api/reports/inventory-aging   | App  | Inventory aging / slow movers (ADR-054) | Query: from_date?, to_date?, format?                                   | 200: PDF or CSV.                                                          |
| GET or POST | /api/reports/accounting-export | App  | Accounting CSV export (ADR-056)         | Query: from_date?, to_date?, format=csv                                | 200: CSV (primary).                                                       |
| POST        | /api/reports/print-queue       | App  | Combined print PDF for queue (ADR-055)  | Body: `{ items: [ { type, orderId } ] }`                               | 200: combined PDF; opens for browser print.                               |

Per-order path aliases remain in Extensions §16. Report layouts: ADR-013; scope: ADR-006.

---

### 10. Dashboard (ADR-016, ADR-038, ADR-064, ADR-066)

| Method | Path                           | Auth | Purpose                          | Request | Response / behavior                                                                                                                       |
| ------ | ------------------------------ | ---- | -------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | /api/dashboard                 | App  | Dashboard summary + KPIs         | None    | 200: `{ connected, shop?, receipts_preview?, avg_margin_this_month?, total_profit_this_month?, total_profit_ytd?, ... }` per ADR-016/038. |
| GET    | /api/dashboard/inventory-value | App  | Inventory value widget (ADR-064) | None    | 200: `{ total_items, total_cost_basis, total_list_price, ... }`.                                                                          |
| GET    | /api/dashboard/stats           | App  | Aggregate stats (ADR-066)        | None    | 200: `{ repeat_customers_this_month, ... }`.                                                                                              |

---

### 11. Pick list (ADR-015)

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
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "user_message": "Please fix the highlighted fields.",
    "actions": [],
    "can_retry": false
  },
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
      "order_number": "R-10001",
      "customer_id": 77,
      "order_date": "2026-02-16",
      "was_paid": 1,
      "order_status": "active",
      "payment_status": "paid",
      "grand_total": 98.0,
      "line_item_count": 2
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
  "order_date": "2026-02-16",
  "items": [
    { "inventory_id": 101, "quantity": 1, "unit_price": 98.0 },
    { "inventory_id": 102, "quantity": 1, "unit_price": 45.0 }
  ]
}
```

**7) POST `/api/orders` success (201)**

```json
{
  "id": 9001,
  "order_number": "MAN-2026-00042",
  "customer_id": 77,
  "order_date": "2026-02-16",
  "order_status": "active",
  "was_paid": 0,
  "items": [
    { "id": 1, "order_id": 9001, "inventory_id": 101, "quantity": 1, "line_total": 98.0 },
    { "id": 2, "order_id": 9001, "inventory_id": 102, "quantity": 1, "line_total": 45.0 }
  ],
  "created_at": "2026-02-16T17:22:10Z",
  "updated_at": "2026-02-16T17:22:10Z"
}
```

**8) POST `/api/orders/[id]/mark-paid` success (200)**

```json
{
  "id": 9001,
  "was_paid": 1,
  "payment_status": "paid",
  "updated_at": "2026-02-16T18:00:00Z"
}
```

**9) POST `/api/sync/etsy` success (200 or 202 + job_id)**

```json
{
  "synced": 5,
  "created_orders": 5,
  "updated_orders": 0,
  "errors": 0
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
  "ok": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required",
    "user_message": "Connect your Etsy shop to continue.",
    "actions": ["Go to Dashboard and connect Etsy"],
    "can_retry": false
  }
}
```

**13) Concurrent edit (409, ADR-046)**

```json
{
  "ok": false,
  "error": {
    "code": "CONCURRENT_EDIT",
    "message": "Record was modified elsewhere",
    "user_message": "This record changed in another tab. Reload to see the latest version.",
    "actions": ["Reload"],
    "can_retry": true
  }
}
```

**12) Report endpoint response behavior**

- For `format=pdf`: return `200`, `Content-Type: application/pdf`, and binary PDF content.
- For `format=csv`: return `200`, `Content-Type: text/csv`, and RFC4180 CSV content.
- For missing order-specific input (for example invoice without `order_id`): return `400` with standard error JSON shape.

---

### Appendix B: Extension endpoint schemas (§12–§29, ADR-027–072)

Concrete request/response shapes for extension routes. Global contract (§ Global API contract) applies unless noted. Feature ADRs remain authoritative for UI and business rules; this appendix is the implementer’s JSON reference.

**B1) List query params (§12, ADR-029)** — no body. Example: `GET /api/orders?search=smith&sort_by=order_date&sort_dir=desc&limit=50&offset=0` → paginated list per §3.

**B2) `GET /api/outstanding` (§13, ADR-020)**

Query: `type?` — filter by outstanding type key (e.g. `paid_not_shipped`).

```json
{
  "items": [
    {
      "type": "paid_not_shipped",
      "type_label": "Paid but not shipped",
      "entity_type": "order",
      "entity_id": 9001,
      "record": 9001,
      "summary": "Order R-10001 — Jane Doe — not shipped",
      "date": "2026-02-16",
      "age_days": 12
    }
  ]
}
```

- `record` = deep-link id (ADR-035): `orders.id`, `inventory.id`, `customers.id`, or Etsy `receipt_id` for type 3.
- No pagination in v1 (full union list); panel may cap display client-side.

**B3) `POST /api/orders/[id]/mark-shipped` (§14, ADR-031)**

Request:

```json
{
  "shipper": "USPS",
  "shipping_date": "2026-05-24",
  "tracking_number": "9400111899223344556677",
  "shipped_without_paid_override": false
}
```

- `shipper` required; `shipping_date` required (`YYYY-MM-DD`); `tracking_number` optional.
- If order unpaid and override false → **400** with actionable message; user may retry with `shipped_without_paid_override: true` (ADR-021).
- **200:** full `orders` object (includes `updated_at` for If-Match on later PATCH).

**B4) `POST /api/orders/[id]/link-customer` (§15, ADR-031)**

Request: `{ "customer_id": 77 }`. **200:** updated order. **404** if customer missing.

**B5) `GET /api/uploads/[...path]` (§16, ADR-033)** — binary response; **404** if path invalid or outside `uploads/`.

**B6) Per-order reports (§17, ADR-036)** — `GET /api/reports/invoice/[orderId]?format=pdf|csv` and thank-you note equivalent. Same as §9 with path param; **404** if order not found.

**B7) `GET /api/activity` (§18, ADR-037)**

Query: `entity_type?`, `entity_id?`, `action?`, `limit?` (default 50), `offset?`.

```json
{
  "items": [
    {
      "id": 501,
      "action": "order.marked_shipped",
      "entity_type": "order",
      "entity_id": 9001,
      "entity_label": "R-10001",
      "detail_json": { "shipper": "USPS", "tracking_number": "9400…" },
      "source": "user",
      "created_at": "2026-05-24T18:00:00Z"
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "total": 120, "has_more": true }
}
```

**B8) Backup (§19, ADR-027)**

`POST /api/backup` → **200:**

```json
{
  "ok": true,
  "filename": "backup_20260524_180000.sqlite",
  "size_bytes": 2457600,
  "backup_count": 12
}
```

Or **202** + `job_id` for large backups (§8). `GET /api/backup` → `{ "backups": [ { "filename", "created_at", "size_bytes" } ], "total": 12 }`. `DELETE /api/backup/[filename]` → **204**. `POST /api/backup/restore` body `{ "filename": "backup_20260524_180000.sqlite" }` → **200:** `{ "ok": true, "pre_restore_backup": "backup_pre_restore_….sqlite" }`.

**B9) `GET /api/search` (§20, ADR-041)**

Query: `q` (required, min 2 chars), `limit?` (default 5 per group, max 20).

```json
{
  "ok": true,
  "orders": {
    "items": [
      {
        "id": 42,
        "order_number": "ORD-2024-0042",
        "ship_to_first_name": "John",
        "ship_to_last_name": "Smith",
        "grand_total": 125.0,
        "order_status": "active",
        "order_date": "2026-05-20"
      }
    ],
    "total": 12
  },
  "inventory": {
    "items": [
      {
        "id": 15,
        "item_number": "TCT-0042",
        "description": "Vintage brass lamp",
        "status": "Listed"
      }
    ],
    "total": 3
  },
  "customers": {
    "items": [{ "id": 7, "first_name": "John", "last_name": "Smith", "email": "john@example.com" }],
    "total": 2
  }
}
```

**400** if `q` length &lt; 2: `code: "QUERY_TOO_SHORT"`.

**B10) Batch (§21, ADR-040)**

`POST /api/orders/batch` (inventory/customers analogous):

Request:

```json
{
  "action": "mark_shipped",
  "ids": [1, 2, 3],
  "params": {
    "shipper": "USPS",
    "shipping_date": "2026-05-24",
    "tracking_number": null,
    "shipped_without_paid_override": true
  }
}
```

Response (**200** even on partial success):

```json
{
  "ok": true,
  "succeeded": 2,
  "failed": [{ "id": 3, "reason": "Order is void and cannot be updated" }],
  "total": 3
}
```

Valid actions: orders — `mark_paid`, `mark_shipped`, `void`; inventory — `change_status`, `delete`; customers — `delete`. **400** if `ids.length > 100` (`BATCH_TOO_LARGE`) or invalid `action`.

**B11) Jobs (§22, ADR-043)**

**202** start: `{ "ok": true, "job_id": "job_abc123", "status": "running" }`.

`GET /api/jobs/[job_id]` running:

```json
{
  "ok": true,
  "job_id": "job_abc123",
  "status": "running",
  "progress": { "current": 15, "total": 42, "message": "Processing receipt #1234567890" },
  "started_at": "2026-05-24T19:30:00Z",
  "elapsed_ms": 12000
}
```

Completed: `status: "completed"`, `result` object (action-specific, e.g. sync `{ synced, created_orders, skipped?, errors? }`). Failed: `status: "failed"`, `error` envelope. Cancelled: `status: "cancelled"`. `DELETE /api/jobs/[job_id]` → **200** or **204**. SSE `GET /api/jobs/[job_id]/stream`: events `progress`, `completed`, `failed` with same JSON payloads.

**B12) `GET /api/health` (§23, ADR-050)**

```json
{ "ok": true, "timestamp": "2026-05-24T20:00:00Z" }
```

No auth required.

**B13) CSV import (§24, ADR-047)**

`POST /api/inventory/import/preview` — `multipart/form-data`, field `file`. **200:**

```json
{
  "columns": ["item_number", "description", "purchase_cost"],
  "rows": [
    {
      "row": 1,
      "valid": true,
      "data": { "item_number": "A001", "description": "Vase" },
      "errors": []
    },
    {
      "row": 2,
      "valid": false,
      "data": {},
      "errors": [{ "field": "status", "message": "Invalid status value 'unknown'" }]
    }
  ],
  "total_rows": 142
}
```

`POST /api/inventory/import` — same upload; **200:** `{ "imported": 138, "skipped": 4, "errors": [ { "row": 12, "field": "item_number", "message": "Item number already exists" } ] }`. Large files → **202** + `job_id`. **413** if file &gt; 5 MB.

**B14) Duplicates and listing score (§24, ADR-048, ADR-068)**

`GET /api/inventory/check-duplicate?description=...` (min 5 chars) → `{ "duplicates": [ { "id", "item_number", "description" } ] }` (max 5).

`GET /api/customers/check-duplicate?first_name=&last_name=&email?` → `{ "duplicates": [ { "id", "first_name", "last_name", "email" } ] }`.

`GET /api/inventory/[id]/listing-score` → `{ "score", "grade", "tips": [], "breakdown": { ... } }` per ADR-068.

**B15) Customer extensions (§25, ADR-052, ADR-053, ADR-065)**

`GET /api/customers/[id]/orders?limit=25&offset=0`:

```json
{
  "summary": {
    "total_orders": 12,
    "total_spent": 1456.78,
    "first_order_date": "2024-03-15",
    "last_order_date": "2026-05-20"
  },
  "items": [
    {
      "id": 42,
      "order_number": "ORD-2026-042",
      "order_date": "2026-05-20",
      "order_status": "active",
      "payment_status": "paid",
      "source_channel": "etsy",
      "grand_total": 89.99,
      "shipped": true,
      "items": [
        {
          "inventory_id": 101,
          "description": "Blue ceramic vase",
          "quantity": 1,
          "unit_price": 89.99
        }
      ]
    }
  ],
  "pagination": { "limit": 25, "offset": 0, "total": 12, "has_more": false }
}
```

`GET /api/customers/duplicates` → `{ "groups": [ { "customers": [ ... ], "match_reason": "Same last name, similar first name" } ] }`.

`POST /api/customers/merge` — see ADR-053; **200:** `{ "ok": true, "merged_customer_id": 1, "orders_moved": 3, "addresses_moved": 1 }`. **400** if `primary_id === secondary_id`; **404** if not found.

Notes: `GET/POST /api/customers/[id]/notes`, `DELETE /api/customer-notes/[id]` — shapes in ADR-065 (paginated list, create body `{ note_text, note_type? }`, **201** note, **204** delete).

**B16) Inventory computed fields (§26, ADR-038)**

List/detail inventory items include when applicable:

```json
{
  "id": 42,
  "item_number": "TCT-0042",
  "purchase_cost": 25.0,
  "shipping_cost": 8.5,
  "sale_revenue": 75.0,
  "other_costs_total": 5.0,
  "total_cost": 38.5,
  "net_profit": 36.5,
  "margin_pct": 48.67,
  "roi_pct": 94.81
}
```

`GET /api/reports/profit-by-item?from_date=&to_date=&format=pdf|csv` — PDF/CSV per ADR-013; accepts `start_date`/`end_date` as aliases.

**B17) Dashboard (§10, ADR-016/038/064/066)**

`GET /api/dashboard`:

```json
{
  "connected": true,
  "shop": { "shop_id": "12345", "shop_name": "Trudy's Classic Treasures" },
  "last_etsy_sync_at": "2026-05-24T17:00:00Z",
  "receipts_preview": [],
  "avg_margin_this_month": 42.3,
  "avg_margin_this_month_count": 15,
  "total_profit_this_month": 634.5,
  "total_profit_ytd": 4280.0
}
```

`GET /api/dashboard/inventory-value` → `{ "at_cost", "at_sale_price", "potential_margin", "potential_margin_pct", "item_count" }` (ADR-064).

`GET /api/dashboard/stats` → `{ "repeat_customers_this_month": 8 }` (ADR-066).

**B18) Sample data (§27, ADR-069)**

`POST /api/seed/sample-data` → **201:** `{ "ok": true, "items_created": 10, "customers_created": 5, "orders_created": 8 }`. **409** `SAMPLE_DATA_EXISTS` if `SAMPLE-%` items exist. `DELETE /api/seed/sample-data` → **204** or **404** `NO_SAMPLE_DATA`.

**B19) Reports — tax, aging, accounting (ADR-039, ADR-054, ADR-056)**

- `GET /api/reports/sales-tax-summary?from_date=&to_date=&format=pdf|csv` — monthly buckets per ADR-039; `start_date`/`end_date` aliases allowed.
- `GET /api/reports/inventory-aging?from_date=&to_date=&format=pdf|csv` — default export via `format=` (canonical per §6). JSON preview optional: `{ items, summary: { total_items, total_cost, avg_days_in_stock, buckets } }`.
- `GET /api/reports/accounting-export?from_date=&to_date=&format=csv` — **400** if `format` ≠ `csv`; CSV attachment per ADR-056.

**B20) `POST /api/sync/etsy` (ADR-019)** — may return **200** or **202** + `job_id`.

```json
{
  "synced": 5,
  "created_orders": 5,
  "created_order_items": 7,
  "skipped": [{ "receipt_id": "999", "reason": "No line items" }],
  "errors": 0
}
```

**409** if `sync_in_progress` already set.

**B21) Inventory list (§28)** — `GET /api/inventory?status=Listed&search=&sort_by=margin_pct&sort_dir=desc` — paginated; `status` filter optional; computed profitability fields per B16.

**B29) Listing Coach (§29, ADR-072)**

All three routes: `multipart/form-data`. Auth: App (local mode OK without Etsy token). Requires AI configured.

**B29a) `POST /api/listing-coach/analyze`**

Form fields:

- `item_photos[]` — File[] (required, 1–20)
- `condition_photos[]` — File[] (optional, 0–5)
- `google_photos[]` — File[] (optional, 0–3)
- `video` — File (optional, MP4/MOV, max 100 MB)

200:

```json
{
  "ok": true,
  "photo_review": {
    "classifications": [
      { "photo_index": 0, "type": "hero", "confidence": "high" },
      { "photo_index": 1, "type": "detail", "confidence": "high" },
      { "photo_index": 2, "type": "angle", "confidence": "medium" }
    ],
    "suggested_order": [0, 2, 1],
    "present_shots": ["hero", "angle", "detail"],
    "missing_shots": ["backstamp", "scale"],
    "advisories": ["Consider a plain background for the hero photo."]
  },
  "suggested_identification": "Vintage Fiesta ware pitcher, Homer Laughlin, red glaze",
  "suggested_condition_code": "Excellent",
  "suggested_when_made": "1970s",
  "suggested_taxonomy_id": 12345,
  "suggested_taxonomy_path": "Home & Living > Kitchen & Dining > Serveware > Pitchers",
  "suggested_materials": ["ceramic", "glaze"],
  "suggested_dimensions": {
    "length": null, "width": null, "height": 9.5,
    "unit": "in", "note": "Estimated from scale photo"
  },
  "price": {
    "suggested_list_price": 65,
    "suggested_price_low": 55,
    "suggested_price_high": 75,
    "confidence": "medium",
    "rationale": "Google results show similar red Fiesta pitchers listed $58–72."
  },
  "confirm_cards": [
    {
      "id": "what_is_it",
      "question": "What is this item?",
      "suggested_answer": "Red Fiesta ware pitcher, Homer Laughlin, mid-century.",
      "optional": false
    },
    {
      "id": "included",
      "question": "What's included?",
      "suggested_answer": "One pitcher only.",
      "optional": false
    },
    {
      "id": "condition",
      "question": "What condition issues should buyers know?",
      "suggested_answer": "Excellent vintage condition; light glaze wear on base.",
      "optional": false
    },
    {
      "id": "buyer",
      "question": "Who is this for?",
      "suggested_answer": "Fiesta collectors and vintage kitchen decor buyers.",
      "optional": false
    },
    {
      "id": "materials",
      "question": "What material(s) is this made of?",
      "suggested_answer": "Ceramic with glazed finish",
      "optional": true
    },
    {
      "id": "special",
      "question": "Anything special to highlight?",
      "suggested_answer": "",
      "optional": true
    }
  ]
}
```

- `price.confidence`: `high` | `medium` | `low`
- `suggested_condition_code`: ADR-002 enum
- **503** `AI_NOT_CONFIGURED` | **500** `LISTING_ANALYZE_FAILED`

**B29b) `POST /api/listing-coach/compose`**

Form fields:

- Same photo fields as B29a
- `confirm_answers` — JSON string: `[{ "id": "what_is_it", "answer": "..." }, ...]` (required ids: `what_is_it`, `included`, `condition`, `buyer`; `materials` and `special` optional)
- `price` — JSON string: `{ "sale_revenue": 65, "accept_offer_note": "Accept offers $55–$60" }` (`sale_revenue` nullable)
- `identification_override` — optional string
- `when_made` — string (Etsy enum from ADR-017 §1a, e.g. `1970s`)
- `taxonomy_id` — number (Etsy numeric taxonomy ID)
- `materials` — JSON string: `["ceramic", "glaze"]` (array of material strings)
- `dimensions` — JSON string: `{ "length": 6, "width": 6, "height": 9.5, "unit": "in", "weight": 32, "weight_unit": "oz" }` (optional)

200:

```json
{
  "ok": true,
  "listing_title": "Vintage Red Fiesta Ware Pitcher Homer Laughlin Mid Century Kitchen",
  "listing_description": "…",
  "listing_tags": "fiesta pitcher, homer laughlin, red fiesta, vintage pitcher, …",
  "listing_category_path": "Home & Living > Kitchen & Dining > …",
  "listing_title_strategy": "…",
  "listing_product_story": "…",
  "listing_condition_clarity": "…",
  "listing_attributes": "…",
  "listing_pricing_shipping_notes": "…",
  "listing_quality_checklist": "…",
  "quality_score": {
    "score": 82,
    "hints": ["Add a scale photo for size reference", "You have 11 of 13 tags — add 2 more"]
  }
}
```

- **500** `LISTING_COMPOSE_FAILED`

**B29c) `POST /api/listing-coach/complete`**

Form fields:

- Same photo fields as B29a (v1: re-upload required)
- `payload` — JSON string:

```json
{
  "item_number": "TCT-2026-042",
  "description": "Red Fiesta pitcher",
  "status": "In stock",
  "condition_code": "Excellent",
  "sale_revenue": 65,
  "etsy_when_made": "1970s",
  "etsy_taxonomy_id": 12345,
  "materials": ["ceramic", "glaze"],
  "item_weight": 32,
  "item_weight_unit": "oz",
  "item_length": 6,
  "item_width": 6,
  "item_height": 9.5,
  "item_dimensions_unit": "in",
  "picture_classifications": [
    {"slot": 1, "type": "hero"},
    {"slot": 2, "type": "angle"},
    {"slot": 3, "type": "detail"}
  ],
  "compose": {
    "listing_title": "…",
    "listing_description": "…",
    "listing_tags": "…",
    "listing_category_path": "…",
    "listing_title_strategy": "…",
    "listing_product_story": "…",
    "listing_condition_clarity": "…",
    "listing_attributes": "…",
    "listing_pricing_shipping_notes": "…",
    "listing_quality_checklist": "…"
  }
}
```

201:

```json
{
  "ok": true,
  "item_id": 123,
  "item_number": "TCT-2026-042",
  "picture_count": 4
}
```

- **409** duplicate `item_number` | **400** validation

**B29d) `POST /api/listing-coach/refine`**

Per-field or global AI refinement of listing content. JSON request (not multipart). No web search — uses listing context only. Lightweight AI call.

Request:

```json
{
  "mode": "field",
  "field_name": "listing_description",
  "current_value": "A gorgeous vintage plate...",
  "instruction": "Add detail about the gold trim on the rim",
  "context": {
    "identification": "Homer Laughlin Fiesta Dinner Plate",
    "listing_title": "Vintage Homer Laughlin Fiesta Ware...",
    "listing_description": "...",
    "listing_tags": "...",
    "listing_category_path": "Home & Living > Kitchen...",
    "listing_condition_clarity": "...",
    "listing_product_story": "...",
    "listing_attributes": "...",
    "listing_pricing_shipping_notes": "...",
    "listing_title_strategy": "...",
    "listing_quality_checklist": "...",
    "condition_code": "Excellent",
    "condition_notes": "...",
    "materials": "ceramic, glaze",
    "sale_price": 45
  }
}
```

200:

```json
{
  "ok": true,
  "fields": {
    "listing_description": "A gorgeous vintage plate with delicate gold trim..."
  }
}
```

For global mode, set `mode: "global"` and omit `field_name`/`current_value`. The AI returns only fields it changed.

Valid field names: `listing_title`, `listing_description`, `listing_tags`, `listing_category_path`, `listing_title_strategy`, `listing_product_story`, `listing_condition_clarity`, `listing_attributes`, `listing_pricing_shipping_notes`, `listing_quality_checklist`, `condition_notes`, `identification`, `sale_price`.

**B30) Shipping API — EasyPost (§30, ADR-074)**

All endpoints require App auth. EasyPost API key must be configured.

**B30a) `POST /api/orders/[id]/shipping-rates`**

Request:

```json
{
  "weight_oz": 12,
  "length_in": 8,
  "width_in": 5,
  "height_in": 5
}
```

All fields optional — falls back to order-level values, then `easypost.default_*` settings.

200:

```json
{
  "ok": true,
  "shipment_id": "shp_abc123",
  "rates": [
    {
      "id": "rate_xyz789",
      "carrier": "USPS",
      "service": "Ground Advantage",
      "rate": "4.15",
      "currency": "USD",
      "delivery_days": 4,
      "delivery_date": "2026-06-15"
    }
  ],
  "address_verified": true,
  "address_corrections": null
}
```

- **400** `SHIPPING_NOT_CONFIGURED` | **400** `VALIDATION_ERROR` (missing ship-to) | **422** `ADDRESS_INVALID`

**B30b) `POST /api/orders/[id]/shipping-buy`**

Request:

```json
{
  "shipment_id": "shp_abc123",
  "rate_id": "rate_xyz789"
}
```

200:

```json
{
  "ok": true,
  "tracking_number": "9400111899563824449661",
  "tracking_url": "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899563824449661",
  "label_url": "/api/orders/42/shipping-label",
  "carrier": "USPS",
  "service": "Ground Advantage",
  "rate_cents": 415
}
```

- Updates `orders`: `tracking_number`, `easypost_shipment_id`, `label_url`, `label_format`, `shipping_rate_cents`, `shipping_carrier_service`, `shipping_date` (if not set).
- Logs `shipping.label_purchased` activity.
- **402** `INSUFFICIENT_FUNDS` | **409** `LABEL_ALREADY_PURCHASED`

**B30c) `POST /api/orders/[id]/shipping-refund`**

No request body. Uses stored `easypost_shipment_id`.

200:

```json
{
  "ok": true,
  "refund_status": "submitted"
}
```

- Clears `label_url`, `label_format`, `easypost_shipment_id`, `shipping_rate_cents`, `shipping_carrier_service` on order. Keeps `tracking_number` for audit.
- Logs `shipping.label_voided` activity.
- **404** if no shipment on order | **409** if label already scanned by carrier

**B30d) `GET /api/orders/[id]/shipping-label`**

Query: `format?` — `"pdf"` | `"html"`.

- If `label_url` exists: serves stored PDF/PNG (`Content-Type: application/pdf`).
- If no `label_url` or `format=html`: falls back to legacy HTML label (`Content-Type: text/html`).
- **400** if ship-to incomplete (legacy mode) | **404** if order not found

**B30e) `POST /api/shipping/validate-address`**

Request:

```json
{
  "name": "Jane Smith",
  "street1": "123 Main St",
  "street2": "",
  "city": "Austin",
  "state": "TX",
  "zip": "78701",
  "country": "US"
}
```

200:

```json
{
  "ok": true,
  "valid": true,
  "original": {
    "street1": "123 Main St",
    "city": "Austin",
    "state": "TX",
    "zip": "78701"
  },
  "verified": {
    "street1": "123 Main Street",
    "city": "Austin",
    "state": "TX",
    "zip": "78701-1234"
  },
  "corrections": ["Street suffix expanded", "ZIP+4 added"]
}
```

- **422** if address is not deliverable

**B30f) `POST /api/shipping/batch-buy`**

Request:

```json
{
  "order_ids": [1, 2, 3],
  "rate_preference": "cheapest",
  "weight_oz": 12,
  "length_in": 8,
  "width_in": 5,
  "height_in": 5
}
```

- `rate_preference`: `"cheapest"` (default) or `"fastest"`
- Parcel dimensions optional — per-order overrides or settings defaults.

200:

```json
{
  "ok": true,
  "total": 3,
  "succeeded": 2,
  "failed": 1,
  "results": [
    { "order_id": 1, "success": true, "tracking_number": "940...", "rate_cents": 415 },
    { "order_id": 2, "success": true, "tracking_number": "940...", "rate_cents": 870 },
    { "order_id": 3, "success": false, "error": "Ship-to address incomplete" }
  ]
}
```

- Each successful order updated like B30b. Logs `shipping.batch_completed` activity.

---

## Consequences

- **Positive:** Single place for all endpoints; no ambiguity for implementers.
- **Negative:** Any new endpoint or change must update this ADR.

## Notes

- “App” auth: for single-user app, use the same Etsy cookie when the user is connected; no separate session mechanism is required; protected routes must return 401 when not authenticated.
- File upload for pictures: multipart/form-data; server stores files per ADR-010/ADR-026 and updates inventory picture columns and thumbnail (ADR-002).
- Report content: exact content and data for each report type are specified in **ADR-013** (Report content section).
- Listing generation mode strategy (manual vs integrated AI vs portable handoff vs Listing Coach) is governed by **ADR-023** and **ADR-072**. Listing endpoints are in section 4; extensions §24–§29 cover ADR-038–072.
- **Full extension index:** §12–§32 (ADR-027–074 plus vendor receipts). **Appendix B** provides concrete JSON for extension endpoints; feature ADRs remain authoritative for UI and edge cases.
- **Print shipping label (dual mode — ADR-074):** Two modes: (1) **EasyPost integrated** — rate shop, buy label with postage, auto-tracking via `§30` endpoints. (2) **Legacy local** — generates HTML address label from order ship-to + stored Shipping Info; no postage, no tracking. If EasyPost not configured, only legacy mode is available. If required Shipping Info is missing for legacy mode, tell user and how to navigate to Config → Shipping Info. See `documents/shipping-label-carrier-templates.md` and ADR-074.

### Extensions (updated 2026-05-24)

The following extend sections 1–11 above. ADRs **027**, **029–037**, and **038–069** are indexed here so this ADR remains the single API catalog.

**§12. List endpoint query parameters (ADR-029)**

All list endpoints (`GET /api/inventory`, `GET /api/customers`, `GET /api/orders`) accept these additional optional query parameters:

| Parameter  | Type   | Description                                                                                   |
| ---------- | ------ | --------------------------------------------------------------------------------------------- |
| `search`   | string | Free-text search across relevant text columns (item_number, description, customer name, etc.) |
| `sort_by`  | string | Column name to sort by (e.g. `created_at`, `order_date`, `item_number`)                       |
| `sort_dir` | string | `asc` or `desc` (default `desc`)                                                              |

The existing `limit`/`offset` pagination contract (section "Pagination contract") applies unchanged.

**§13. Outstanding endpoint (ADR-020)**

| Method | Path             | Auth | Purpose                     | Request                       | Response / behavior                                                                                                           |
| ------ | ---------------- | ---- | --------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| GET    | /api/outstanding | App  | Aggregated outstanding list | Query: type? (filter by type) | 200: `{ items: [ { type, type_label, entity_id, summary, date, ... } ] }`. Types per ADR-020 (v1 may omit future-only types). |

**§14. Mark shipped (ADR-031)**

| Method | Path                          | Auth | Purpose            | Request                                               | Response / behavior                                                                |
| ------ | ----------------------------- | ---- | ------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| POST   | /api/orders/[id]/mark-shipped | App  | Mark order shipped | Body: `{ shipper, tracking_number?, shipping_date? }` | 200: updated order. Sets shipping_date, shipper, tracking_number on the order row. |

**§15. Link customer to order (ADR-031)**

| Method | Path                           | Auth | Purpose                  | Request                 | Response / behavior |
| ------ | ------------------------------ | ---- | ------------------------ | ----------------------- | ------------------- |
| POST   | /api/orders/[id]/link-customer | App  | Assign customer to order | Body: `{ customer_id }` | 200: updated order. |

**§16. Image serving (ADR-033)**

| Method | Path                   | Auth | Purpose                              | Request       | Response / behavior                                                                                               |
| ------ | ---------------------- | ---- | ------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| GET    | /api/uploads/[...path] | App  | Serve uploaded images and thumbnails | Path segments | 200: image binary with correct Content-Type. 404 if file not found. Serves from `uploads/` directory per ADR-026. |

**§17. Per-order report documents (ADR-036)**

| Method | Path                                  | Auth | Purpose                       | Request                  | Response / behavior                            |
| ------ | ------------------------------------- | ---- | ----------------------------- | ------------------------ | ---------------------------------------------- |
| GET    | /api/reports/invoice/[orderId]        | App  | Invoice PDF/CSV for one order | Query: format? (pdf/csv) | 200: PDF or CSV per ADR-013. 404 if not found. |
| GET    | /api/reports/thank-you-note/[orderId] | App  | Thank-you note for one order  | Query: format? (pdf/csv) | 200: PDF or CSV per ADR-013. 404 if not found. |

These are convenience aliases for the existing `/api/reports/invoice?order_id=X` and `/api/reports/thank-you-note?order_id=X` endpoints in section 9 above. Both patterns are valid; the path-based routes are preferred for per-order documents.

**§18. Activity log (ADR-037)**

| Method | Path          | Auth | Purpose              | Request                                                                | Response / behavior                                                                                                                                         |
| ------ | ------------- | ---- | -------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | /api/activity | App  | Activity log entries | Query: entity_type?, entity_id?, action?, limit? (default 50), offset? | 200: `{ items: [ { id, action, entity_type, entity_id, entity_label, detail_json, source, created_at } ], pagination }`. `source`: user, system, etsy_sync. |

**§19. Backup and restore (ADR-027)**

| Method | Path                   | Auth | Purpose             | Request / response                                                                            |
| ------ | ---------------------- | ---- | ------------------- | --------------------------------------------------------------------------------------------- |
| POST   | /api/backup            | App  | Trigger backup now  | 200: `{ ok, filename, size_bytes, backup_count }`. May return 202 + job_id for large backups. |
| GET    | /api/backup            | App  | List backup files   | 200: `{ backups: [ { filename, created_at, size_bytes } ], total }`.                          |
| DELETE | /api/backup/[filename] | App  | Delete one backup   | 204.                                                                                          |
| POST   | /api/backup/restore    | App  | Restore from backup | Body: `{ filename }`. 200: `{ ok, pre_restore_backup }`.                                      |

**§20. Global search (ADR-041)**

| Method | Path        | Auth | Purpose             | Request                                               | Response                                                                           |
| ------ | ----------- | ---- | ------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| GET    | /api/search | App  | Cross-entity search | Query: `q` (required), `limit?` (default 5 per group) | 200: `{ ok: true, inventory: [], orders: [], customers: [] }` (shape per ADR-041). |

**§21. Batch operations (ADR-040)**

| Method | Path                 | Auth | Purpose             | Request                                                                                 | Response                                                                     |
| ------ | -------------------- | ---- | ------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| POST   | /api/orders/batch    | App  | Batch order actions | `{ action, ids, params? }` — actions: `mark_paid`, `mark_shipped`, `void`. Max 100 ids. | 200: `{ succeeded, failed, results[] }`. >10 items: progress UI per ADR-043. |
| POST   | /api/inventory/batch | App  | Batch inventory     | `{ action, ids, params? }` — `change_status`, `delete`                                  | Same partial-success shape.                                                  |
| POST   | /api/customers/batch | App  | Batch customers     | `{ action, ids }` — `delete` only                                                       | Same.                                                                        |

Optional v1 extension: `{ action, filter }` without `ids` for “select all matching current list filter” (ADR-040 Notes) — if implemented, document max cap and audit log entries.

**§22. Jobs (ADR-043)**

| Method | Path                      | Auth | Purpose                         |
| ------ | ------------------------- | ---- | ------------------------------- |
| GET    | /api/jobs/[job_id]        | App  | Poll job status/progress/result |
| GET    | /api/jobs/[job_id]/stream | App  | SSE progress stream             |
| DELETE | /api/jobs/[job_id]        | App  | Cancel running job              |

**§23. Health (ADR-050)**

| Method | Path        | Auth | Purpose                                                   |
| ------ | ----------- | ---- | --------------------------------------------------------- |
| GET    | /api/health | None | Liveness: `{ ok: true, timestamp }` — no session required |

**§24. Inventory import and duplicates (ADR-047, ADR-048, ADR-068)**

| Method | Path                              | Auth | Purpose                                 |
| ------ | --------------------------------- | ---- | --------------------------------------- |
| POST   | /api/inventory/import/preview     | App  | CSV preview/validation                  |
| POST   | /api/inventory/import             | App  | CSV create rows (202 + job_id if large) |
| GET    | /api/inventory/check-duplicate    | App  | Query: `description`                    |
| GET    | /api/inventory/[id]/listing-score | App  | Listing quality score (ADR-068)         |

**§25. Customer extensions (ADR-052, ADR-053, ADR-065)**

| Method | Path                           | Auth | Purpose                                                   |
| ------ | ------------------------------ | ---- | --------------------------------------------------------- |
| GET    | /api/customers/[id]/orders     | App  | Purchase timeline with summaries (ADR-052)                |
| GET    | /api/customers/duplicates      | App  | Suggested duplicate pairs (ADR-053)                       |
| POST   | /api/customers/merge           | App  | Body: `{ primary_id, secondary_id }` — irreversible merge |
| GET    | /api/customers/[id]/notes      | App  | Paginated customer notes (ADR-065)                        |
| POST   | /api/customers/[id]/notes      | App  | Create note                                               |
| DELETE | /api/customer-notes/[id]       | App  | Delete one note                                           |
| GET    | /api/customers/check-duplicate | App  | Query: `first_name`, `last_name`, `email?`                |

List/detail `GET /api/customers` responses include `order_count` (ADR-066).

**§26. Computed inventory fields (ADR-038)**

`GET /api/inventory` and `GET /api/inventory/[id]` include computed profitability fields when applicable: `total_cost`, `net_profit`, `margin_pct`, `roi_pct` (formulas in ADR-038). List may support `sort_by=margin_pct` per ADR-029 naming.

**§27. Sample data (ADR-069)**

| Method | Path                  | Auth | Purpose                                   |
| ------ | --------------------- | ---- | ----------------------------------------- |
| POST   | /api/seed/sample-data | App  | Load demo dataset (ConfirmDialog ADR-032) |
| DELETE | /api/seed/sample-data | App  | Remove demo data                          |

**§28. Inventory list extensions**

`GET /api/inventory` supports ADR-029 `search`, `sort_by`, `sort_dir`, `limit`, `offset`, plus optional `status` filter (section 4).

**§29. Listing Coach (ADR-072)**

Guided new-listing flow: analyze pasted photos (+ optional Google Visual Search screenshots), compose listing from confirm answers, create inventory row with pictures. Requires integrated AI (Config); Etsy OAuth not required when local mode is active. Full request/response shapes: **ADR-072**.

| Method | Path                          | Auth | Purpose                                                            |
| ------ | ----------------------------- | ---- | ------------------------------------------------------------------ |
| POST   | `/api/listing-coach/analyze`  | App  | Combined research + compose: photo review, identification, pricing, full listing |
| POST   | `/api/listing-coach/compose`  | App  | Legacy: Final listing + template fields from confirms + images             |
| POST   | `/api/listing-coach/complete` | App  | Create inventory, store pictures, persist listing draft            |
| POST   | `/api/listing-coach/refine`   | App  | Per-field or global AI refinement of listing content               |

Analyze and complete accept `multipart/form-data` with `item_photos[]` (1–20), optional `condition_photos[]` (0–5), optional `google_photos[]` (0–3), optional `video` (MP4/MOV). Image validation per ADR-026. Complete also accepts `when_made`, `taxonomy_id`, `materials`, `dimensions`, `quantity`, `shipping_cost_inbound`, `category_tags`, `internal_notes`, `is_supply`, `vendor_name`, `vendor_shipping_price`, `vendor_reference_number`, `vendor_notes` fields (ADR-072). Refine accepts JSON: `{ mode, field_name?, current_value?, instruction, context }` — returns `{ ok, fields }`. Errors: 400 validation, 503 when AI not configured (`AI_NOT_CONFIGURED`).

**§30. Shipping API — EasyPost integration (ADR-074)**

Rate shopping, label purchase, refund, address validation, and batch operations via EasyPost. All endpoints require App auth. EasyPost API key must be configured (settings or env var). If not configured, return 400 with code `SHIPPING_NOT_CONFIGURED`.

| Method | Path                                     | Auth | Purpose                                | Request                                                       | Response / behavior                                                                   |
| ------ | ---------------------------------------- | ---- | -------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| POST   | `/api/orders/[id]/shipping-rates`        | App  | Create EasyPost shipment, return rates | Body: `{ weight_oz?, length_in?, width_in?, height_in? }`     | 200: `{ ok, shipment_id, rates: [{ id, carrier, service, rate, currency, delivery_days, delivery_date }], address_verified, address_corrections }` |
| POST   | `/api/orders/[id]/shipping-buy`          | App  | Buy selected rate, download label      | Body: `{ shipment_id, rate_id }`                              | 200: `{ ok, tracking_number, tracking_url, label_url, carrier, service, rate_cents }` |
| POST   | `/api/orders/[id]/shipping-refund`       | App  | Void/refund unused label               | No body (uses stored easypost_shipment_id)                    | 200: `{ ok, refund_status }`. Clears label fields on order. |
| GET    | `/api/orders/[id]/shipping-label`        | App  | Serve purchased label or legacy HTML   | Query: `format?` ("pdf"\|"html")                              | 200: PDF binary or HTML. Falls back to legacy HTML if no purchased label. |
| POST   | `/api/shipping/validate-address`         | App  | Validate/normalize a ship-to address   | Body: `{ name, street1, street2?, city, state, zip, country }` | 200: `{ ok, valid, original, verified, corrections }` |
| POST   | `/api/shipping/batch-buy`                | App  | Batch label purchase for multiple orders | Body: `{ order_ids, rate_preference, weight_oz?, length_in?, width_in?, height_in? }` | 200: `{ ok, total, succeeded, failed, results: [{ order_id, success, tracking_number?, rate_cents?, error? }] }` |

Error codes: `SHIPPING_NOT_CONFIGURED` (400), `ADDRESS_INVALID` (422), `INSUFFICIENT_FUNDS` (402), `LABEL_ALREADY_PURCHASED` (409), `RATE_LIMIT` (429). Full error catalog: ADR-074 §9. Full request/response shapes: **Appendix B §B30**.

**§31. Vendor purchase receipts (added 2026-06-16)**

Manage scanned/manual vendor purchase receipts and link receipt items to inventory. These are **buy-side** receipts (what the seller bought from vendors), not Etsy customer receipts.

| Method | Path                                        | Auth | Purpose                                      | Request / response                                                                                                                                   |
| ------ | ------------------------------------------- | ---- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/receipts`                             | App  | List all vendor purchase receipts            | 200: `{ items: Receipt[], pagination }`. Each receipt includes nested `items: ReceiptItem[]`.                                                        |
| POST   | `/api/receipts`                             | App  | Create a new receipt (manual or from OCR)     | Body: `{ vendor_name, purchase_date, notes?, items: [{ description, quantity, unit_price }] }`. 201: created receipt with items.                      |
| GET    | `/api/receipts/[id]`                        | App  | Get single receipt with items                | 200: receipt object with `items[]`.                                                                                                                   |
| PATCH  | `/api/receipts/[id]`                        | App  | Update receipt header fields                 | Body: partial receipt fields. 200: updated receipt.                                                                                                   |
| DELETE | `/api/receipts/[id]`                        | App  | Delete receipt and all its items             | 204. Unlinks any inventory items first.                                                                                                               |
| PATCH  | `/api/receipts/[id]/items/[itemId]`         | App  | Update receipt item (including inventory link) | Body: `{ inventory_id?, description?, quantity?, unit_price? }`. When `inventory_id` is set: updates inventory `purchase_cost`, `date_purchased`, inserts a `purchases` record. When `inventory_id` is null: removes link, deletes auto-created purchases record. 200: updated item. |
| POST   | `/api/receipts/ocr`                         | App  | OCR scan a receipt image                     | Body: `multipart/form-data` with `image` file (JPEG/PNG). Uses AI to extract vendor, date, line items. 200: `{ vendor_name, purchase_date, items[] }`. 503 if AI not configured. |

Cross-ref: ADR-030 (vendor sourcing section), ADR-017 (`receipts`, `receipt_items`, `purchases` tables).

**§32. Etsy Taxonomy Cache**

Local cache of Etsy's seller taxonomy (category tree) and per-category properties/attributes. Data is fetched from the Etsy Open API v3 application-level endpoints (no OAuth required, only API key). Stored in `etsy_taxonomy_nodes` and `etsy_taxonomy_properties` tables (ADR-017).

| Method | Path                                                | Auth | Purpose                                        | Request / response                                                                                                         |
| ------ | --------------------------------------------------- | ---- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/etsy-taxonomy/sync`                           | App  | Full sync of taxonomy nodes from Etsy          | No body. 200: `{ ok, nodesInserted, durationMs, lastSyncAt }`. Replaces all existing nodes.                               |
| GET    | `/api/etsy-taxonomy/sync`                           | App  | Get taxonomy sync status                       | 200: `{ ok, lastSyncAt, nodeCount }`                                                                                       |
| GET    | `/api/etsy-taxonomy/nodes`                          | App  | List taxonomy nodes                            | Query: `parent_id` (optional, root if omitted), `q` (optional search). 200: `{ ok, items: TaxonomyNode[] }`               |
| GET    | `/api/etsy-taxonomy/nodes/[id]/properties`          | App  | Get properties for a taxonomy node             | Path param: `id`. Properties are fetched from Etsy on-demand if not cached. 200: `{ ok, items: TaxonomyProperty[], node }` |
