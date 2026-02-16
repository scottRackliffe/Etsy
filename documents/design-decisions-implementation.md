# Design decisions — implementation wording (first pass)

This document contains full design wording for all decisions from the design list. It is the single source for the first pass; content may be split into or merged with ADRs as needed.

---

## 1. Print shipping label

**Behavior:** The "Print shipping label" command opens the carrier's print-label URL (or equivalent) with the order's ship-to address and relevant details pre-filled. The app does **not** generate or store label artwork; it only launches the carrier's flow. If the user has not selected a carrier or the order has no ship-to data, show a message in user terms and prompt them to complete the order or select a carrier first.

**Docs:** Add to ui-design Sales commands and to ADR-018 (or Notes): Print shipping label = open carrier URL with ship-to; no in-app label generation.

---

## 2. Customer country and default US; billing address

**Customer country:** Each customer has an effective **country** (for display, currency, and reporting). That country is the **country of the customer's billing address** (the designated billing/default address). If the customer has **no billing address** (or no addresses), treat the customer's country as **US**.

**Default country:** When creating a **new customer** or a **new address**, the default value for the **country** field is **US** unless the user changes it. Anywhere the app needs "customer country" and no billing address exists, use **US**.

**Billing address (Option A):** Each customer has exactly one **billing address** designated. Implementation uses one of:
- **customer.default_address_id** (FK to customer_address) — the row in customer_address that is the billing address for this customer; or
- **customer_address.is_billing** (INTEGER 0/1) — one row per customer may have is_billing = 1.

**Schema:** Add to **customer**: `default_address_id` INTEGER REFERENCES customer_address(id) (nullable). Customer country = the country of the address referenced by default_address_id; if null, US. When the user designates an address as billing (in UI), set default_address_id to that address id (or set is_billing = 1 on that row and 0 on others). Add to ADR-017.

---

## 3. Multi-currency (currency per customer)

**Currency per customer:** Each customer has an effective **currency** (for their orders, invoices, and customer-level amounts). It is derived from the **billing address country** via a fixed mapping (e.g. US → USD, UK → GBP, CA → CAD; fallback USD for unmapped countries). The app may store **currency_code** on the **customer** row (set or updated when the billing address is set or when country changes) so it does not need to derive it on every use.

**App default:** Default country is US; default currency is **USD**. New customer with no billing address (or country not in the mapping) uses **USD**.

**Where it applies:** Invoicing, thank-you note, and any customer-facing or per-customer monetary display use that customer's currency. Internal/reporting (e.g. income MTD/YTD, costs) may use a single reporting currency (e.g. USD) or sum by currency; define in report ADR.

**Schema:** Add to **customer**: `currency_code` TEXT (e.g. "USD"). Set from billing address country when address is set or updated. Default "USD" when no billing address. Add to ADR-017.

---

## 4. Void / cancel order

**Behavior:** An order can be in status **active**, **void**, or **cancelled**. Void/cancel does **not** delete purchase rows; it only changes status. When an order is void or cancelled:
- It is **excluded from** sales reports, income MTD/YTD, and invoice/thank-you generation (and from "active" order lists), unless a report explicitly includes void/cancelled (e.g. for audit).
- It may still appear in the Sales list with a clear "Void" or "Cancelled" indicator.
- No DELETE; only status change.

**Schema:** Add to **purchase**: `order_status` TEXT — one of "active", "void", "cancelled". Default "active". When the user voids or cancels an **order**, set order_status to "void" or "cancelled" for **all** purchase rows with that order_id. Reports and outstanding list filter by order_status where applicable. Add to ADR-017 and DDL; add to ADR-022 (or validation) that void/cancel is a status change only.

---

## 5. Customer inactivate / reactivate (maintenance)

**Inactivate by years of inactivity:** A maintenance function lets the user choose **how many years of inactivity** (e.g. 2, 5, 10). The system finds customers with **no activity** for that long (activity = latest of: last purchase date, customer updated_at, any of their addresses' updated_at). Those customers (and **all associated records**: their addresses and their purchase rows) are marked **inactive**. No rows are deleted; an **is_active** (or **status**) flag is set to 0 (inactive) on the customer and, as defined, on related records so that "inactivated" is consistent (e.g. customer.is_active = 0; purchases keep a reference to customer but are excluded from active reports when customer is inactive).

**Reactivate when new customer matches inactivated:** When the user **adds a new customer**, if the new customer's info **matches** a previously inactivated customer (match rule: e.g. same first_name + last_name + email, case-insensitive), then **do not create a new customer**. Instead **reactivate** that inactivated customer and all related records that were inactivated with them (set is_active = 1). Then use that customer (and their history) for the add flow.

**Reactivate by name (maintenance):** A maintenance function lists **inactive customers** (e.g. by name). The user **scrolls** (and may search), selects one or more, and chooses **Reactivate**. The system reactivates the selected customer(s) and all related records that were inactivated with them.

**Reports and inactive data:** Inactive data is **excluded** from "current" or "active" reports (e.g. customer list, outstanding list, default Sales view). **Exception:** Date-range reports (e.g. Sales 2019–2020, Income 2020) **include** all transactions in that range whether the customer or order is now active or inactive.

**Schema:** Add to **customer**: `is_active` INTEGER (1 = active, 0 = inactive). Default 1. Optionally add to purchase or other tables if we need to mark rows "inactivated with customer"; or derive from customer.is_active. Add to ADR-017. Define "activity" and match rule in this doc or in an ADR.

---

## 6. Token refresh (addition to ADR-007)

**Requirement:** Token refresh is **required for production**. Users must not have to re-connect to Etsy just because the access token expired.

**When to refresh:**
- **On 401 from Etsy:** Any Etsy API call returns 401 (Unauthorized) → attempt refresh: call Etsy token endpoint with `grant_type=refresh_token` and the stored refresh token. If refresh succeeds, update the access token cookie (and refresh token if Etsy returned a new one) and **retry the original request** once. If refresh fails (e.g. 400, refresh token revoked), clear tokens and treat as not connected; redirect or prompt user to "Connect Etsy" again.
- **Proactively (recommended):** If Etsy returns an expiry time for the access token (e.g. `expires_in` at grant), store it or compute expiry. Before making an Etsy request, if the access token is expired or within a short window (e.g. 5 minutes), refresh first, then proceed. If expiry is not available, rely on "refresh on 401" only.

**How:** Etsy OAuth token endpoint. Request: `grant_type=refresh_token`, `refresh_token=<stored_refresh_token>`. Response: new access token (and possibly new refresh token; if so, replace stored refresh token in cookie). Update only the token cookie(s); do not change other state.

**Single in-flight:** Only one refresh in progress per user/session; if a second request gets 401 while refresh is in progress, wait for that refresh to complete (or queue) then retry with the new token.

**Docs:** Add this as a full section to ADR-007.

---

## 7. Automated backup (rolling 25, FIFO)

**Automated backup:** The app performs **automated backups** on a schedule (e.g. daily; interval may be configurable in Config).

**Backup directory:** Backups are written to a **backup directory**. The path is configurable in Config/settings (e.g. `backup_directory`). If not set, use a default under app data.

**What is backed up:** Full database file. Optionally include picture/thumbnail storage; if not, document "DB only" for v1.

**Rolling 25, FIFO:** Keep at most **25** backup files. When a new backup is created and 25 already exist, **delete the oldest** (FIFO) and add the new one. Backup filenames include a timestamp or sequence so "oldest" is unambiguous (e.g. `etsy-sales-backup-2025-02-15T12-00-00.db`).

**Docs:** Add to ADR-008 or a short backup ADR; add settings key `backup_directory` and optionally `backup_schedule` in ADR-017.

---

## 8. Report user choices: Print, Export, Cancel

After a report is generated, the user is offered exactly three actions: **Print** (send to printer), **Export** (save/download, e.g. PDF file), **Cancel** (close without printing or exporting). Update ADR-013 to state these three choices (replace any "View, Print, Back, Cancel" with Print, Export, Cancel).

---

## 9. Etsy listing content (template, AI, save with item, can't list until complete)

**Template and requirements document:** The document `documents/etsy-listing-template-and-requirements.md` defines: (1) **Template:** structure of a listing (title, category, attributes, tags, description, price, photos, shipping). (2) **Requirements:** all Etsy-required fields and all suggested fields from How_to_Win_on_Etsy.md, Etsy_Photo_Guide.md, etsy-compliance, and ADR-002. (3) **Mapping:** which inventory/app fields feed each part of the template. (4) **Inputs to AI:** When the app calls the AI to generate listing content, the app **must** send **all pictures associated with the item** (inventory.picture_1 … picture_10 and inventory.condition_picture_1 … condition_picture_5 — every non-empty path or URL) so the AI knows what it is writing about. See etsy-listing-template-and-requirements.md §3. The AI returns **structured data** that maps to item/listing fields.

**AI response = importable:** The data returned from the AI must be **structured** (e.g. JSON) so each element maps to a field on the item/listing record. The app imports the AI response directly into the item record (no manual paste). The template/requirements doc defines the **response shape** (field names and types).

**Save with item:** The AI-generated description and other listing content (title, tags, etc.) are **saved with the inventory item**. Schema: add to **inventory** — `listing_title` TEXT, `listing_description` TEXT, `listing_tags` TEXT (or equivalent); optionally `listing_category_path` TEXT. Add to ADR-017.

**Can't list until complete:** An item **cannot be listed** (List on Etsy / Publish) until **all** Etsy-required fields and **all** required AI-generated content (including listing_description) are present and saved. The app enforces this (no listing action until complete). Any missing required field or missing AI content is reported in user terms and, per data-checks decision, can appear on the outstanding list.

**Docs:** New document etsy-listing-template-and-requirements.md; reference in ADR and ui-design for "List on Etsy". Schema additions in ADR-017.

---

## 10. Data checks on add/change; context checks; errors in user terms; outstanding list

**Checks on add/change:** Every create and update (inventory, customer, address, purchase, order, settings) runs validation and **context checks** at save time. Context checks ensure **consistency across associated records** (e.g. customer_id exists; inventory_id exists; default_address_id belongs to customer; dates and statuses are consistent; no conflicting conditions). Document the full list of context checks in ADR-021 or a validation ADR.

**Errors in user terms:** Every error (validation or context check failure) is **raised to the user** and **explained in user terms** (e.g. "Please select a customer for this order," not "customer_id FK violation"). No generic "Something went wrong"; no raw exceptions.

**Auto-correct or what to do next:** For each error, either (1) **automatically correct** when safe and unambiguous (e.g. trim whitespace, set default), or (2) **tell the user what to do next** (e.g. "Select a customer before saving."). No exception: every error path does one of these two.

**Validation issues on outstanding list:** When a check fails and the system does **not** auto-correct, create an **outstanding to-do item** for the user. That item appears on the outstanding panel and full-page Outstanding tab (e.g. "Order #123 — select a customer"). Clicking it puts context in place (navigate to that record). Extend ADR-020 to include "Records with validation/context-check issues" as an outstanding type; define how we flag or compute them (e.g. stored flag or run checks and list failures).

**Docs:** ADR-021 (or new validation ADR): full list of context checks; error handling (user terms, auto-correct or what to do next). ADR-020: add outstanding type "validation/context-check issues."

---

## 11. No ship until paid or override

**Rule:** The system **does not allow** "Mark as shipped" (or equivalent) until the order is **paid** (all purchase rows in the order have was_paid = 1), **unless** the user **explicitly overrides** (e.g. "Ship anyway" or "Mark as shipped even though not paid" with a confirmation). No silent ship-when-unpaid.

**UI:** When the user attempts to mark an order as shipped and it is not paid, show a clear message in user terms (e.g. "This order is not marked paid. Mark as paid first, or choose 'Ship anyway' to record shipping."). If the user chooses "Ship anyway," record the override (e.g. set shipped as requested; optionally store a flag that shipment was done without paid for audit). Document in ADR-021 and ui-design.

---

## 12. Etsy sync on startup; last sync date; command to sync

**On startup:** Each time the system starts (app load / user session start), the app **runs a full Etsy sync** (same logic as manual "Sync from Etsy" per ADR-019). Sync runs once at startup when the user is authenticated with Etsy.

**Command to sync:** The manual **Sync from Etsy** (or "Sync data") command remains available in Sales or Config. Same sync behavior as on startup.

**Last sync date:** Store the datetime of the last successful Etsy sync (e.g. settings key `last_etsy_sync_at`). After every successful sync (startup or manual), update this value. **Display** it in the UI (e.g. "Last synced: 15 Feb 2025, 10:30 AM" on Dashboard, Sales, or Config). Add to ADR-017 settings keys.

---

## 13. Orders needing action → outstanding list

Any order that needs the user to do something (not paid, paid but not shipped, missing shipping cost, new Etsy order not yet synced/processed, validation issue) appears on the **outstanding to-do list**. After startup sync, any new or updated orders that still need action show there. The outstanding list is the single place for "what needs my attention."

---

## 14. Report: Outstanding items (all todos)

**New report:** **Outstanding items** (or "Outstanding to-do report") lists **all current outstanding items** (same set as the outstanding panel/tab): type, summary (e.g. order #, customer, item), date, and optionally "what to do." Output: PDF (per ADR-013). User can run it anytime; content is a snapshot of the outstanding list at run time. Add to ADR-006 and ADR-013 report content.

---

## 15. Report: AR aging (unpaid orders)

**New report:** **AR aging** (Accounts Receivable aging) tracks **unpaid orders**. Content: unpaid orders (was_paid = 0 or not paid), grouped by age (e.g. 0–30 days, 31–60, 61–90, 90+ from date_of_purchase), with order id, customer, amount, days outstanding. Output: PDF. Add to ADR-006 and ADR-013 report content.

---

## 16. Outstanding: orders missing shipping cost — in scope

"Orders missing shipping cost" is **in scope** for v1 and appears on the outstanding to-do list. Definition and query per ADR-020. Update ADR-020 to state this type is in scope (remove "optional for v1").

---

## 17. Bulk picture import (in scope; directory remembered; selection window; item first)

**In scope:** Bulk picture import is in scope for v1.

**Flow:** (1) User **selects an inventory item** (Inventory tab). (2) User runs **Add / Import pictures**. (3) App uses **remembered directory** (or asks for directory and **remembers** it in settings, e.g. `default_picture_directory`). (4) App opens a **selection window** showing **all pictures** in that directory with a **selection control** (e.g. checkboxes); user selects which pictures to import. (5) **Selected pictures** are **filed with the selected item** (assigned to picture_1 … picture_10 in order; thumbnail created per ADR-002/015). The directory where pictures are held is the same as the directory we ask for and remember. Update ADR-010 and ui-design.

---

## 18. Config: Why pictures matter / tutorial links — future addition

"Why pictures matter" link and tutorial/guide links in Config are **future additions**. Not in current scope. When added, specify where the link appears and what happens on click.

---

## 19. Preferences: date format, first-day-of-week (in scope; Config)

**In scope:** Date format and first-day-of-week are in scope for v1. They are stored in **Preferences or Config** (settings table). Add keys e.g. `date_format`, `first_day_of_week` to ADR-017. The app uses them when displaying dates and when rendering calendars (e.g. first column = first day of week).

---

## 20. Thumbnail: specify default; user can increase/decrease size for all

**Default:** Thumbnail format and size are **specified** (e.g. **JPEG**, max **200×200 px**, or fit within 200×200 keeping aspect ratio). Document in ADR-002 or ADR-010.

**User setting:** Config/Preferences includes a setting (e.g. `thumbnail_size`: Small / Medium / Large, or a numeric max dimension) that lets the user **increase or decrease thumbnail size for all** items. When the user changes it, the app applies the new size to all item thumbnails (regenerate all, or use new size for future thumbnails and offer "Regenerate all"). Add to ADR-017 settings and Config.

---

## 21. Report layout (full spec)

**Fonts:** 12 pt **Courier** for detail rows, header, and footer. Report title in header: **14 pt or 16 pt** as required to fit.

**Page number:** Bottom of page, **centered**.

**Header/footer on every page:** Report title (or short title) at top of each page; page number at bottom of each page.

**Margins:** **1 inch (or 25 mm) all sides.**

**Tables:** Detail in tables: 12 pt Courier; **light grid lines** between rows/columns.

**Spacing:** **Single** line spacing for body; one blank line between major sections.

Add to ADR-013.

---

## 22. Outstanding list sort order (date default first; user picks 1st/2nd/3rd and asc/desc)

**Three sort levels:** User selects **which field** is 1st, 2nd, and 3rd sort (from a defined list: e.g. date, type, customer name, order ID). **Date** is the **default** for the **first** sort (user can change it).

**Direction:** For **each** of the three criteria, the user can choose **ascending or descending**. Stored in settings (e.g. `outstanding_sort_1_field`, `outstanding_sort_1_direction`, and same for 2 and 3). Default: 1st = date, e.g. descending (newest first). Add to ADR-020 and Config; add settings keys to ADR-017.

---

## 23. Mark as paid (implementation choice)

Leave as implementation choice: either PATCH each purchase row with was_paid = 1, or a single endpoint (e.g. POST /api/orders/[id]/mark-paid) that sets was_paid = 1 for all rows with that order_id. ADR-018 already allows either.

---

*End of design-decisions-implementation.md (first pass).*
