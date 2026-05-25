# Etsy Sales Manager

A simple app to view and manage Etsy shop orders (receipts) for **Trudy's Classic Treasures**. Connect your Etsy account with OAuth and see recent sales, shipping status, and totals.

---

## Functionality

### User flows

| Action           | What happens                                                                                                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Connect Etsy** | User clicks “Connect Etsy” → redirects to Etsy OAuth → user approves → app stores OAuth/session records in SQLite and redirects back to the dashboard (cookie holds only an opaque session id).            |
| **View orders**  | After connecting, the app loads the user’s shop(s), then fetches up to 100 recent receipts for the selected shop. Orders are shown in a table with date, order #, ship-to, total, and paid/shipped status. |
| **Switch shop**  | If the account has multiple shops, a dropdown lets the user pick which shop’s orders to view; the orders list refreshes for that shop.                                                                     |
| **Disconnect**   | User clicks “Disconnect” → app calls logout API → SQLite-backed auth/session records are invalidated and cookie session id is cleared → UI returns to the “Connect Etsy” state.                            |

### What the app shows

- **Recent orders (receipts)**  
  For the selected shop: receipt/order ID, creation date, buyer name, full shipping address (line 1, city, state, zip, country), order total, shipping cost, currency, and whether the order is marked **Paid** and **Shipped** on Etsy.

- **Shop selector**  
  Dropdown of all shops linked to the connected Etsy account (from Etsy API “user’s shops”).

- **Errors**  
  Connection errors, missing-config errors, and OAuth errors (e.g. user denies access) are shown in the UI where applicable (e.g. banner after redirect).

### API routes (backend)

| Route                                   | Method | Purpose                                                                                                                                                      |
| --------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/auth/etsy`                        | GET    | Start OAuth: generate PKCE `code_verifier` and `state`, persist them in SQLite auth/session storage, redirect user to Etsy’s authorization URL.              |
| `/api/auth/etsy/callback`               | GET    | OAuth callback: validate `state`, exchange `code` + `code_verifier` for access (and refresh) token, persist token/session state in SQLite, redirect to home. |
| `/api/auth/logout`                      | POST   | Invalidate SQLite auth/session records and clear session cookie id so the user is disconnected.                                                              |
| `/api/shop`                             | GET    | Return the list of shops for the currently connected user (requires valid token cookie).                                                                     |
| `/api/receipts?shop_id=&limit=&offset=` | GET    | Return paginated shop receipts (orders) for the given `shop_id` (requires valid token cookie).                                                               |

### Library (`src/lib/etsy.ts`)

| Function                                      | Purpose                                                                                                                                                        |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getEtsyConfig()`                             | Read and validate `ETSY_CLIENT_ID`, `ETSY_CLIENT_SECRET`, `ETSY_REDIRECT_URI` from env.                                                                        |
| `generateCodeVerifier()`                      | Create a cryptographically random PKCE code verifier (43–128 chars, base64url).                                                                                |
| `getCodeChallenge(verifier)`                  | Compute SHA-256 + base64url code challenge from the verifier.                                                                                                  |
| `getEtsyAuthUrl(state)`                       | Build Etsy OAuth URL with PKCE and scopes `transactions_r receipts_r shops_r listings_r listings_w`; returns URL and `codeVerifier` to store for the callback. |
| `exchangeCodeForToken(code, codeVerifier)`    | POST to Etsy token endpoint; returns `access_token`, `refresh_token`, `expires_in`.                                                                            |
| `etsyApi(path, accessToken, options?)`        | Generic Etsy API request: `GET https://api.etsy.com/v3/application{path}` with `x-api-key` and `Authorization: Bearer {accessToken}`.                          |
| `getShops(accessToken)`                       | Fetch current user’s profile then their shops; returns array of `{ shop_id, shop_name }`.                                                                      |
| `getShopReceipts(accessToken, shopId, opts?)` | Fetch shop receipts (orders) with optional `limit`, `offset`, `min_created`, `max_created`.                                                                    |

### Data and session cookies

- **SQLite is the system of record for all application data**, including auth/session state and synced Etsy data.
- **Cookies (HTTP-only, SameSite=Lax)** carry only opaque session identifiers; they do not carry business or OAuth token payloads.

---

## Features (summary)

- **Connect Etsy** – OAuth 2.0 (PKCE) with Etsy Open API v3
- **Shop selector** – If you have multiple shops, pick which one to view
- **Orders list** – Recent receipts with date, order #, ship-to address, total, paid/shipped status

## Installation

For full step-by-step instructions on **macOS** and **Windows 11** (prerequisites, Etsy app setup, env config, running the app), see **[documents/installation.md](documents/installation.md)**.

### Scripted install/run

Initialize once:

```bash
npm run ESM_initialize
```

Then run normally (no initialization):

```bash
npm run ESM
```

## Operations guide

For day-to-day operation workflows (startup, connection checks, order monitoring, listing readiness/generation, and error playbooks), see **[documents/operating-the-system.md](documents/operating-the-system.md)**.

For release/operations runbooks (deployment, rollback, backup, and observability), see:

- **[documents/release/RELEASE_PROCESS.md](documents/release/RELEASE_PROCESS.md)**
- **[documents/release/DEPLOYMENT.md](documents/release/DEPLOYMENT.md)**
- **[documents/operations/ROLLBACK.md](documents/operations/ROLLBACK.md)**
- **[documents/operations/BACKUP.md](documents/operations/BACKUP.md)**
- **[documents/operations/OBSERVABILITY.md](documents/operations/OBSERVABILITY.md)**

## Setup (quick)

1. **Register an Etsy app**
   - Go to [Etsy Developers](https://www.etsy.com/developers/register) and create an app.
   - Note your **API Key (keystring)** and **Shared Secret**.

2. **Redirect URI**
   - In your Etsy app settings, add a redirect URI:
     - Local: `http://localhost:3000/api/auth/etsy/callback`
     - Production: `https://your-domain.com/api/auth/etsy/callback`

3. **Environment variables**
   - Copy `system/.env.example` to `.env.local` at the project root.
   - On Windows, if root config symlinks are missing, follow the Windows copy step in `documents/installation.md` first.
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

Design and scope decisions are recorded as **Architecture Decision Records (ADRs)** in [documents/adr/](documents/adr/). They cover the database model, inventory and customer data, shipper/vendor tracking, and reports (thank you note, invoice, sales, costs, income MTD/YTD, postal costs by vendor).

## Terminology

- **Order**: A grouped sale with one `order_id` that may contain multiple purchase rows.
- **Purchase**: A single row in the `purchase` table (typically one item within an order).
- **Receipt**: Etsy-side receipt object/ID from Etsy APIs.
- **Inventory item**: A row in the `inventory` table representing one tracked item/SKU.

## Notes

- Auth/token state is persisted in SQLite. For production, use HTTPS and encrypted-at-rest storage for secrets/tokens.
- If Etsy API calls fail after OAuth, optionally set `ETSY_API_KEY_HEADER=your_keystring:your_shared_secret` in `.env.local`. When set, the app uses this value for `x-api-key`; otherwise it uses `ETSY_CLIENT_ID`.
