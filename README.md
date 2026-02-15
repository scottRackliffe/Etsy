# Etsy Sales Manager

A simple app to view and manage Etsy shop orders (receipts) for **Trudy's Classic Treasures**. Connect your Etsy account with OAuth and see recent sales, shipping status, and totals.

---

## Functionality

### User flows

| Action | What happens |
|--------|----------------|
| **Connect Etsy** | User clicks “Connect Etsy” → redirects to Etsy OAuth → user approves → app stores access (and refresh) token in HTTP-only cookies and redirects back to the dashboard. |
| **View orders** | After connecting, the app loads the user’s shop(s), then fetches up to 100 recent receipts for the selected shop. Orders are shown in a table with date, order #, ship-to, total, and paid/shipped status. |
| **Switch shop** | If the account has multiple shops, a dropdown lets the user pick which shop’s orders to view; the orders list refreshes for that shop. |
| **Disconnect** | User clicks “Disconnect” → app calls logout API → cookies are cleared → UI returns to the “Connect Etsy” state. |

### What the app shows

- **Recent orders (receipts)**  
  For the selected shop: receipt/order ID, creation date, buyer name, full shipping address (line 1, city, state, zip, country), order total, shipping cost, currency, and whether the order is marked **Paid** and **Shipped** on Etsy.

- **Shop selector**  
  Dropdown of all shops linked to the connected Etsy account (from Etsy API “user’s shops”).

- **Errors**  
  Connection errors, missing-config errors, and OAuth errors (e.g. user denies access) are shown in the UI where applicable (e.g. banner after redirect).

### API routes (backend)

| Route | Method | Purpose |
|-------|--------|--------|
| `/api/auth/etsy` | GET | Start OAuth: generate PKCE `code_verifier` and `state`, set them in cookies, redirect user to Etsy’s authorization URL. |
| `/api/auth/etsy/callback` | GET | OAuth callback: validate `state`, exchange `code` + `code_verifier` for access (and refresh) token, set token cookies, redirect to home. |
| `/api/auth/logout` | POST | Clear Etsy token and related cookies so the user is disconnected. |
| `/api/shop` | GET | Return the list of shops for the currently connected user (requires valid token cookie). |
| `/api/receipts?shop_id=&limit=&offset=` | GET | Return paginated shop receipts (orders) for the given `shop_id` (requires valid token cookie). |

### Library (`src/lib/etsy.ts`)

| Function | Purpose |
|----------|--------|
| `getEtsyConfig()` | Read and validate `ETSY_CLIENT_ID`, `ETSY_CLIENT_SECRET`, `ETSY_REDIRECT_URI` from env. |
| `generateCodeVerifier()` | Create a cryptographically random PKCE code verifier (43–128 chars, base64url). |
| `getCodeChallenge(verifier)` | Compute SHA-256 + base64url code challenge from the verifier. |
| `getEtsyAuthUrl(state)` | Build Etsy OAuth URL with PKCE and scopes `transactions_r receipts_r shops_r`; returns URL and `codeVerifier` to store for the callback. |
| `exchangeCodeForToken(code, codeVerifier)` | POST to Etsy token endpoint; returns `access_token`, `refresh_token`, `expires_in`. |
| `etsyApi(path, accessToken, options?)` | Generic Etsy API request: `GET https://api.etsy.com/v3/application{path}` with `x-api-key` and `Authorization: Bearer {accessToken}`. |
| `getShops(accessToken)` | Fetch current user’s profile then their shops; returns array of `{ shop_id, shop_name }`. |
| `getShopReceipts(accessToken, shopId, opts?)` | Fetch shop receipts (orders) with optional `limit`, `offset`, `min_created`, `max_created`. |

### Data and cookies

- **Cookies (HTTP-only, SameSite=Lax)**  
  - `etsy_oauth_state`, `etsy_oauth_verifier` – used only during the OAuth flow (short-lived).  
  - `etsy_access_token` – used for all Etsy API calls after login.  
  - `etsy_refresh_token` – stored for future refresh support (not yet used in code).  
- **No order or shop data is persisted** – orders and shop list are fetched from Etsy when the user loads or changes the dashboard.

---

## Features (summary)

- **Connect Etsy** – OAuth 2.0 (PKCE) with Etsy Open API v3
- **Shop selector** – If you have multiple shops, pick which one to view
- **Orders list** – Recent receipts with date, order #, ship-to address, total, paid/shipped status

## Setup

1. **Register an Etsy app**
   - Go to [Etsy Developers](https://www.etsy.com/developers/register) and create an app.
   - Note your **API Key (keystring)** and **Shared Secret**.

2. **Redirect URI**
   - In your Etsy app settings, add a redirect URI:
     - Local: `http://localhost:3000/api/auth/etsy/callback`
     - Production: `https://your-domain.com/api/auth/etsy/callback`

3. **Environment variables**
   - Copy `.env.example` to `.env.local`.
   - Fill in:
     - `ETSY_CLIENT_ID` – your Etsy app keystring
     - `ETSY_CLIENT_SECRET` – your Etsy app shared secret
     - `ETSY_REDIRECT_URI` – must match the URI you set in the Etsy app (e.g. `http://localhost:3000/api/auth/etsy/callback`)

4. **Run the app**
   ```bash
   npm install
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000), click **Connect Etsy**, and sign in with your shop account.

## Tech

- **Next.js 16** (App Router), TypeScript, Tailwind CSS
- **Etsy Open API v3** – OAuth PKCE, shops, receipts (orders)

## Architecture decisions

Design and scope decisions are recorded as **Architecture Decision Records (ADRs)** in [docs/adr/](docs/adr/). They cover the database model, inventory and customer data, shipper/vendor tracking, and reports (thank you note, invoice, sales, costs, income MTD/YTD, postal costs by vendor).

## Notes

- Tokens are stored in HTTP-only cookies. For production, use HTTPS and consider refresh-token handling when the access token expires.
- Etsy’s API may require the `x-api-key` header to be in the form `keystring:sharedsecret`. If you get API errors after connecting, set `ETSY_API_KEY_HEADER=your_keystring:your_shared_secret` in `.env.local` and keep `ETSY_CLIENT_ID` for the OAuth client id.
