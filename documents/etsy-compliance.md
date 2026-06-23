# Etsy rules compliance

This document summarizes **Etsy rules and policies** that apply to the AiCE application and our design decisions. We follow these so the app and its users stay in good standing with Etsy.

**Official sources (check for updates):**

- [Etsy API Terms of Use](https://www.etsy.com/legal/api/)
- [Etsy Terms of Use](https://www.etsy.com/legal/terms/)
- [Seller Policy (House Rules)](https://www.etsy.com/legal/sellers/)
- [Prohibited Items Policy](https://www.etsy.com/legal/prohibited/)
- [Listing Image Requirements](https://www.etsy.com/legal/policy/listing-image-requirements/253962679005)
- [Vintage Items on Etsy](https://www.etsy.com/legal/policy/vintage-items-on-etsy/242665563649)
- [Etsy Trademark Policy / Examples](https://www.etsy.com/legal/trademarks-examples/)
- [Etsy Developer Documentation](https://developer.etsy.com/documentation/) (rate limits, OAuth, caching)

---

## 1. API Terms of Use (developers)

| Rule                                               | Our compliance                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Accept API Terms and Etsy Terms**                | We use the Etsy Open API only as allowed; we do not use the API for prohibited uses.                                                                                                                                                                                                                                                                              |
| **No screen-scraping or bypassing the API**        | We use only the official Etsy API (OAuth, shops, receipts). We do not scrape Etsy pages or use unofficial methods to get data.                                                                                                                                                                                                                                    |
| **Private data only with OAuth**                   | All shop and receipt data is accessed with OAuth; we store auth/token state securely in SQLite (encrypted at rest where applicable) and do not expose tokens to the client.                                                                                                                                                                                       |
| **Trademark disclaimer (commercial access)**       | If we ever seek commercial access (multi-seller app), we will display prominently: _"The term 'Etsy' is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc."_ For personal access (single shop / up to 5 shops), we still avoid implying endorsement; we can show a short disclaimer in Config or footer. |
| **Clearly distinguish from Etsy**                  | App name and UI make clear this is a third-party tool (e.g. "AiCE"), not Etsy itself. No Etsy logos or branding that imply affiliation.                                                                                                                                                                                     |
| **Caching policy (Section 1 of API Terms)**        | Do not cache Etsy HTTP API responses for reuse (per Etsy API Terms). The `etsy_receipts` table (ADR-017) stores receipt data as part of the sync/import workflow — this is operational data persistence, not API response caching. Synced receipt data becomes local application data subject to local business rules. We minimize API calls and respect rate limits. If we add HTTP-level caching in the future, we will follow Etsy’s API Terms (allowed duration, headers, etc.). *(Clarified 2026-06-09.)* |
| **No dormant apps**                                | Apps with no successful API request in 6 months can be marked dormant and banned. We keep the app in use or make at least one successful request within 6 months when the user is connected.                                                                                                                                                                      |
| **Rate limits**                                    | Etsy publishes current API rate limits in developer documentation. We avoid unnecessary calls, batch where possible, and handle HTTP 429 (Retry-After) gracefully. Any hardcoded limits in the app must be configurable and kept aligned with Etsy docs.                                                                                                          |
| **Commercial access: transaction_r / buyer_email** | If we request commercial access and use transaction/receipt data, we will request buyer_email access separately if we need it; we do not store or use buyer email beyond what Etsy and law allow.                                                                                                                                                                 |

---

## 2. Seller policies (House Rules)

| Rule                                         | Our compliance                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sellers must follow Etsy seller policies** | Our app does not replace Etsy; it helps sellers manage sales and inventory. Sellers are responsible for their own shop policies (returns, cancellations, privacy) set in Etsy Shop Manager. We do not override or contradict those.                                                                                                 |
| **Shop policies**                            | Sellers set return/cancellation/privacy policies in Etsy. We may surface or reference “your Etsy shop” but do not dictate policy content.                                                                                                                                                                                           |
| **Prohibited items**                         | Etsy prohibits certain items (e.g. alcohol, tobacco, weapons, hate items, illegal items). We do not host a separate marketplace; listings live on Etsy. Sellers must ensure their listings comply with [Etsy’s Prohibited Items Policy](https://www.etsy.com/legal/prohibited/). Our app can remind or link to this in help/Config. |

---

## 3. Listing and image requirements

| Rule                                         | Our compliance                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Original photos of actual product**        | Etsy requires original photos of the item the buyer will receive, not stock or renderings (with limited exceptions). Our inventory “picture 1–20” and “condition pictures 1–5” are intended for the seller’s own photos of their items; we do not encourage or support stock imagery.                                                        |
| **Photos show condition, quality, quantity** | Etsy expects photos to accurately show condition and quality. Our **condition section** (ADR-002, ui-design): condition grade (Mint/Near Mint through Fair/As-Is), condition notes, and up to 5 condition pictures align with “show condition and defects.” We encourage accurate descriptions and specific terms (patina, crazing, foxing). |
| **No false or misleading listings**          | Sellers must describe items accurately. Our condition fields and picture slots support honest disclosure; we do not generate or suggest misleading text.                                                                                                                                                                                     |

---

## 4. Vintage and antique items

| Rule                                    | Our compliance                                                                                                                                                                                                                         |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vintage = 20+ years**                 | Etsy defines vintage as at least 20 years old; antiques are commonly 100+. Our condition terms (Mint/Near Mint, Excellent, Very Good, Good, Fair/As-Is) are standard for vintage/antique; we do not contradict Etsy’s age definitions. |
| **Accurate condition and description**  | Sellers must disclose damage, wear, alterations, and describe condition clearly. Our **condition_code**, **condition_notes**, and **condition_picture_1–5** are designed for this.                                                     |
| **Original photos; document condition** | Etsy may ask for sourcing, age, or photo documentation for vintage items. Our condition pictures and notes help sellers keep documentation they can use on Etsy or in cases.                                                           |

---

## 5. Data and privacy

| Rule                       | Our compliance                                                                                                                                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OAuth for private data** | We use OAuth 2.0 (PKCE) for shop and receipt data; we do not store Etsy passwords.                                                                                                                                                             |
| **Minimize stored data**   | We store only what is required for operation in SQLite (auth/session, inventory/customers/purchases/settings/report metadata). We do not resell or share Etsy data.                                                                            |
| **Buyer data**             | Buyer name/address from receipts are used only for order management, shipping, and reports (e.g. invoice, thank-you note). If we ever need buyer_email for commercial use, we will request and use it per Etsy’s and applicable privacy rules. |

---

## 6. Required compliance controls

- Use only the official Etsy API; no scraping or bypassing.
- Use OAuth for all private shop/receipt data; store tokens securely.
- Respect current Etsy rate limits from developer docs; handle 429 and Retry-After.
- Do not cache Etsy HTTP API responses for reuse (per Etsy API Terms). The `etsy_receipts` table stores synced receipt data as operational application data, not cached API responses (see ADR-017). Minimize API calls and respect rate limits. If we add HTTP-level caching later, follow Etsy API Terms.
- Display trademark disclaimer (at least in Config/footer; prominently if commercial access).
- Clearly distinguish app from Etsy (name, UI); no implied endorsement.
- Support accurate condition disclosure: condition code, notes, up to 5 condition pictures (aligned with Etsy listing/image expectations).
- Encourage original photos and accurate descriptions; no stock imagery or misleading content.
- Keep app active (avoid 6-month dormancy).
- Link or remind sellers about Etsy seller policies and prohibited items where helpful.

---

## 7. When Etsy updates rules

Etsy may change API terms, seller policies, or listing requirements. We will:

- Re-check the official URLs above when we change features or at least periodically.
- Update this document and any ADRs (e.g. condition codes, disclaimer) so we stay aligned.
- If the API exposes condition enums or new required fields, we will adopt them (see ADR-002 notes).

---

_Last aligned with Etsy policies: 2026-02-16. Verify current rules at the links above._
