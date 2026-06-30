# Etsy API Documentation Audit — 2026-05-25

Reviewed all official Etsy developer docs against `src/lib/etsy.ts` and auth routes.

## Fixes Applied (committed to `feature/final-system-completion`)

1. **x-api-key header** — built as `clientId:sharedSecret` via central `getApiKeyHeader()` helper
2. **charset=utf-8** — added to all form-urlencoded Content-Type headers
3. **Bearer token validation** — `assertBearerFormat()` validates `userId.token` pattern
4. **Invalid scope removed** — `receipts_r` is not a valid Etsy scope; receipts are covered by `transactions_r`

## Open Item: Price Format in createDraftListing

The Listings Tutorial shows `price: "1000"` for a $10.00 item — meaning price is in **cents**
(smallest currency unit), not dollars. Our `createDraftListing` does `form.set("price", String(params.price))`.
If `params.price` comes from `sale_revenue` stored in dollars, we'd send the wrong value.

**Action:** Trace the data flow from UI → API to confirm whether conversion is needed.
This only affects the publish-to-Etsy write path, which is not yet live.

## Docs Reviewed (source: developer.etsy.com)

### 1. Authentication
- OAuth 2.0 Authorization Code + PKCE — our implementation is fully compliant
- Token endpoint: `POST https://api.etsy.com/v3/public/oauth/token`
- Token response format: `{ access_token: "userId.token", token_type: "Bearer", expires_in: 3600, refresh_token: "userId.token" }`
- Valid scopes: `address_r`, `address_w`, `billing_r`, `cart_r`, `cart_w`, `email_r`, `favorites_r`, `favorites_w`, `feedback_r`, `listings_d`, `listings_r`, `listings_w`, `profile_r`, `profile_w`, `recommend_r`, `recommend_w`, `shops_r`, `shops_w`, `transactions_r`, `transactions_w`
- Our requested scopes: `transactions_r shops_r listings_r listings_w`
- PKCE: code_verifier 43-128 chars from `[A-Za-z0-9._~-]`, code_challenge = base64url(SHA256(verifier))
- Refresh token lifetime: 90 days

### 2. Request Standards
- All requests require `x-api-key: clientId:sharedSecret`
- Bearer token format: `userId.accessToken` (numeric prefix from OAuth response)
- Base URL: `https://api.etsy.com/v3/application` (authenticated), `https://api.etsy.com/v3/public` (OAuth token endpoint)
- POST/PATCH with form-urlencoded must include `charset=utf-8`

### 3. Listings Tutorial
- `createDraftListing`: POST `/shops/{shopId}/listings`, form-urlencoded
- Required params: quantity, title, description, price, who_made, when_made, taxonomy_id
- Required for physical: shipping_profile_id, readiness_state_id
- Required for active: image_ids (at least one image)
- `uploadListingImage`: POST multipart to `/shops/{shopId}/listings/{listingId}/images`, field name `image`
- `updateListing` (state): PATCH `/shops/{shopId}/listings/{listingId}`, form-urlencoded `state=active|draft|inactive`
- Listing states: draft, published (active), deactivated, sold out, expired
- `who_made` enum: includes `someone_else` (appropriate for vintage)
- `when_made` enum: includes decade values like `"1970s"`
- Shipping profiles: required for physical, created via `/shops/{shopId}/shipping-profiles`
- Processing profiles: required for physical, created via `/shops/{shopId}/readiness-state-definitions`
- `min_processing_time`/`max_processing_time` deprecated (was Q1 2026), replaced by processing profiles

### 4. Payments Tutorial
- Read-only endpoints, requires `transactions_r` scope
- `GET /shops/{shopId}/payment-account/ledger-entries` — running account balance
- `GET /shops/{shopId}/payments` — detailed payment breakdown (fees, taxes, shipping)
- Payment records only exist after fulfillment (shipping)
- Useful for future: profit/loss reports (ADR-038), tax reports (ADR-039), accounting export (ADR-056)

### 5. Third Variation Tutorial
- **Deadline: June 1, 2026** — apps must support reading 3 variations
- Receipt transactions may now have 3 elements in `variations` array
- Our app is safe: we don't consume variation data from receipts
- `updateListingInventory` needs `max_variations_supported=3` query param for 3 variations
- We don't use `updateListingInventory` (vintage items are single-product listings)
- Money type in responses: `{ amount: 1000, divisor: 100, currency_code: "USD" }` = $10.00

### 6. API Testing Policy
- Create test listings in draft state (our `createDraftListing` does this)
- Use prices < $1 for test listings
- Enable Developer Mode in shop settings during development
- Include "test" in shop name or listing title/description when testing
- Cancel accidental test purchases immediately

### 7. Personalization Migration
- Legacy fields (`is_personalizable`, etc.) deprecated April 9, 2026 (already past)
- New endpoints: GET/POST/DELETE `/listings/{listing_id}/personalization`
- We don't use personalization — no impact

### 8. Webhooks
- Events: `order.paid`, `order.canceled`, `order.shipped`, `order.delivered`
- Requires publicly accessible callback URL — **not compatible with our local app architecture**
- Signature verification: HMAC-SHA256 with signing secret
- Our polling approach (ADR-057) is correct for a local app
- If app moves to hosted deployment, webhooks would replace polling

### 9. Quick Start Tutorial
- Confirms `userId.token` format and `x-api-key: clientId:sharedSecret`
- Ping endpoint: `GET /v3/application/openapi-ping` (no auth needed, good for health checks)
- OAuth error response: `{ error: "...", error_description: "..." }`
- Token endpoint accepts both JSON and form-urlencoded (we use form-urlencoded per auth doc)

## Missing Endpoints (future work)

| Endpoint | Purpose | When needed |
|---|---|---|
| `GET /v3/application/openapi-ping` | Health check without auth | ADR-050 network handling |
| `GET /shops/{shopId}/shipping-profiles` | List shipping profiles | Before publish-to-Etsy |
| `POST /shops/{shopId}/shipping-profiles` | Create shipping profile | Before publish-to-Etsy |
| `GET /shops/{shopId}/readiness-state-definitions` | List processing profiles | Before publish-to-Etsy |
| `POST /shops/{shopId}/readiness-state-definitions` | Create processing profile | Before publish-to-Etsy |
| `GET /seller-taxonomy/nodes` | List taxonomy categories | Before publish-to-Etsy |
| `GET /seller-taxonomy/nodes/{taxonomy_id}/properties` | Category properties | Before publish-to-Etsy |
| `GET /shops/{shopId}/payments` | Payment details | ADR-038/039/056 reports |
| `GET /shops/{shopId}/payment-account/ledger-entries` | Ledger for reports | ADR-056 accounting export |

## Etsy MCP Server

Configured in `~/.cursor/mcp.json`:
```json
"etsy": { "type": "http", "url": "https://mcp.api.etsycloud.com/mcp" }
```
Tools: `learn_etsy_api`, `search_etsy_api`, `list_endpoints`, `get_endpoint`, `get_schema`, `list_guides`, `get_guide`
Use this to look up endpoint details, schemas, and scopes on demand instead of guessing.
