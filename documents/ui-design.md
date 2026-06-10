# UI Design — World-class layout

This document defines the application layout: **tabs** (top), **commands** (left or right), **outstanding / to-do** (right), and the **processes** that drive them. No code here—scope and behavior only.

> **Data model (2026-05-24):** Customer sales = `orders` + `order_items`. Vendor sourcing = `purchases` table only. **v1 layout:** header + tab bar + full-width content (side commands/outstanding panels deferred per § Implementation notes). Canonical schema: ADR-017; API: ADR-018.

---

## Intuitive design (guiding principle)

**The whole experience must feel intuitive.** Someone should understand where to go and what to do without a manual. Apply this everywhere:

- **Tabs** — Use clear, everyday names (Dashboard, Sales, Inventory, Customers, Reports, Config). Order follows how people work: overview first, then day-to-day work (sales, inventory, customers), then reports, then settings.
- **Commands** — One action per command; label with a verb (“Add item”, “Mark shipped”). Show only commands that apply to the current tab and selection. Avoid nested menus for core actions.
- **Outstanding panel** — Label it clearly (e.g. “To do” or “Needs attention”). Each row is one thing; clicking it **puts context in place**: go to the **correct tab** and **correct record** ready for action (ADR-009). No separate overlay; the main content area shows the right tab and record.
- **Lists and forms** — Column headers and field labels use plain language. Primary action (Save, Submit) is easy to spot. Errors and success messages are short and tell the user what to do next.
- **Processes** — Common flows (complete a sale, add customer, add item, import pictures) should match how the user thinks: “I have an order” → Sales; “I need to add a buyer” → Customers or from the order. No hunting for the right place.
- **Consistency** — Same pattern everywhere: select something in the center → act via commands or by clicking an outstanding item (context in place). Same style of buttons, cards, and feedback across tabs.

When in doubt: **fewer steps, clearer labels, predictable behavior.**

---

## 1. Layout overview

| Area                    | Position                    | Purpose                                                                                                                                                                                                                                                                                                   |
| ----------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tabs**                | Top, full width             | Main application sections. One tab active; content below.                                                                                                                                                                                                                                                 |
| **Commands**            | *(Deferred to post-v1; see ADR-009 and § Implementation notes)* | Context-sensitive actions for the current tab. In v1, these actions are placed inline on each page.                                                                                                                                                                                                       |
| **Outstanding / To-do** | *(Deferred to post-v1; see ADR-009 and § Implementation notes)* | In v1, Outstanding is a full-page tab only. Click an item → deep-link navigate to the correct tab and record (ADR-035).                                                                                                                                                                                  |
| **Content**             | Center / main area          | List, form, or report for the active tab.                                                                                                                                                                                                                                                                 |

**Header:** App name (e.g. “Trudy’s Etsy Sales”), maybe global status (Etsy connected / not connected), user or shop indicator. No tabs in the header strip if we want a clean “tabs only” bar below it.

---

## 2. Tabs (application sections)

Proposed top-level tabs. Order can change; names are placeholders.

| Tab                   | Purpose                                                                                                                          | Main content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard**         | Home. Snapshot of today: recent activity, quick stats (e.g. orders this week, revenue MTD), and a feed or summary.               | Summary cards, recent orders, link into “outstanding” items.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Sales / Orders**    | Everything about orders and completing a sale.                                                                                   | List of orders (from Etsy and/or local). Filters (date, status, paid/shipped). Select an order → detail → run through “complete sale” process.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Inventory**         | Your items: add, edit, pictures, costs, dates (purchased, listed, sale, shipping).                                               | List + detail + listing workshop. **Primary add:** **Listing Coach** (ADR-072) at `/listing-coach` — paste Photos, optional Google Visual Search screenshot, AI-composed listing. Quick **Add item** for item number only. Picture upload (paste, drag, file picker). Status (Draft, In stock, Listed, Sold, etc.).                                                                                                                                                                                                                                                                           |
| **Customers**         | Buyers and addresses.                                                                                                            | Customer list. Add / edit customer (name, address). View order history per customer (ADR-052). Notes log (ADR-065).                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Reports**           | Run and view reports.                                                                                                            | Chooser per ADR-006: Thank you note, Invoice, Sales, Costs, Income MTD/YTD, Postal by vendor, Outstanding items, AR aging, Profit by item (038), Sales tax summary (039), Inventory aging (054), Accounting export (056). Date range + `format=pdf\|csv` (ADR-036). Actions: Print \| Export PDF \| Export CSV \| Cancel (ADR-013; exception: Accounting Export → Export CSV \| Cancel only).                                                                                                                                                                                                                                                           |
| **Tutorial and tips** | Tutorial + tips in one place: how Etsy works, how the app helps, sales tips, pricing; search, index, links to tips-folder files. | **Search** (over in-app content and tips-folder file names). **Index** (browsable topics from [tutorial.md](tutorial.md) plus Pictures, Etsy rules, tips-folder files). **Links to files in the tips folder** open in the OS default app. See [knowledge-base-design.md](knowledge-base-design.md).                                                                                                                                                                                                                                                                                           |
| **Outstanding**       | Dedicated view of the to-do list We support **both** panel (on every tab) and this full-page tab.                                | Same items as the “outstanding” panel, but full-page so user can work through the list.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Config / Settings** | Etsy connection, preferences, defaults.                                                                                          | Connect / disconnect Etsy. Redirect URI reminder. Default shipper. **Business details:** name, address, **user logo** (upload or select; stored in system for use in invoices, thank-you notes, reports, labels). **Shipping Info:** per-carrier data needed for labels (account numbers, return address, etc.); user adds/edits here; required when Printing shipping label if label cannot be complete without it. **Panel layout:** which side is commands vs outstanding (or use the **swap icon** in the UI). Optional: “Why pictures matter” link, tutorial/guide links, backup/export. |

**Recommendation:** Start with **Dashboard**, **Sales**, **Inventory**, **Customers**, **Reports**, **Tutorial and tips**, **Config**. Treat “Outstanding” as a **panel** on the right (or left) on every tab, not its own tab—unless you want a full-page “Outstanding” tab as well.

---

## 3. Commands (left or right panel)

> **v1 note (2026-06-09):** The side-panel commands concept is **deferred to post-v1** (see ADR-009 and § Implementation notes). In v1, the actions listed below are placed **inline** on each page using `Button` (ADR-028). The per-tab command lists remain the canonical reference for which actions each tab supports.

Commands are **context-sensitive** to the active tab, plus a few **global** actions.

### Global (any tab)

- **Connect Etsy** / **Disconnect** (or show “Connected” and “Disconnect”).
- **Refresh** (reload data for current view).

### Dashboard

- Refresh.
- (Etsy connect/disconnect if not in header.)

### Sales / Orders

- **New order** (manual entry — we support creating orders in the app for in-person or non-Etsy sales). Item(s) sold are chosen from a **pick list** (picture icon + item name); user can **scroll** or **type the item name** to filter and narrow the list, then select. Same UX as "Add sale for this customer" (ADR-015).
- **Sync from Etsy** (pull latest orders).
- **Mark as paid** (for selected order).
- **Mark as shipped** (for selected order; prompt for shipper and date).
- **Print shipping label** (for selected order): No automated connection to any shipping service. App generates and prints the label using order ship-to and stored Shipping Info. If required Shipping Info is missing, tell user and how to go to Config → Shipping Info. See shipping-label-carrier-templates.md. If the order has no carrier or ship-to data, show a message and prompt the user to complete the order first.
- **Thank you note** (generate/print for selected order).
- **Invoice** (generate/print for selected order).
- **Record in inventory** (link order to inventory item / mark item sold).

### Inventory

- **Add new listing with Listing Coach** (ADR-072) — recommended for new items; navigates to `/listing-coach`.
- **Add item** (quick: item number + description only).
- **Edit** (selected item).
- **Add / Import pictures** (selected item: **file picker + drag-and-drop upload** → **preview thumbnails** → confirm → assign to slots 1–20; per ADR-033). Show **link to "Why pictures matter"** doc.
- **Replace / Reorder / Remove** (Replace uses same file picker or drag-and-drop; drag to reorder slots).
- **Condition** — Set condition code (Etsy-aligned), “has blemish/issue”, condition notes; condition pictures (up to 5) use same **file picker + drag-and-drop** flow (ADR-033); show **"Why pictures matter"** link.
- **Mark as listed** (set date listed, optional Etsy link).
- **Mark as sold** (link to sale/customer, set date of sale).
- **Delete** or **Retire** (optional, with confirmation).

### Customers

- **Add customer** (new customer record).
- **Edit** (selected customer).
- **View order history** (orders for this customer; ADR-052 timeline).
- **Add sale for this customer** — Record another sale for the currently selected customer. Item sold is chosen from a **pick list** (picture icon + item name); user can **scroll** or **type the item name** to filter and narrow the list, then select. Multiple sales can be recorded for the same customer in sequence.

### Reports

- **Thank you note** (pick order → generate).
- **Invoice** (pick order → generate).
- **Sales** (date range → list/summary).
- **Costs** (date range → list/summary).
- **Income MTD / YTD** (run and show).
- **Postal costs by vendor** (run and show).
- **Outstanding items** (snapshot report; ADR-020).
- **AR aging** (unpaid orders by bucket).
- **Profit by item** (ADR-038; date range).
- **Sales tax summary** (ADR-039; date range).
- **Inventory aging** (ADR-054; slow movers).
- **Accounting export** (ADR-056; CSV).
- Per ADR-013: after generation — **Print | Export PDF | Export CSV | Cancel** (not a generic Export only). **Exception:** Accounting Export (ADR-056) offers **Export CSV | Cancel** only (no PDF or Print — CSV is the native output format).

### Tutorial and tips (knowledge base)

- **Search** — Search box over in-app content (tutorial + tips) and system-folder file names; results open article or file.
- **Index** — Browsable list of topics (How Etsy works, How this app helps, Sales tips, Pricing, Pictures, Etsy rules, tips-folder files); click to jump to section or open linked file. Links to **files in the tips folder** open in the OS default app.
- No other commands; content is read-only (tutorial and tips merged in this tab).

### Config / Settings

- **Connect Etsy** / **Disconnect**.
- **Set default shipper** (USPS, UPS, FedEx, DHL).
- **Business details** (name, address for invoices; **user logo** — upload or select, stored in system, placed on documents).
- **Redirect URI** (read-only reminder for Etsy app settings).
- **Optional:** “Why pictures matter” path/URL; **Tutorial and tips custom folder path** (folder on the system whose files appear as links in the knowledge base).

---

## 4. Outstanding / To-do list (panel and full-page tab)

> **v1 note (2026-06-09):** The always-visible side panel is **deferred to post-v1** (see ADR-009 and § Implementation notes). V1 implements Outstanding as a **full-page tab only**, with deep-link navigation to target records (ADR-035).

**Purpose:** A **panel** (right or left, opposite commands) that lists “what needs my attention.” It stays visible on every tab *(post-v1 — see note above)*. We also support a full-page **Outstanding** tab with the same list (ADR-009). Items are **data-driven only**; we do not support user-added manual tasks.

**Data-driven next steps (exact definitions and query rules: ADR-020):**

- Orders **paid but not yet shipped**.
- Orders **not yet marked paid** (after payment received).
- New **Etsy orders** not yet synced or processed.
- **Inventory items** in “In stock” but not yet “Listed”.
- **Customers** with no address or incomplete address.
- (Optional: orders missing shipping cost — ADR-020.)

**We do not support user-added manual tasks** (e.g. “List item #42”, “Follow up with customer X”).

**Behavior:**

- **Panel:** Show a short list (e.g. top 10–20) with one-line summary per item (e.g. “Order #1234 – Jane Doe – not shipped”). Full-page Outstanding tab shows the full list.
- **Click an item:** The app **puts context in place** (ADR-009): it **navigates to the correct tab** (Sales, Inventory, Customers, etc.) and **opens/selects the correct record** (that order, item, or customer) so the user is **ready for action**. The main content area shows the right tab and record; we do not use a separate overlay or modal. The user can then use commands (e.g. “Mark shipped”, “Mark paid”, “View full order”, “Edit customer”) on that tab.
- “Outstanding” panel is on the **right** if commands are on the **left** (or the opposite, per Config).

---

## 5. Key processes

### 5.1 Complete a sale (order → shipped)

1. **Sales** tab: see order (from Etsy or manual).
2. Ensure **customer** exists (create from order if needed).
3. **Link to inventory**: pick the inventory item(s) sold; mark item(s) as sold; set date of sale and sale revenue.
4. **Mark as paid** (if not already).
5. **Ship**: mark as shipped; set **shipping date**, **shipper** (USPS, UPS, FedEx, DHL), and **shipping cost** (your cost).
6. **Optional:** Print **shipping label**, **thank you note**, **invoice** from commands or Reports.

### 5.2 Add a customer

1. **Customers** tab → command **Add customer**.
2. Enter: first name, last name, address (line 1, line 2, city, state/province, country, postal code). Optional: email.
3. Save. Customer appears in list; can be linked to orders.

(If order came from Etsy, “Add customer” can be pre-filled from the order.)

### 5.3 Add an inventory item

**Recommended — Listing Coach (ADR-072):**

1. **Inventory** tab → **Add new listing with Listing Coach** → `/listing-coach`.
2. Paste item photos from macOS **Photos** (⌘C in Photos, ⌘V in coach). Optional: paste **Google Visual Search** screenshot after Search with Google on the best photo.
3. Review AI photo checklist, identification, and suggested price; confirm short answers (mostly **Yes** on suggested text).
4. Review composed **title**, **description**, and **tags**; enter **item number** → **Save to inventory**.
5. Approve draft and publish when ready (§5.4). User guide: [system/tips/Listing_Coach_Guide.md](../system/tips/Listing_Coach_Guide.md).

**Quick add (unchanged):**

1. **Inventory** tab → **Add item** (item number + short description only).
2. Enter: item number, description, **date purchased**, purchase cost, shipping cost (if any), other costs (with descriptions). Upload pictures 1–20. Optional: category, notes.
3. Save. Status “In stock” (or “Draft” if we support that).
4. When listed: set **date listed**, optional Etsy listing ID; status → “Listed.”

### 5.4 List item for sale (optional flow)

1. **Inventory** tab: select item.
2. **Generate listing content** (optional): User runs "Generate listing content" (or equivalent). The app **sends all item pictures** (picture_1…picture_20 and condition_picture_1…condition_picture_5 — every non-empty one) to the AI with item context and the listing template/requirements. The AI returns title, description, and 13 tags; the app saves them to the item. Do not generate listing content without providing all associated pictures. Full requirements: **[documents/etsy-listing-template-and-requirements.md](etsy-listing-template-and-requirements.md)**.
3. Command **Mark as listed** (or “List on Etsy” if we integrate listing creation). Item cannot be listed until required listing content is complete per the template doc.
4. Set **date listed**. Optionally link Etsy listing ID when listed on Etsy.
5. Status → “Listed.”

### 5.5 Run a report

1. **Reports** tab.
2. Choose report type (Thank you note, Invoice, Sales, Costs, Income MTD/YTD, Postal by vendor).
3. Set options (e.g. order, date range).
4. Run → preview or download (PDF/CSV as applicable).

### 5.6 Maintenance (optional)

- **Sync with Etsy**: pull latest orders/customers into the app.
- **Data checks**: find orders without a linked inventory item, or customers with missing address.
- **Backup / export**: export database or key tables (for backup or move).

### 5.7 Config

- **Etsy**: Connect (OAuth), Disconnect, view redirect URI.
- **Defaults**: Default shipper, business name/address for invoices.
- **Panel layout**: Which side is commands vs outstanding. An **icon** in the UI flips the layout: **left** = commands, **right** = outstanding (to-do's), or the reverse.
- **Preferences**: e.g. date format, currency, first-day-of-week (if we add them).

### 5.8 Importing the 20 pictures, video, and condition photos

Each inventory item can have up to **20 pictures** (picture 1 = primary; order matters for listing/reports; Etsy allows up to 20 per listing); **condition pictures** use the same flow (up to 5). Optional **listing video** (MP4/MOV, 5–15 seconds). The app stores **paths or URLs** in the database; the actual files live on disk or in object storage.

**Standard flow for all pictures (main and condition): file picker + drag-and-drop → preview → confirm (ADR-033)**

> **Reconciliation (2026-06-09):** The original design described a "directory picker" flow. ADR-033 replaced this with **file picker + drag-and-drop upload** for v1. The directory/folder import concept is deferred to post-v1 (see below).

- For **any** picture need (main or condition), the user selects files via a **file picker dialog** or **drags and drops** files onto the upload grid (ADR-033).
- The app displays **thumbnail previews** of selected files in a visual grid (20 slots main, 5 slots condition) so the user can confirm before saving.
- User confirms or removes files. App processes images (Sharp: validation, resizing, thumbnail generation per ADR-026), assigns to slots (main: 1–20; condition: 1–5), copies into app storage, saves paths. **Replace** (per slot) uses the same file picker or drag-and-drop.

**"Why pictures matter" — link in the UI**

- Wherever we offer picture import (main or condition), show a **link to a document that explains how important pictures are to sales**.
- **Default:** Link to **[documents/pictures-and-sales.md](pictures-and-sales.md)** (or its in-app route). That guide summarizes Etsy's requirements and why photos build trust.
- **Optional in Config:** Let the user set a path or URL to **their own** file (e.g. a PDF like "Tips for Getting Featured on Etsy" or another guide that was "a beginning of this"). If set, "Why pictures matter" can point to that file instead of or in addition to the default.

**Ways to get pictures in (v1)**

| Method                    | Description                                                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **File picker**           | User picks one or more files from a file dialog. App assigns them to slots 1–20 in order; user can reorder or replace.                                                               |
| **Drag-and-drop**         | User drags image files onto the upload grid (ADR-033). App previews thumbnails and assigns to slots.                                                                                  |
| **Paste (Listing Coach)** | In Listing Coach (ADR-072), user can paste images from macOS Photos (⌘C/⌘V).                                                                                                        |
| **URL** (optional)        | User pastes a URL for a picture (e.g. already hosted). App stores the URL in the corresponding picture slot.                                                                          |

**Process: add or replace pictures for an item**

1. **Inventory** tab → select item → **Upload / Import pictures** (or do it inside Add/Edit item).
2. Choose method: **File picker**, **drag-and-drop**, or optionally **Paste URL** per slot.
3. Selected files appear as **thumbnail previews** in the slot grid (ADR-033). User can reorder by drag, replace per slot, or remove.
4. User confirms → app processes images (validation, resize, thumbnail per ADR-026), assigns to slots (main 1–20 or condition 1–5), saves paths. If more images than slots, use first N by order or let user choose. Allow drag-to-reorder, Replace (same file picker or drag-and-drop per slot), Remove.
5. Save. Item record now has picture_1 … picture_20 (paths or URLs); empty slots are null.

**Post-v1: Bulk folder import**

> The following bulk/directory import flow is **deferred to post-v1**. V1 uses per-file upload only (ADR-033).

- "Import multiple items" flow: user selects a parent folder containing one subfolder per item (subfolder name = item number or new item); for each subfolder, create or find the item and import that folder's images into picture 1–20. Requires matching by item number or creating new items.
- Single-item directory import (select a folder, preview contents, confirm) is also deferred; v1 uses file picker + drag-and-drop per ADR-033.

**Constraints / rules**

- **File types:** Allow at least JPEG, PNG; optional WebP, GIF. Reject or convert others.
- **Size / dimensions:** Optional max file size (e.g. 10 MB) and max dimension (e.g. 2000 px) to keep storage and listing quality consistent; resize on upload if we support it.
- **Storage path:** One directory per item (e.g. `uploads/inventory/<item_id>/`) or a flat structure with prefixed filenames; never overwrite another item’s files.
- **Naming:** Stored filenames can be original name or generated (e.g. `1.jpg`, `2.png`) to avoid collisions; DB holds the path/URL only.

**Commands (recap)**

- **Add / Import pictures** — Open **file picker** or **drag-and-drop** files onto the upload grid → preview thumbnails → confirm → assign to slots. Show **link to "Why pictures matter"** doc ([documents/pictures-and-sales.md](pictures-and-sales.md) or configurable in Config).
- **Replace** (per slot) — Same: file picker or drag-and-drop → preview → confirm for that slot.
- **Reorder** — Drag-and-drop slots to change order (picture 1 = primary).
- **Remove** — Clear one or more slots (path/URL set to null).

“Etc.” can include: optional thumbnail generation for fast list/detail views, and a “Copy pictures from another item” action for duplicates.

### 5.9 Condition section (antique/vintage terms, documentation, up to 5 condition pictures)

Each inventory item has a **Condition** section for buyer transparency and Etsy alignment, using **commonly used antique condition terms on Etsy**.

**Condition (code) — dropdown options**

| Term               | Meaning                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **Mint/Near Mint** | Item appears unused, pristine, and without flaws.                                                |
| **Excellent**      | Very minor signs of use, consistent with age, but no damage.                                     |
| **Very Good**      | Light wear, minor surface scratches, or patina, but structurally sound.                          |
| **Good**           | Typical vintage/antique wear, minor flaws (e.g., small chip, light stains) noted in description. |
| **Fair/As-Is**     | Visible damage, significant wear, or requiring restoration.                                      |

**Fields**

- **Condition** — Required choice from the five terms above. Display as a dropdown in Add/Edit item.
- **Has blemish/issue** — Checkbox/toggle: “This item has a blemish, flaw, or issue to document.” When **on**, condition notes and condition pictures are relevant.
- **Condition notes** — Text for accurate description of flaws. Encourage **specific terminology** where appropriate: e.g. “patina”, “crazing” (ceramics), “foxing” (paper). Sellers must accurately describe flaws; this field supports that.
- **Condition pictures** — Up to **5** pictures that **substantiate the condition grade**: all sides, marks, and defects. Photos are crucial. Stored like main pictures (paths or URLs in DB; files on disk). Slots condition_picture_1 … condition_picture_5; empty slots null.

**Key considerations (reflect in UI and help text)**

- **Antique vs. vintage:** Etsy classifies 20+ years as vintage; antiques are generally 100+ years. Optional: add an “Age” or “Era” field later if needed; condition terms above apply to both.
- **Documentation:** Sellers must accurately describe flaws. Condition notes and the five terms are the main documentation; specific terms (patina, crazing, foxing) are standard.
- **Photos:** Condition pictures must show all sides, marks, and defects so the chosen grade is substantiated.

**UI**

- In **Add/Edit item**, show a **Condition** block: condition dropdown (five terms), “Has blemish/issue” control, condition notes (textarea), then “Condition pictures” with up to 5 slots. Optional short help: “Describe flaws accurately; use terms like patina, crazing, foxing where applicable. Photos should show all sides and any defects.”
- **Add condition pictures** use the **same flow as main pictures**: file picker + drag-and-drop → **thumbnail preview** → user confirms → assign to condition_picture_1–5 (ADR-033). **Replace** (per slot) and **Remove** same as main. Show the same **"Why pictures matter"** link (see section 5.8).

**Intuitive**

- Labels: “Item condition”, “Has a flaw or issue to document?”, “Condition notes (describe flaws; e.g. patina, crazing, foxing)”, “Photos of condition / defects (up to 5)”.

---

## 6. Summary: tabs and commands at a glance

| Tab               | Commands (examples)                                                                | Outstanding (examples)       |
| ----------------- | ---------------------------------------------------------------------------------- | ---------------------------- |
| Dashboard         | Refresh, Connect Etsy                                                              | Unshipped orders, new orders |
| Sales             | New order, Sync, Mark paid/shipped, Label, Thank you, Invoice, Record in inventory | Same                         |
| Inventory         | Add, Edit, Pictures, Mark listed/sold, Retire                                      | Items to list                |
| Customers         | Add, Edit, View order history, Add sale                                            | Incomplete addresses         |
| Reports           | Each report type, Export                                                           | —                            |
| Tutorial and tips | Search, Index, links to tips-folder files                                          | —                            |
| Config            | Connect Etsy, Default shipper, Business details, optional guide links              | —                            |

**Outstanding panel:** Same idea on every tab: unshipped orders, new orders, items to list, incomplete customers. Click an item → app **puts context in place** (correct tab + correct record, ready for action).

---

## 1b. Global application header (v1)

**Canonical detail:** ADR-071 §3.2, ADR-028, ADR-041, 051, 055, 063.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [App name]              [Connected ●] [Shop ▼]  [🕐] [🖨] [🔔] [Search] │
└──────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────────┐
│ Dashboard | Sales | Inventory | Customers | Reports | … | Config        │
└──────────────────────────────────────────────────────────────────────────┘
```

| Control              | Behavior                                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| App name             | `settings.business_name` or “Trudy’s Etsy Sales Manager”; links to Dashboard                                                                 |
| Etsy status          | Badge: Connected (`success`) / Not connected (`warning`)                                                                                     |
| Shop selector        | Dropdown when connected; drives sync and receipts scope                                                                                      |
| Recent (🕐)          | ADR-063 — dropdown of last viewed orders/items/customers                                                                                     |
| Print queue (🖨)     | ADR-055 — badge with count; opens queue drawer                                                                                               |
| Notifications (🔔)   | ADR-051 — unread count; panel lists sync/errors/outstanding                                                                                  |
| Search               | ADR-041 — opens command palette; `Cmd/Ctrl+K`                                                                                                |
| Connect / Disconnect | When disconnected: **Connect Etsy** `Button variant="accent"` in header; when connected: **Disconnect** in Config or header menu (secondary) |

**Mobile (ADR-061):** Icon-only cluster on right; app name truncates; tab bar scrolls horizontally.

---

## 1c. Dashboard layout (v1)

**Canonical detail:** ADR-016, ADR-016 extensions, ADR-037, ADR-038, ADR-064, ADR-044, ADR-071.

```
┌─────────────────────────────────────────────────────────┐
│ Dashboard                                               │
├────────────────────────────┬────────────────────────────┤
│ KPI cards (4-up grid)      │ Etsy connection card       │
│ Revenue MTD | Orders month │ Status, last sync, Sync    │
│ Listed count | Outstanding │ Reconnect if needed        │
├────────────────────────────┴────────────────────────────┤
│ Recent local orders (DataTable, 10 rows) → Sales deep link│
├─────────────────────────────────────────────────────────┤
│ Recent activity feed (ADR-037, 20 entries)              │
└─────────────────────────────────────────────────────────┘
```

| Widget               | Data source                                       | Empty / not connected                  |
| -------------------- | ------------------------------------------------- | -------------------------------------- |
| KPI cards            | `GET /api/dashboard`, inventory-value, stats      | Show “—” or prompt Connect             |
| Recent orders        | Local `orders` (not Etsy receipts-only long term) | EmptyState → Sales or Connect          |
| Activity feed        | `GET /api/activity?limit=20`                      | Hidden if empty                        |
| Setup wizard overlay | ADR-044 when `setup.completed` absent             | Blocks interaction until skip/complete |

**Not connected state:** Hide KPIs and orders table; show single card: message + **Connect with Etsy** (ADR-016).

---

## 1d. List views — search, filters, and sort (v1)

**Canonical detail:** ADR-029, ADR-071, ADR-028 DataTable.

Each list tab (Sales, Inventory, Customers) uses a **toolbar** above the table:

```
[ Search……………… ]  [Status ▼] [More filters ▼]  [Clear]     [Primary action]
```

| Tab       | Filter chips (toggle)                                       | Sort default      |
| --------- | ----------------------------------------------------------- | ----------------- |
| Sales     | All, Unpaid, Paid, Not shipped, Shipped, Etsy, Manual, Void | `order_date` desc |
| Inventory | All, Draft, In stock, Listed, Sold, Reserved, Retired       | `item_number` asc |
| Customers | All, Active, Has orders, Incomplete address                 | `last_name` asc   |

- **Search:** Debounced 300ms; placeholder plain language (“Search orders, customers, items…”).
- **Clear filters:** Resets chips + search; restores default sort.
- **Pagination:** Bottom of table; page size from `settings.ui.page_size` (ADR-034).
- **Loading:** Skeleton rows (5) then data per ADR-071 §7.

---

## 5.9 Print shipping label (preview UX)

**Canonical detail:** shipping-label-carrier-templates.md, ADR-031, ADR-070 (no carrier API).

1. User selects order → **Print shipping label** (Sales detail or command).
2. **Precheck:** If `ship_to_*` incomplete → modal: “Complete ship-to address on this order first” + **Edit order** (stays on Sales).
3. **Precheck:** If `shipper` empty → prompt to choose carrier (same as mark-shipped).
4. **Precheck:** If `shipping_info_{carrier}` missing in settings → modal: “Shipping Info for {carrier} is not set up.” Actions: **Go to Config** (navigate `/config#shipping`) | **Cancel**.
5. **Preview modal:** Title “Shipping label — Order {order_number}”; embedded preview (PDF or HTML print view); ship-to + return address from settings + order snapshot.
6. Actions: **Print** (browser print dialog) | **Close**.
7. **Optional:** After print, toast info: “Mark this order shipped when you’ve dropped it off?” with **Mark shipped** shortcut.

No automatic tracking number submission to carriers.

---

## 5.10 Visual consistency

All screens follow **ADR-071** (badges, toasts, colors, order fulfillment progress) and **System_Colors.md** (hex tokens). Implementers run the per-screen checklist in ADR-071 §9 before marking a tab complete.

---

## 7. Next steps

- **Layout decided:** Config + icon (left = commands, right = outstanding to-do's, or the reverse).
- Lock tab set: at least Dashboard, Sales, Inventory, Customers, Reports, **Outstanding**, Tutorial and tips, Config.
- Prioritize which commands and outstanding items to build first (e.g. Sales + “mark shipped” + unshipped orders in outstanding).
- Add or remove processes (e.g. “List on Etsy” from the app) once we know integration scope.
- Use this doc as the reference for implementation (no code in this document).

---

## Implementation notes (updated 2026-05-24)

### v1 layout simplification

The v1 implementation uses a simplified layout without the side panels described above:

- **Commands panel:** Deferred to post-v1. Context-sensitive actions are placed inline on each page using the shared `Button` component (ADR-028). The commands panel concept remains a design goal for a future iteration.
- **Outstanding panel:** Deferred to post-v1. The full-page **Outstanding tab** fulfills the outstanding-list requirement. Clicking an item navigates to the target page with a deep-link query parameter (ADR-035).
- **Panel layout flip:** Deferred (depends on side panels).
- **All tab names, tab order, and intuitive design principles** remain in effect for v1.

See ADR-009 "Implementation status" and ADR-024 for the v1 component architecture.

### Schema terminology

**Customer sale** = one `orders` row + `order_items` line(s). **Vendor buy** = `purchases` (inventory sourcing). Ship-to convenience rows = `addresses`; billing address on `customers`. UI copy should say **order** / **sale**, not “purchase,” unless referring to vendor buys or `date_purchased` on inventory. See ADR-003, ADR-017, ADR-019.

### Features ADR-038–069 (UX index)

Detailed UI spec lives in each feature ADR; this index ties tabs to ADRs for implementers.

| Area          | Feature                                             | ADR                     |
| ------------- | --------------------------------------------------- | ----------------------- |
| Header        | Global search (Cmd/Ctrl+K)                          | 041                     |
| Header        | Notification bell                                   | 051                     |
| Header        | Print queue                                         | 055                     |
| Header        | Recently viewed                                     | 063                     |
| Dashboard     | Profit KPIs, inventory value, repeat customers      | 038, 064, 066           |
| Dashboard     | Setup wizard overlay                                | 044                     |
| Sales         | Batch bar, inline edit, timeline                    | 040, 062, 052           |
| Sales         | Print queue add                                     | 055                     |
| Inventory     | CSV import, listing score, profitability row        | 047, 068, 038           |
| Customers     | Notes log, merge tool, duplicate warnings           | 065, 053, 048           |
| Reports       | Profit, tax, aging, accounting export               | 038, 039, 054, 056      |
| All tabs      | Empty-state CTAs, help tooltips, mobile layout      | 059, 060, 061           |
| Config        | Tax, sample data, auto-sync                         | 039, 069, 057           |
| Cross-cutting | Unsaved guard, progress/jobs, undo, a11y, shortcuts | 042, 043, 067, 045, 049 |
