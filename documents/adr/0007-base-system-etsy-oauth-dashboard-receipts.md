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

- **Token refresh (we will implement)**  
  When the access token expires, the app **will** use the stored refresh token to obtain a new access token from Etsy so the user does not need to reconnect. Implementation is a required follow-up to the base system.

- **API routes (Next.js App Router)**  
  - `GET /api/auth/etsy` — Start OAuth; set state and code_verifier in cookies; redirect to Etsy.  
  - `GET /api/auth/etsy/callback` — Validate state; exchange code for tokens; set token cookies; redirect to home.  
  - `POST /api/auth/logout` — Clear token (and related) cookies.  
  - `GET /api/shop` — Return the connected user’s shops (from Etsy API).  
  - `GET /api/receipts?shop_id=&limit=&offset=` — Return shop receipts (orders) for the given shop (from Etsy API).

- **Dashboard (single page)**  
  - If not connected: show “Connect with Etsy” and link to `/api/auth/etsy`.  
  - If connected: show shop selector (dropdown), then a table of recent receipts with date, order #, ship-to address, total, paid/shipped status. Data is fetched from Etsy on load (no database for Etsy orders in the base system).  
  - “Disconnect” calls logout and clears cookies.

- **Etsy API client (`src/lib/etsy.ts`)**  
  Centralized helpers: config from env, PKCE generation, auth URL building, token exchange, and typed API calls to Etsy (shops, receipts) with `x-api-key` and Bearer token.

- **Stack**  
  Next.js 16 (App Router), TypeScript, Tailwind CSS. Env: `ETSY_CLIENT_ID`, `ETSY_CLIENT_SECRET`, `ETSY_REDIRECT_URI` (and optionally `ETSY_API_KEY_HEADER`).

## Consequences

- **Positive**
  - User can connect Etsy and see recent orders without a database.
  - Clear separation: auth and Etsy proxy in API routes; UI only calls our API.
  - Foundation for adding inventory, customers, and reports later (with a database per ADR-001).
- **Negative**
  - Etsy receipt data is not persisted; each visit refetches from Etsy (rate limits apply).
- **Planned**
  - Token refresh will be implemented: use the refresh token when the access token expires so the user does not need to reconnect.

## Notes

- Base system does not include the inventory, customer, or report features described in other ADRs; those are planned additions with database storage.
- Redirect URI must be registered in the Etsy developer app and match `ETSY_REDIRECT_URI` exactly.
- Token refresh: call Etsy's token endpoint with `grant_type=refresh_token` and the stored refresh token when the access token is expired or about to expire; update the access token cookie. Required for production use.
