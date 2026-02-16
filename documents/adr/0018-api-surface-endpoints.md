# ADR-018: API surface — endpoints and behavior (no ambiguity)

## Status

Accepted

## Date

2025-02-15

## Context

The application exposes a set of API routes (Next.js App Router or equivalent). Every endpoint must be specified so an implementer knows exactly what to build: method, path, purpose, request shape (if any), response shape or behavior, and error handling. No endpoint may be left implied.

## Decision

The following endpoints constitute the full API surface. All routes are relative to the app base (e.g. `/api` for backend routes). Request/response bodies are JSON unless stated otherwise. Authentication: where “Etsy auth” is required, the server reads the token from HTTP-only cookies (ADR-007); unauthenticated requests to protected routes return 401. Where “none” is stated, the route is public or uses only the same cookie for consistency.

---

### 1. Auth (ADR-007)

| Method | Path | Auth | Purpose | Request | Response / behavior |
|--------|------|------|---------|---------|---------------------|
| GET | /api/auth/etsy | None | Start Etsy OAuth | None | Set state and code_verifier in cookies; redirect 302 to Etsy authorization URL. |
| GET | /api/auth/etsy/callback | None | OAuth callback | Query: code, state | Validate state (cookie); exchange code for tokens; set access + refresh token cookies; redirect 302 to home (e.g. /). On error: redirect to home with query param error= (message). |
| POST | /api/auth/logout | None | Log out | None | Clear token (and related) cookies; respond 200 or 204. |

---

### 2. Etsy proxy (base system — no DB persistence)

| Method | Path | Auth | Purpose | Request | Response / behavior |
|--------|------|------|---------|---------|---------------------|
| GET | /api/shop | Etsy | List user’s Etsy shops | None | 200: { shops: [ { shop_id, shop_name }, ... ] }. 401 if not connected. |
| GET | /api/receipts | Etsy | List receipts for a shop | Query: shop_id (required), limit (optional, default e.g. 100), offset (optional) | 200: { results: [ receipt objects ], count: number }. Receipt object: receipt_id, order_id, name, first_line, second_line, city, state, zip, country_iso, total_price, total_shipping_cost, currency_code, was_paid, was_shipped, creation_tsz, message_from_buyer (or equivalent from Etsy API). 401 if not connected. 400 if shop_id missing. |

---

### 3. Etsy sync (persist Etsy orders to DB)

| Method | Path | Auth | Purpose | Request | Response / behavior |
|--------|------|------|---------|---------|---------------------|
| POST | /api/sync/etsy | Etsy | Sync Etsy receipts into local DB | Body (optional): { shop_id: number } or none (use default shop) | Fetch receipts from Etsy for the shop; for each receipt not already present (by etsy_receipt_id in purchase), create customer (if new), customer_address (if new), and purchase row(s) per line item; set order_id = etsy_receipt_id, etsy_receipt_id on each purchase. Exact behavior: ADR-019. 200: { synced: number, created_orders: number } or equivalent. 401 if not connected. |

---

### 4. Inventory (ADR-002, ADR-017)

| Method | Path | Auth | Purpose | Request | Response / behavior |
|--------|------|------|---------|---------|---------------------|
| GET | /api/inventory | App | List inventory items | Query: status (optional filter), limit, offset | 200: { items: [ inventory row ], total: number }. Each row: all columns per ADR-017 inventory table (id, item_number, description, …). |
| GET | /api/inventory/[id] | App | Get one inventory item | Path: id | 200: single inventory object. 404 if not found. |
| POST | /api/inventory | App | Create inventory item | Body: { item_number, description?, purchase_cost?, … } per schema; validation per ADR-021 | 201: created object (with id, created_at, updated_at). 400 if validation fails (ADR-021). |
| PATCH | /api/inventory/[id] | App | Update inventory item | Body: partial object (only fields to update) | 200: updated object. 404 if not found. 400 if validation fails. |
| DELETE | /api/inventory/[id] | App | Delete or retire inventory | Path: id. Query or body: action = "delete" \| "retire" if both supported | Behavior per ADR-022 (referential integrity). If delete: 204 or 200. If inventory has purchases: 409 or 400 with message per ADR-022. |
| POST | /api/inventory/[id]/pictures | App | Add or replace pictures | Multipart: files and/or slot numbers; or JSON with directory path for “import from folder” per ADR-010 | Store files per ADR-010; update picture_1…picture_10; generate and store thumbnail per ADR-002/015. 200: { picture_slots: [...] }. 400 if invalid. |
| PATCH | /api/inventory/[id]/pictures/reorder | App | Reorder picture slots | Body: { order: [ slot indices or picture ids ] } | Update picture_1…picture_10 order. 200: updated. |
| DELETE | /api/inventory/[id]/pictures/[slot] | App | Remove picture from slot | Path: id, slot (1–10 or 1–5 for condition) | Set picture_N or condition_picture_N to null. 200 or 204. |
| POST | /api/inventory/[id]/generate-listing-content | App | Generate listing content via AI | Path: id | Send **all** item pictures (picture_1…10, condition_picture_1…5 — every non-empty) plus item context to AI per etsy-listing-template-and-requirements.md §3. Return listing_title, listing_description, listing_tags; write to inventory. 200: { listing_title, listing_description, listing_tags }. 400 if no pictures. 404 if not found. |

“App” auth: session or cookie that identifies the user (same as Etsy cookie when connected, or app-specific session when we add non-Etsy users). For single-user app, “App” may mean “any authenticated session.”

---

### 5. Inventory other costs (ADR-002)

| Method | Path | Auth | Purpose | Request | Response / behavior |
|--------|------|------|---------|---------|---------------------|
| GET | /api/inventory/[id]/other-costs | App | List other costs for an item | Path: id | 200: { costs: [ { id, inventory_id, amount, description, created_at }, ... ] }. |
| POST | /api/inventory/[id]/other-costs | App | Add other cost line | Body: { amount, description }; validation ADR-021 | 201: created row. 400 if validation fails. |
| PATCH | /api/other-costs/[id] | App | Update other cost line | Body: { amount?, description? } | 200: updated. 404 if not found. |
| DELETE | /api/other-costs/[id] | App | Delete other cost line | Path: id | 204. 404 if not found. |

---

### 6. Customer (ADR-003)

| Method | Path | Auth | Purpose | Request | Response / behavior |
|--------|------|------|---------|---------|---------------------|
| GET | /api/customers | App | List customers | Query: q (search name/email optional), limit, offset | 200: { customers: [ ... ], total }. |
| GET | /api/customers/[id] | App | Get customer with addresses and purchase count | Path: id | 200: customer + addresses[] + purchaseCount or purchases[]. 404 if not found. |
| POST | /api/customers | App | Create customer | Body: { first_name?, last_name?, email? }; validation ADR-021 | 201: created. 400 if validation fails. |
| PATCH | /api/customers/[id] | App | Update customer | Body: partial; validation ADR-021 | 200: updated. 404/400. |
| DELETE | /api/customers/[id] | App | Delete customer | Path: id | Behavior ADR-022. If has purchases: 409 with message. Else 204. |
| GET | /api/customers/[id]/addresses | App | List addresses for customer | Path: id | 200: { addresses: [ ... ] }. |
| POST | /api/customers/[id]/addresses | App | Add address | Body: { address_line_1, address_line_2?, city, state_province, country, postal_code, label? }; validation ADR-021 | 201: created. 400 if validation fails. |
| PATCH | /api/addresses/[id] | App | Update address | Body: partial | 200: updated. 404. |
| DELETE | /api/addresses/[id] | App | Delete address | Path: id | ADR-022. If used in purchase: 409 or allow (snapshot on purchase). 204 otherwise. |

---

### 7. Purchase / orders (ADR-003, ADR-004)

| Method | Path | Auth | Purpose | Request | Response / behavior |
|--------|------|------|---------|---------|---------------------|
| GET | /api/purchases | App | List purchases (orders) | Query: customer_id?, order_id?, from_date?, to_date?, limit, offset | 200: { purchases: [ ... ], total }. Each row per ADR-017 purchase table; optionally include customer name, inventory description. |
| GET | /api/orders/[order_id] | App | Get all purchase rows for one order | Path: order_id | 200: { order_id, purchases: [ ... ] } (all rows with that order_id). 404 if none. |
| GET | /api/purchases/[id] | App | Get one purchase row | Path: id | 200: purchase object. 404 if not found. |
| POST | /api/orders | App | Create new order (one or more purchase rows) | Body: { customer_id, customer_address_id?, items: [ { inventory_id, discount_amount? } ], date_of_purchase? } | Create order_id (e.g. UUID); for each item create purchase row with snapshot from customer/address; set order_id. 201: { order_id, purchases: [ ... ] }. 400 if validation fails (ADR-021). |
| PATCH | /api/purchases/[id] | App | Update purchase (e.g. mark paid, mark shipped) | Body: partial: was_paid?, shipping_date?, shipper?, shipping_cost?, discount_amount?, notes? (validation ADR-021) | 200: updated. 404. 400 if validation fails. |

**Mark as paid (order):** The UI “Mark as paid” applies to an order (all purchase rows with the same order_id). Implementation either (a) PATCH each purchase row with was_paid=1, or (b) expose a single endpoint (e.g. POST /api/orders/[order_id]/mark-paid) that sets was_paid=1 for every purchase row with that order_id. Either approach is valid.

No DELETE for purchases: we do not support deleting purchase rows (audit trail). Corrections are done via PATCH or support process.

---

### 8. Settings (ADR-008, ADR-009)

| Method | Path | Auth | Purpose | Request | Response / behavior |
|--------|------|------|---------|---------|---------------------|
| GET | /api/settings | App | Get all settings | None | 200: { key: value, ... } for all keys in settings table (ADR-017). |
| GET | /api/settings/[key] | App | Get one setting | Path: key | 200: { key, value }. 404 if not set. |
| PUT | /api/settings/[key] | App | Set one setting | Body: { value } | Upsert; 200: { key, value }. Keys per ADR-017 §6 (panel_layout, default_shipper, currency_code, business_*, etc.). |

---

### 9. Reports (ADR-006, ADR-013)

Reports are generated on demand and returned as PDF. Parameters and content per ADR-006 and ADR-013 (report content section in ADR-013). After generation the UI offers View, Print, Back, Cancel (ADR-013).

| Method | Path | Auth | Purpose | Request | Response / behavior |
|--------|------|------|---------|---------|---------------------|
| GET or POST | /api/reports/thank-you-note | App | Generate thank-you note PDF for one order | Query or body: order_id (required) | 200: PDF body (Content-Type: application/pdf). 404 if order not found. Content per ADR-013 (report content section). |
| GET or POST | /api/reports/invoice | App | Generate invoice PDF for one order | Query or body: order_id (required) | 200: PDF. 404 if order not found. Content per ADR-013 (report content section). |
| GET or POST | /api/reports/sales | App | Generate sales report PDF | Query or body: from_date?, to_date? | 200: PDF. Content per ADR-013 (report content section). |
| GET or POST | /api/reports/costs | App | Generate costs report PDF | Query or body: from_date?, to_date? | 200: PDF. Content per ADR-013 (report content section). |
| GET or POST | /api/reports/income-mtd | App | Income month-to-date PDF | None | 200: PDF. Content per ADR-013 (report content section). |
| GET or POST | /api/reports/income-ytd | App | Income year-to-date PDF | None | 200: PDF. Content per ADR-013 (report content section). |
| GET or POST | /api/reports/postal-by-vendor | App | Postal costs by vendor PDF | Query or body: from_date?, to_date? | 200: PDF. Content per ADR-013 (report content section). |

---

### 10. Pick list (ADR-015)

| Method | Path | Auth | Purpose | Request | Response / behavior |
|--------|------|------|---------|---------|---------------------|
| GET | /api/inventory/pick-list | App | List inventory for item picker (picture icon + name) | Query: q? (filter by item name/substring, case-insensitive) | 200: { items: [ { id, item_number, description, thumbnail_path, name_or_description } ] }. Used by “New order” and “Add sale for this customer.” Filter by q per ADR-015. |

---

## Consequences

- **Positive:** Single place for all endpoints; no ambiguity for implementers.
- **Negative:** Any new endpoint or change must update this ADR.

## Notes

- “App” auth: implementer may use the same Etsy cookie for single-user or add a separate session mechanism; protected routes must return 401 when not authenticated.
- File upload for pictures: multipart/form-data; server stores files per ADR-010 and updates inventory picture columns and thumbnail (ADR-002).
- Report content: exact content and data for each report type are specified in **ADR-013** (Report content section).
