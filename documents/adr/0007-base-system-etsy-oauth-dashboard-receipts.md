# ADR-007: Base system — Etsy OAuth, dashboard, and receipts

## Status

Accepted

## Date

2025-02-15

## Context

The application needed a working foundation to connect an Etsy shop, view orders, and support future features (inventory, customers, reports). Etsy provides the Open API v3 with OAuth 2.0 (PKCE) and endpoints for shops and receipts. We needed a simple, secure way to authenticate and display recent sales without storing Etsy data in a database at this stage.

## Decision

Build and ship a **base system** with the following:

- **Etsy OAuth 2.0 (PKCE)**  
  User connects via “Connect Etsy”; the app redirects to Etsy, user authorizes, and the app exchanges the code for access (and refresh) tokens. PKCE (code_verifier / code_challenge) and state are used for security. Required scopes: `transactions_r`, `receipts_r`, `shops_r`.

- **Token storage**  
  Access token (and refresh token) are stored in **HTTP-only cookies** (SameSite=Lax). No token in client-side JavaScript; API routes read cookies on the server. OAuth state and code_verifier are stored temporarily in cookies during the flow only.

- **Token refresh (required for production)**  
  When the access token expires, the app uses the stored refresh token to obtain a new access token from Etsy so the user does not need to reconnect. See **Token refresh (full behavior)** below.

- **API routes (Next.js App Router)**  
  - `GET /api/auth/etsy` — Start OAuth; set state and code_verifier in cookies; redirect to Etsy.  
  - `GET /api/auth/etsy/callback` — Validate state; exchange code for tokens; set token cookies; redirect to home.  
  - `POST /api/auth/logout` — Clear token (and related) cookies.  
  - `GET /api/shop` — Return the connected user’s shops (from Etsy API).  
  - `GET /api/receipts?shop_id=&limit=&offset=` — Return shop receipts (orders) for the given shop (from Etsy API).

- **Dashboard (single page)**  
  The dashboard’s exact content, structure, and behavior are specified in **[ADR-016](0016-dashboard-content-and-behavior.md)** (no ambiguity). In short: if not connected, show connect CTA and link to `/api/auth/etsy`; if connected, show shop selector and a table of recent receipts (date, order #, ship-to, total, paid, shipped). Data from Etsy on load; no DB persistence for Etsy orders in the base system. “Disconnect” calls logout and clears cookies.

- **Etsy API client (`src/lib/etsy.ts`)**  
  Centralized helpers: config from env, PKCE generation, auth URL building, token exchange, and typed API calls to Etsy (shops, receipts) with `x-api-key` and Bearer token.

- **Stack**  
  Next.js 16 (App Router), TypeScript, Tailwind CSS. Env: `ETSY_CLIENT_ID`, `ETSY_CLIENT_SECRET`, `ETSY_REDIRECT_URI` (and optionally `ETSY_API_KEY_HEADER`).

---

### Token refresh (full behavior)

Token refresh is **required for production**. Users must not have to re-connect to Etsy just because the access token expired.

**When to refresh:**

- **On 401 from Etsy:** Any Etsy API call returns 401 (Unauthorized) → attempt refresh: call Etsy token endpoint with `grant_type=refresh_token` and the stored refresh token. If refresh succeeds, update the access token cookie (and refresh token if Etsy returned a new one) and **retry the original request** once. If refresh fails (e.g. 400, refresh token revoked), clear tokens and treat as not connected; redirect or prompt user to "Connect Etsy" again.
- **Proactively (recommended):** If Etsy returns an expiry time for the access token (e.g. `expires_in` at grant), store it or compute expiry. Before making an Etsy request, if the access token is expired or within a short window (e.g. 5 minutes), refresh first, then proceed. If expiry is not available, rely on "refresh on 401" only.

**How:** Etsy OAuth token endpoint. Request: `grant_type=refresh_token`, `refresh_token=<stored_refresh_token>`. Response: new access token (and possibly new refresh token; if so, replace stored refresh token in cookie). Update only the token cookie(s); do not change other state.

**Single in-flight:** Only one refresh in progress per user/session; if a second request gets 401 while refresh is in progress, wait for that refresh to complete (or queue) then retry with the new token.

## Consequences

- **Positive**
  - User can connect Etsy and see recent orders without a database.
  - Clear separation: auth and Etsy proxy in API routes; UI only calls our API.
  - Foundation for adding inventory, customers, and reports later (with a database per ADR-001).
- **Negative**
  - Etsy receipt data is not persisted; each visit refetches from Etsy (rate limits apply).
- **Planned**
  - Token refresh is specified in full above; required for production.

## Notes

- Base system does not include the inventory, customer, or report features described in other ADRs; those are planned additions with database storage.
- Redirect URI must be registered in the Etsy developer app and match `ETSY_REDIRECT_URI` exactly.
- Token refresh: call Etsy's token endpoint with `grant_type=refresh_token` and the stored refresh token when the access token is expired or about to expire; update the access token cookie. Required for production use.
