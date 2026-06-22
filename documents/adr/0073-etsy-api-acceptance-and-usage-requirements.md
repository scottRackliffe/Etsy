# ADR-073: Etsy API acceptance and usage requirements

## Status

Accepted

## Date

2026-06-10

## Context

Using the Etsy Open API requires meeting a comprehensive set of requirements — from initial registration and approval, through authentication and rate limiting, to ongoing obligations around data handling, testing, branding, and security. These requirements are scattered across multiple Etsy sources (API Terms of Use, developer documentation, testing policy, community discussions). This ADR consolidates every requirement into a single reference so developers never have to hunt for what's needed.

**Official sources (verify for updates):**

- [API Terms of Use](https://www.etsy.com/legal/api/) (last updated Jun 16, 2025)
- [Developer Registration](https://www.etsy.com/developers/documentation/getting_started/register)
- [Authentication](https://developer.etsy.com/documentation/essentials/authentication)
- [Request Standards](https://developers.etsy.com/documentation/essentials/requests)
- [Rate Limits](https://developer.etsy.com/documentation/essentials/rate-limits)
- [Webhooks](https://developers.etsy.com/documentation/essentials/webhooks)
- [API Testing Policy](https://www.etsy.com/legal/policy/api-testing-policy/169130941112)
- [Etsy Trademark Policy](https://www.etsy.com/legal/trademarks-examples/)
- [Your Apps Dashboard](https://www.etsy.com/developers/your-apps)

---

## 1. Registration and approval

### 1.1 Developer account

- Register at [etsy.com/developers/your-apps](https://www.etsy.com/developers/your-apps).
- Provide accurate, true, and complete information.
- Account is solely for your own use; you are responsible for all activities.
- Etsy may reject access for any reason, at sole discretion.
- Etsy communicates via the Developer Email Address on file — keep it current.

### 1.2 Application purpose

- You must submit the **Application Purpose** for Etsy's prior approval.
- Any updates to the application must also be submitted for approval.
- Approval may be granted or withheld at Etsy's sole discretion.
- The application must be **fully functional, tested for bugs and defects**, and consistent with the approved Application Purpose before use on any Etsy shop.

### 1.3 Personal access (default)

- All new applications start with **personal access**.
- Authenticated read/write access controlled by OAuth token scopes.
- Limited to **up to 5 shops**.
- No charge for personal access.
- Applications with no successful API request in **6 months** are marked dormant and may be banned.

### 1.4 Commercial access (multi-seller)

Commercial access is required for general-purpose applications that assist any seller (not just your own shop). Etsy reviews against these criteria:

| # | Criterion |
|---|---|
| 1 | Application and home page comply with API Terms of Use |
| 2 | Application follows caching policies (Section 1 of API Terms) |
| 3 | Application clearly distinguishes itself from Etsy (Section 6 of API Terms) |
| 4 | Application does not sidestep the API — no screen-scraping |
| 5 | Private member data accessed only via OAuth |
| 6 | Application name and artwork follow Etsy's Trademark Policy |
| 7 | Apps using `transaction_r` scope must request `buyer_email` access separately (case-by-case) |

### 1.5 Application registration tips (from community experience)

- **Do NOT** use "Etsy" in your app name — this is a common rejection reason.
- Provide a **detailed, complete description** of what your app does and how it will be used.
- Include a **functional website URL** for your application.
- **Do NOT** mention integrating with or transferring data to third-party platforms — this triggers rejection.
- **Do NOT** state you are getting an API key to enter into another system.
- Apply for **personal access first**, then commercial access separately.
- Approval can take **2-4 weeks**; contact developer@etsy.com if rejected for clarification.
- Each API key may only be used for a **single application**.

---

## 2. Authentication

### 2.1 API key (required on every request)

Every request to a v3 endpoint must include the `x-api-key` header in the format:

```
x-api-key: <keystring>:<shared_secret>
```

- **Enforced since February 9, 2026** — requests without the shared secret are rejected.
- Find both values on the [Your Apps](https://www.etsy.com/developers/your-apps) page.
- The shared secret must never be published or exposed to clients.

### 2.2 OAuth 2.0 (required for scoped endpoints)

Endpoints that access private user data or perform write operations additionally require an OAuth 2.0 Bearer token:

```
Authorization: Bearer <user_id>.<access_token>
```

**OAuth flow:** Authorization Code Grant with PKCE (RFC 7636).

| Step | Action |
|---|---|
| 1 | Redirect user to `https://www.etsy.com/oauth/connect` with `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`, `code_challenge`, `code_challenge_method=S256` |
| 2 | User grants access → Etsy redirects to `redirect_uri` with `code` and `state` |
| 3 | POST to `https://api.etsy.com/v3/public/oauth/token` with `grant_type=authorization_code`, `client_id`, `redirect_uri`, `code`, `code_verifier` |
| 4 | Receive `access_token` (1 hour TTL), `refresh_token` (90-day TTL), `expires_in`, `token_type=Bearer` |

**PKCE requirements:**
- Code verifier: 43–128 characters from `[A-Za-z0-9._~-]`, cryptographically random.
- Code challenge: URL-safe base64-encoded SHA-256 hash of the code verifier.

**Redirect URI requirements:**
- Must use `https://` prefix (TLS required).
- Must be registered in the Etsy developer app.
- Matching is **case-sensitive** and **exact** — no trailing slashes, no query strings, no protocol differences.

### 2.3 Token refresh

- Access tokens expire in **1 hour** (3600 seconds).
- Refresh tokens expire in **90 days**.
- POST to `https://api.etsy.com/v3/public/oauth/token` with `grant_type=refresh_token`, `client_id`, `refresh_token`.
- Response includes new `access_token` and potentially new `refresh_token` — always store the latest.
- Refresh tokens retain the scope of the original authorization — cannot change scope via refresh.
- To change scopes, must go through the full authorization code grant flow again.

### 2.4 Available OAuth scopes

| Scope | Description |
|---|---|
| `address_r` | Read a member's shipping addresses |
| `address_w` | Update and delete a member's shipping address |
| `billing_r` | Read a member's Etsy bill charges and payments |
| `cart_r` | Read the contents of a member's cart |
| `cart_w` | Add and remove listings from a member's cart |
| `email_r` | Read a user profile |
| `favorites_r` | View a member's favorite listings and users |
| `favorites_w` | Add to and remove from a member's favorite listings and users |
| `feedback_r` | View all details of a member's feedback (including purchase history) |
| `listings_d` | Delete a member's listings |
| `listings_r` | Read a member's inactive and expired (non-public) listings |
| `listings_w` | Create and edit a member's listings |
| `profile_r` | Read a member's private profile information |
| `profile_w` | Update a member's private profile information |
| `recommend_r` | View a member's recommended listings |
| `recommend_w` | Remove a member's recommended listings |
| `shops_r` | See a member's shop description, messages and sections |
| `shops_w` | Update a member's shop description, messages and sections |
| `transactions_r` | Read a member's purchase and sales data (buyers and sellers) |
| `transactions_w` | Update a member's sales data |

**Principle of least privilege:** Request only the scopes your app needs. Users are less likely to authorize apps that request excessive scopes.

---

## 3. Request standards

| Element | Requirement |
|---|---|
| Protocol | `https://` (SSL/TLS required) |
| Base URL | `https://api.etsy.com/v3/` |
| API key header | `x-api-key: <keystring>:<shared_secret>` (every request) |
| Auth header | `Authorization: Bearer <user_id>.<access_token>` (scoped endpoints) |
| Content type | JSON for request/response bodies |

---

## 4. Rate limits

### 4.1 Default limits

| Metric | Default | Description |
|---|---|---|
| QPD (Queries Per Day) | 10,000 | Sliding 24-hour window |
| QPS (Queries Per Second) | 10 | Per-second burst limit |

Limits are applied at the **API key level** for both public and private auth.

### 4.2 Rate limit headers (every successful response)

| Header | Description |
|---|---|
| `x-limit-per-second` | Total QPS limit for your API key |
| `x-remaining-this-second` | Remaining calls in current second |
| `x-limit-per-day` | Total QPD limit (sliding 24-hour window) |
| `x-remaining-today` | Remaining calls in current 24-hour window |

### 4.3 Sliding window mechanism

The QPD limit uses a progressive sliding window algorithm:
- 24-hour period divided into smaller fixed time buckets.
- Usage = sum of requests in all buckets within the current rolling 24 hours.
- As the oldest bucket exits the window, its quota is freed.

### 4.4 Exceeding limits

- Rate limits evaluated in order: **QPS first, then QPD**.
- If exceeded: HTTP **429** status code with `retry-after` header (seconds to wait).
- Implement **exponential backoff** — do not retry immediately.

### 4.5 Requesting higher limits

- Contact developer@etsy.com with:
  1. Detailed description of the application.
  2. Estimate of required QPD/QPS.
- **Enterprise Tier** (>3 million API calls/day): requires separate eligibility criteria and terms.

### 4.6 Optimization recommendations

- Implement caching strategies to minimize redundant calls.
- Batch operations where possible.
- Monitor rate limit headers and throttle proactively.

---

## 5. Data handling and display

### 5.1 Data freshness requirements (API Terms §5)

| Content type | Maximum staleness |
|---|---|
| Listing content | **6 hours** older than Etsy Site/Apps |
| All other Etsy content | **24 hours** older than Etsy Site/Apps |

Once accessed, stored, or displayed, Etsy content must not be cached longer than reasonably necessary to provide service.

### 5.2 Minimum data principle (API Terms §5.17)

Request only the minimum amount of data needed from the Etsy API to provide sellers with the intended application.

### 5.3 Privacy obligations (API Terms §4)

- You act as a **service provider** to the Etsy seller.
- Process member data **only to fulfill services** described in your Application Terms.
- You must have enforceable **Application Terms** (including a privacy policy) with each seller.
- Application Terms must be accepted via click-through or equivalent.
- Application Terms must include this **warranty disclaimer** (or substantially similar):

> DISCLAIMER: THIS APPLICATION IS SOLELY PROVIDED BY [DEVELOPER NAME] (THE "APPLICATION DEVELOPER"). YOU ACKNOWLEDGE THAT ETSY, INC. AND ITS AFFILIATES ARE NOT THE APPLICATION DEVELOPER, DO NOT PROVIDE THE APPLICATION SERVICE, AND MAKE NO WARRANTIES OF ANY KIND WITH RESPECT TO THE APPLICATION OR DATA ACCESSED THROUGH IT.

---

## 6. Security requirements

### 6.1 Credential protection

- You are responsible for maintaining the security of API credentials and your Developer Account.
- Never expose the shared secret, API key, or OAuth tokens to client-side code.
- If credentials are compromised, immediately notify Etsy at **security@etsy.com**.

### 6.2 Data breach notification

- If any Etsy Member data is compromised or suspected compromised:
  - Notify Etsy at **dpo@etsy.com** AND the affected Etsy seller.
  - **Within 24 hours** of discovery — no later.

### 6.3 Token storage

- Store OAuth tokens encrypted at rest (our implementation: AES-256-GCM per ADR-025).
- Never store or transmit member ID and password combinations (API Terms §5.14).
- HTTP-only cookies for session identifiers; no tokens in client-side JavaScript.

---

## 7. Trademark and branding

### 7.1 Required trademark disclaimer

The following must appear **prominently** in your application:

> "The term 'Etsy' is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy."

### 7.2 Branding rules

- Do NOT use "Etsy" in your application name.
- Do NOT use Etsy logos, trade dress, or brand elements in ways suggesting endorsement or affiliation.
- Do NOT create marks confusingly similar to Etsy's trademarks.
- Etsy's trademarks must appear **less prominently** than your own branding.
- You may state the app was "developed using the Etsy API" but cannot imply endorsement.

---

## 8. Prohibited behaviors (API Terms §5, all 25 items)

You must NOT:

| # | Prohibition |
|---|---|
| 1 | Replace or mimic Etsy's core functionalities, or circumvent checkout |
| 2 | Divert sales or migrate members from Etsy, or drive traffic to unrelated external sites |
| 3 | Copy, resemble, or mirror the Etsy Site's look and feel, or misrepresent affiliation |
| 4 | Disrupt or adversely affect Etsy's business, credibility, or reputation |
| 5 | Facilitate creation of listings incompatible with Etsy's Creativity Standards or Prohibited Items Policy (including mass-produced items) |
| 6 | Facilitate unauthorized downloading, copying, or use of members' products, photos, or designs |
| 7 | Compromise security or integrity of the API or platform |
| 8 | Modify, alter, or tamper with the Etsy API |
| 9 | Reverse engineer, decompile, or disassemble the Etsy API |
| 10 | Excessively burden the API or platform |
| 11 | Create multiple applications offering substantially the same services |
| 12 | Include code performing operations unrelated to the application's services |
| 13 | Improperly handle member data |
| 14 | Upload, post, collect, store, or transmit member ID and password combinations |
| 15 | Use the API for spam or unsolicited marketing, or connect to third-party ad/marketing platforms |
| 16 | Send order, shipping, or tracking communications to members unless expressly authorized by Etsy |
| 17 | Request more than the minimum data needed |
| 18 | Transfer or commercialize API access, credentials, or member data to any third party |
| 19 | Use the API for purposes unrelated to member activity (e.g., probing Etsy internals) |
| 20 | Solicit, incentivize, or encourage fake/misleading reviews |
| 21 | Manipulate or artificially inflate shop statistics or engagement metrics |
| 22 | Charge sellers a fee for functionality that Etsy provides free of charge |
| 23 | Develop an application that violates any Etsy policy |
| 24 | Use automated systems or browser extensions to scrape the Etsy Site unless expressly authorized |
| 25 | Collect Etsy content for analytics, ML, AI training, licensing, or content removal unless expressly authorized |

---

## 9. Testing policy

Etsy has **no sandbox environment** — all testing occurs on production. You must:

| # | Requirement |
|---|---|
| 1 | Enable **Developer Mode** for your test shop (hides listings from search) |
| 2 | Create listings in **draft state** when possible (avoids listing fees) |
| 3 | Use **low prices** (< $1) for test listings |
| 4 | Be responsible for **all fees** associated with your account, including during testing |
| 5 | Include **"test"** in your shop name (if test-only) or in listing title/description |
| 6 | Do NOT use **stock images** (increases risk of being flagged as fraud) |
| 7 | **Cancel** any accidental purchases by buyers immediately — failure to fulfill or cancel results in account suspension |

Contact: developer@etsy.com for testing questions.

---

## 10. Webhooks

### 10.1 Available events (as of 2026-06-10)

| Event type | Trigger |
|---|---|
| `order.paid` | Order receives payment |
| `order.canceled` | Seller initiates cancellation |
| `order.shipped` | Shipping information created for a receipt product |
| `order.delivered` | Order marked as delivered |

Available for both personal and commercial applications.

### 10.2 Payload structure

```json
{
  "event_type": "order.paid",
  "resource_url": "https://api.etsy.com/v3/application/shops/{shop_id}/receipts/{receipt_id}",
  "shop_id": 12345
}
```

### 10.3 Signature verification (required)

Each webhook request includes three headers:

| Header | Purpose |
|---|---|
| `webhook-id` | Unique ID of the webhook call |
| `webhook-timestamp` | Unix timestamp (seconds) when event was emitted |
| `webhook-signature` | HMAC signature to verify authenticity |

**Verification steps:**
1. Build signed content: `webhook-id + "." + webhook-timestamp + "." + raw_body`
2. Derive key: remove `whsec_` prefix from signing secret, base64-decode remainder
3. Compute: HMAC-SHA256 over signed content using decoded key, base64-encode result
4. Compare against `webhook-signature` header

**Replay attack prevention:** Reject if `webhook-timestamp` differs from current server time by more than 300 seconds (5 minutes).

### 10.4 Retry schedule (exponential backoff)

Immediately → 5s → 5m → 30m → 2h → 5h → 10h → 10h

---

## 11. Application lifecycle

### 11.1 Service support

- You must provide **service support** to all Etsy sellers using your application.
- Application must include a **monitored email address** for seller inquiries.
- Respond to all inquiries in a **reasonable and timely manner**.

### 11.2 Discontinuation

- Provide at least **30 days** prior written notice to Etsy and affected sellers.
- During the withdrawal period, maintain the application and provide support and transitional services.
- Etsy may agree to a shorter notice period at its discretion.

### 11.3 Dormancy

- **6 consecutive months** without a successful API call → Etsy may suspend access.
- To reactivate: contact developer@etsy.com.

### 11.4 Quality standards

Etsy may suspend or terminate access based on:
- Repeated complaints about functionality, performance, UX, security, or compliance.
- Application not operating as described or advertised.
- Application causing technical or stability issues on the platform.
- Violation of prohibited behaviors.

Etsy reserves the right to **review, test, and audit** your application at any time.

---

## 12. Termination

Etsy may terminate or suspend API access and/or your Developer Account if:
- You fail to maintain your Developer Account in good standing.
- You violate the Terms or any applicable policies.
- Quality concerns about your application.
- Conduct that disrupts or harms Etsy Services, platform, business, members, or security.

**Effects of termination:**
1. All rights and licenses immediately cease.
2. You must immediately cease all use of the API and Etsy data.
3. Remove all API connections from your application.
4. Cease all marketing in connection with Etsy.
5. Remain responsible for outstanding obligations and fees.
6. Application removed from Etsy Services.

---

## 13. Our compliance (Etsy Sales Manager)

This section maps each requirement to our implementation. See also `documents/etsy-compliance.md` and ADR-011.

| Requirement | Our implementation |
|---|---|
| API key format `keystring:shared_secret` | `src/lib/etsy.ts` includes shared secret via `ETSY_API_KEY_HEADER` env var or constructs from `ETSY_CLIENT_ID` + `ETSY_CLIENT_SECRET` |
| OAuth 2.0 PKCE | Full PKCE flow in `/api/auth/etsy` and `/api/auth/etsy/callback` (ADR-007) |
| Token refresh | Proactive (5 min before expiry) + reactive (on 401), single in-flight (ADR-025) |
| Token encryption | AES-256-GCM at rest in SQLite `settings` table (ADR-025) |
| Rate limit handling | HTTP 429 + `Retry-After` header respected; configurable limits (ADR-011) |
| No caching of API responses | `etsy_receipts` stores synced operational data, not cached responses (ADR-011, etsy-compliance.md) |
| Trademark disclaimer | Displayed in app footer and Config page (ADR-011) |
| No "Etsy" in app name | App name is "Etsy Sales Manager" for internal reference only; displayed name is distinct |
| No screen-scraping | API-only data access (ADR-011) |
| Testing policy | Draft listings used during development; Developer Mode guidance in documentation |
| Scopes: minimum required | `transactions_r`, `shops_r` at connect; `listings_w`, `listings_r` on first publish (ADR-007) |
| Data freshness | Real-time API calls for Etsy data; local data is application state, not stale Etsy content display |
| Dormancy prevention | App makes regular sync requests when connected (ADR-057) |
| Privacy: service provider role | Single-user app; no data shared with third parties |
| Data breach | Would notify dpo@etsy.com within 24 hours (security policy) |
| Webhook support | Event-driven sync can supplement polling (future enhancement, post-v1) |

---

## 14. Step-by-step process to get API access and go live

### Phase 1: Prerequisites

| Step | Action | Details |
|---|---|---|
| 1.1 | **Create an Etsy seller account** | Go to [etsy.com](https://www.etsy.com) and register a seller account if you don't have one. This is the account that will own the API application. |
| 1.2 | **Enable two-factor authentication** | Go to Account Settings → Security → enable 2FA (Google Authenticator or SMS). Required for developer access. |
| 1.3 | **Open a shop** | You need an active Etsy shop associated with your account to test against. For testing, the shop can be empty. |

### Phase 2: Register the application

| Step | Action | Details |
|---|---|---|
| 2.1 | **Go to the developer portal** | Navigate to [etsy.com/developers/your-apps](https://www.etsy.com/developers/your-apps). |
| 2.2 | **Click "Create a New App"** | This opens the registration form. |
| 2.3 | **Choose a name** | Pick a name that does NOT contain the word "Etsy". Example: "Trudy's Sales Manager" or "Vintage Shop Manager". Using "Etsy" in the name will cause rejection. |
| 2.4 | **Write the application description** | This is the most critical field for approval. Be detailed, specific, and honest. Describe exactly what the app does and who uses it. See the template below. |
| 2.5 | **Provide a website URL** | Must be a real, accessible URL. Even a simple landing page works. Do not leave blank or use placeholder URLs. |
| 2.6 | **Select "Personal" access type** | Always start with personal access. Do NOT request commercial from the start — this frequently gets rejected. |
| 2.7 | **Submit and wait** | Etsy manually reviews every application. Expect **2–4 weeks**. You will NOT receive a notification if rejected — the app simply disappears from your dashboard. |

#### Application description template

Use this as a starting point. Adapt to your actual use case:

> This is a personal inventory and sales management tool for my own Etsy vintage/antique shop. The application helps me:
>
> - Track my inventory of vintage items (descriptions, condition, photos, purchase costs)
> - View and manage orders received through my Etsy shop
> - Generate shipping labels and invoices for my customers
> - Create and manage listing content (titles, descriptions, tags) before publishing to Etsy
> - Generate business reports (sales, costs, profit)
>
> The application is built with Next.js and runs locally on my computer. It connects to Etsy via OAuth to sync my shop's receipts and publish listings. Only I use it — it is not a multi-seller platform or a service offered to other Etsy sellers.
>
> Technical details: OAuth 2.0 PKCE flow, scopes needed: transactions_r, shops_r, listings_r, listings_w. Data is stored locally in SQLite. No data is shared with third parties.

**What NOT to say:**
- Do not mention "integrating with third-party services" or "transferring data."
- Do not mention other marketplaces (Shopify, Amazon, eBay).
- Do not say you are getting an API key to enter into another system.
- Do not be vague ("I want to test the API" — this gets rejected).

### Phase 3: After approval — set up credentials

| Step | Action | Details |
|---|---|---|
| 3.1 | **Retrieve your API keystring** | Go to [Your Apps](https://www.etsy.com/developers/your-apps). Find the app. Copy the keystring. |
| 3.2 | **Retrieve your shared secret** | Click the visibility icon next to the shared secret. Copy it. **Never publish or commit this value.** |
| 3.3 | **Set environment variables** | Create/update your `.env.local` file with `ETSY_CLIENT_ID`, `ETSY_CLIENT_SECRET`, and `ETSY_REDIRECT_URI`. See §15 below. |
| 3.4 | **Register your redirect URI** | In the Etsy developer app settings, add your exact callback URL (e.g., `https://localhost:3000/api/auth/etsy/callback`). Must be `https://`. Must match **exactly** — case-sensitive, no trailing slash. |

### Phase 4: Development and testing

| Step | Action | Details |
|---|---|---|
| 4.1 | **Enable Developer Mode** | In your Etsy shop settings, enable Developer Mode. This hides your shop's listings from Etsy search so test listings aren't found by real buyers. |
| 4.2 | **Test OAuth flow** | Run the app, click "Connect Etsy", authorize with your Etsy account. Verify tokens are stored and refresh works. |
| 4.3 | **Test read operations first** | Verify `GET /api/shop` and `GET /api/receipts` return data. These use `shops_r` and `transactions_r` scopes. |
| 4.4 | **Test write operations with drafts** | When testing listing creation, always use `createDraftListing` — never create active listings during development. |
| 4.5 | **Use low prices** | Any test listings must use prices under $1. |
| 4.6 | **Include "test" in listings** | Add "test" to the title or description of any test listings. |
| 4.7 | **Cancel accidental purchases** | If a buyer accidentally purchases a test listing, cancel the transaction immediately. Failure to do so can result in account suspension. |
| 4.8 | **Monitor rate limits** | Watch the `x-remaining-today` and `x-remaining-this-second` response headers during testing to ensure you're not hitting limits. |

### Phase 5: Pre-production checklist

Before using the app on your real shop with real listings:

| # | Checkpoint |
|---|---|
| 1 | OAuth flow works end-to-end (connect, use, refresh, disconnect) |
| 2 | Token refresh handles expiration gracefully (no re-authentication required) |
| 3 | All API calls include `x-api-key: keystring:shared_secret` header |
| 4 | Rate limit 429 responses are handled with exponential backoff |
| 5 | Trademark disclaimer is displayed prominently in the application |
| 6 | App name and branding do not use Etsy logos or imply endorsement |
| 7 | No Etsy API responses are cached for reuse |
| 8 | OAuth tokens are encrypted at rest (not stored in plaintext) |
| 9 | No tokens, secrets, or credentials exposed to client-side JavaScript |
| 10 | Listing publish is blocked unless `listing_phase = 'listing_ready'` (+ required Etsy fields) — ADR-085 |
| 11 | All test listings have been deactivated or deleted |
| 12 | Developer Mode can be disabled on your shop when ready for production |

### Phase 6: Commercial access (if needed later)

Only needed if the app will serve sellers other than yourself (multi-seller/SaaS). Not required for personal use with up to 5 shops.

| Step | Action | Details |
|---|---|---|
| 6.1 | **Click "Request Commercial Access"** | Next to your approved personal app in [Your Apps](https://www.etsy.com/developers/your-apps). |
| 6.2 | **Meet all 7 commercial criteria** | See §1.4 above. Ensure trademark disclaimer is displayed, app is clearly distinct from Etsy, OAuth is used for all private data, no screen-scraping. |
| 6.3 | **Provide enforceable Application Terms** | Must include privacy policy and the warranty disclaimer (see §5.3). Users must accept via click-through. |
| 6.4 | **Set up service support** | Monitored email address for seller inquiries, with reasonable response times. |
| 6.5 | **Request `buyer_email` separately (if needed)** | If using `transaction_r` scope and you need buyer email addresses, this requires a separate case-by-case approval. |

### Phase 7: Ongoing obligations

| Obligation | Frequency |
|---|---|
| Keep Developer Account info accurate | As needed |
| Make at least one successful API call | Every 6 months (avoid dormancy) |
| Monitor Etsy announcements for breaking changes | Ongoing — watch [GitHub Announcements](https://github.com/etsy/open-api/discussions/categories/announcements) |
| Re-check API Terms of Use for updates | When notified by Etsy or periodically |
| Respond to Etsy audit/review requests | As requested — cooperate fully |
| Maintain application quality | Ongoing — address complaints, bugs, performance issues |
| Notify Etsy of data breaches | Within 24 hours of discovery to dpo@etsy.com |
| Provide 30-day notice before discontinuing | If you ever stop maintaining the app |

---

## 15. Env vars required

| Variable | Purpose | Required |
|---|---|---|
| `ETSY_CLIENT_ID` | API key keystring | Yes |
| `ETSY_CLIENT_SECRET` | Shared secret | Yes |
| `ETSY_REDIRECT_URI` | OAuth callback URL (must be `https://` and registered with Etsy) | Yes |
| `ETSY_API_KEY_HEADER` | Override for `x-api-key` value (optional; defaults to `client_id:client_secret`) | No |

---

## Consequences

- **Positive:** Single comprehensive reference for all Etsy API requirements. Developers can verify compliance without reading multiple Etsy documents. Reduces risk of rejection, suspension, or policy violation.
- **Negative:** Must be kept in sync when Etsy updates their terms or documentation. Multiple official sources mean potential for Etsy-side inconsistencies.

## Cross-references

- ADR-007: OAuth flow and token refresh
- ADR-011: Compliance with Etsy rules (decision record)
- ADR-019: Etsy order sync
- ADR-023: Listing content generation modes
- ADR-025: Token refresh middleware and encryption
- ADR-057: Scheduled auto-sync
- `documents/etsy-compliance.md`: Detailed compliance mapping

---

_Sources verified: 2026-06-10. All information derived from official Etsy documentation and developer community discussions._
