# Development plan — AiCE

This plan sequences implementation in dependency order, reduces risk early, and delivers value incrementally. All behavior, schema, APIs, and UI details are in the **ADRs** and **ui-design.md**; this document only orders and scopes work. For specification detail, use the ADRs and the [implementation-guide.md](implementation-guide.md) reference table.

> **Data model (2026-05-24):** Customer sales = `orders` + `order_items`. Vendor buys = `purchases`. Schema SSOT = [ADR-017](adr/0017-database-schema.md). Historical “purchase row” wording below means order header + line items unless explicitly vendor `purchases`.

> **Documentation gate:** Complete [no-developer-questions-build.md](no-developer-questions-build.md) §4 before build. **Priority order:** §5 (priorities 1–52), blocked until §4 + §7 compliance audit pass. Phases below are historical sequencing context.

---

## Current build status (as of 2026-02-16)

- **Implemented baseline**
  - Modernized dashboard UI (connected/not-connected states, KPI cards, refined receipts table UX).
  - OAuth + Etsy proxy routes (`/api/auth/*`, `/api/shop`, `/api/receipts`).
  - Listing-generation flow:
    - `POST /api/inventory/[id]/generate-listing-content`
    - `GET /api/inventory/[id]/listing-readiness`
    - required-item-data preflight gate before listing request.
  - SQLite-backed data utilities added for inventory/listing generation path.
  - Global API error model introduced (structured, actionable user guidance).
- **Still pending for full build**
  - Inventory/customers/orders full CRUD endpoints per ADR-018.
  - Outstanding list + context-in-place implementation.
  - Reports endpoints/content completion.
  - Config/settings UI completion, migrations/seed/test/CI artifacts.

---

## Principles

- **Dependencies first:** Database and auth before tabs; sync and orders before outstanding list; data model before reports.
- **Risk early:** OAuth, token storage, and Etsy connectivity in Phase 1 so integration issues surface soon.
- **Value order:** Dashboard + connect → Sales tab + sync + mark paid/shipped → outstanding list and context-in-place → inventory/customers → reports → config and polish.

---

## Phase 1: Foundation

**Goal:** App runs; user can connect Etsy and see a defined home view.

| Order | Deliverable                                                                                                                                                                                                | References                |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 1.1   | Database: create schema and migrations per **ADR-017** (all tables, columns, indexes).                                                                                                                     | ADR-001, ADR-012, ADR-017 |
| 1.2   | Auth and Etsy proxy: OAuth flow, SQLite-backed token/session storage, API routes for auth, shop, receipts per **ADR-007**. Token refresh (Notes).                                                          | ADR-007                   |
| 1.3   | Dashboard: content, structure, and behavior per **ADR-016** (not connected / connected states, shop selector, receipts table when connected). Include consistent global error surfacing with user actions. | ADR-016, ADR-018          |

**Exit criterion:** User can open app, click “Connect with Etsy,” complete OAuth, see shop selector and receipts (or not-connected state), and receive consistent actionable error guidance for failures. No tabs yet.

---

## Phase 2: Tabbed UI and Sales

**Goal:** Full layout with tabs; Sales tab with order list and core commands; Etsy sync and mark paid/shipped.

| Order | Deliverable                                                                                                                                                                                                        | References                                    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| 2.1   | Layout: tabs (top), full-width main content per **ADR-009** / **ADR-024** v1 (side commands/outstanding panels deferred). Outstanding as full tab. Tab set and commands per **ui-design.md** §2 and §3.            | ADR-009, ADR-024, ui-design §2–3              |
| 2.2   | Sales tab: order list (from DB and/or Etsy), commands per ui-design — New order, Sync from Etsy, Mark as paid, Mark as shipped. New order and “add sale” use item pick list per **ADR-015**.                       | ADR-015, ADR-018 (Sales/orders), ui-design §3 |
| 2.3   | Etsy sync: implement **ADR-019** (sync into `customers`, `addresses`, `orders`, `order_items`).                                                                                                                    | ADR-019, ADR-018                              |
| 2.4   | Mark paid: set `orders.was_paid = 1`. Mark shipped: update `orders` (shipping_date, shipper, tracking_number, etc.); enforce ship-until-paid or override per **ADR-021** (`orders.shipped_without_paid_override`). | ADR-017, ADR-018, ADR-021                     |

**Exit criterion:** User can switch tabs, use Sales tab to sync Etsy orders, create new orders (with item pick list), mark orders paid and shipped (with override when not paid). Outstanding panel may be placeholder.

**Prioritization (ui-design §7):** Sales + “mark shipped” + unshipped orders in outstanding is the first slice; build that before expanding other commands or outstanding types.

---

## Phase 3: Outstanding list and context in place

**Goal:** Outstanding list is data-driven; clicking an item navigates to the correct tab and record (context in place).

| Order | Deliverable                                                                                                                                                                                                                      | References                     |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 3.1   | Outstanding list: implement each type per **ADR-020** (definitions and query rules). Panel and full-page Outstanding tab per **ADR-009**.                                                                                        | ADR-009, ADR-020, ui-design §4 |
| 3.2   | Context in place: click outstanding item → navigate to correct tab and open/select correct record so user can act immediately (e.g. Mark shipped, View order). Main content area shows that tab and record; no separate overlay. | ADR-009, ui-design §4          |

**Exit criterion:** Outstanding panel and Outstanding tab show the same list (e.g. unshipped orders, unpaid orders, new Etsy orders not synced, in-stock not listed, customers with incomplete address). Clicking an item opens the right tab and record.

---

## Phase 4: Inventory and customers

**Goal:** Full CRUD for inventory (with pictures) and customers/addresses; validation and delete behavior defined.

| Order | Deliverable                                                                                                                                                                                                | References                                                  |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 4.1   | Inventory: CRUD, pictures, thumbnail, other costs per **ADR-002**, **ADR-010**, **ADR-017**, **ADR-018** (inventory endpoints). Validation per **ADR-021**. Delete behavior per **ADR-022**.               | ADR-002, ADR-010, ADR-017, ADR-018, ADR-021, ADR-022        |
| 4.2   | Listing authoring modes per **ADR-023**: (a) manual winning-listing guided form, (b) integrated AI generation, (c) hybrid export/import handoff flow with draft validation + approval gate before publish. | ADR-018, ADR-023, etsy-listing-template-and-requirements.md |
| 4.3   | Integrated AI connection settings: provider/model/auth config + validation + test-connection UX + retry/timeout/token-budget controls in Config/settings and backend settings model.                       | ADR-017, ADR-018, ADR-023, ADR-021                          |
| 4.4   | Customers and addresses: CRUD per **ADR-003**, **ADR-017**, **ADR-018**. Validation per **ADR-021**. Delete per **ADR-022**.                                                                               | ADR-003, ADR-017, ADR-018, ADR-021, ADR-022                 |

**Exit criterion:** User can add/edit/delete inventory (with picture import and thumbnail) and customers/addresses. Listing authoring supports manual guided completion, integrated AI generation, and hybrid export/import flow; all paths enforce readiness checks, schema validation, and approval-before-publish. Outstanding “In stock but not Listed” and “customers with no or incomplete address” are backed by real data.

---

## Phase 5: Orders (full flow)

**Goal:** `orders` + `order_items` created/updated with ship-to snapshot; validation and ship-without-paid override in place.

| Order | Deliverable                                                                                                                                                                        | References                                  |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 5.1   | Orders: create/update via **ADR-003**, **ADR-017**, **ADR-018** (`POST/PATCH /api/orders`). Snapshot ship-to on `orders`; line items in `order_items`. Validation per **ADR-021**. | ADR-003, ADR-004, ADR-017, ADR-018, ADR-021 |

**Exit criterion:** New order flow creates `orders` + `order_items` with full ship-to snapshot; `PATCH /api/orders/[id]` supports shipping_date, shipper, seller_shipping_cost, discount_total, notes, tracking_number; mark-paid and mark-shipped (with override) behave per ADR-021 and ADR-017.

---

## Phase 6: Reports

**Goal:** All report types generate PDF (and options: Print, Export PDF, Export CSV, Cancel) with exact content per ADR-013.

| Order | Deliverable                                                                                                                                                                                                                                 | References                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 6.1   | Report generation: PDF per **ADR-013** (format and report content section). Exact content and data per report type in ADR-013. Endpoints per **ADR-018**. User choices after report: **Print, Export PDF, Export CSV, Cancel** per ADR-013. | ADR-006, ADR-008, ADR-013, ADR-018 |

**Exit criterion:** User can run each report type from Reports tab; output matches ADR-013; post-generation actions work.

---

## Phase 7: Config, settings, and polish

**Goal:** Settings persist; panel layout, business details, Shipping Info, tutorial/pictures paths; token refresh; compliance.

| Order | Deliverable                                                                                                                                                                                                                                                                                                      | References                                                                                |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 7.1   | Settings: persist and read per **ADR-008**, **ADR-017** (settings table), **ADR-018** (settings endpoints). Panel layout, default shipper, business details, currency per ADR-009 and ui-design §5.7.                                                                                                            | ADR-008, ADR-009, ADR-017, ADR-018, ui-design §5.7                                        |
| 7.2   | Config: Shipping Info (per carrier) for labels; optional “Why pictures matter” path (pictures_matter_url), optional “Tutorial and tips folder” path (tutorial_system_folder_path). Defaults: system/tips/ and built-in tutorial per **knowledge-base-design.md** and **design-decisions-implementation.md** §18. | ADR-017, design-decisions §18, knowledge-base-design, shipping-label-carrier-templates.md |
| 7.3   | Tutorial and tips tab: search, index, links to tips-folder files per **ui-design.md** and **knowledge-base-design.md**.                                                                                                                                                                                          | ui-design, knowledge-base-design                                                          |
| 7.4   | Token refresh: implement per **ADR-007** (Notes). Compliance: **ADR-011** and **etsy-compliance.md**. Harden global error observability/user guidance for all routes and key UI flows.                                                                                                                           | ADR-007, ADR-011, etsy-compliance.md, ADR-018                                             |

**Exit criterion:** User can change panel side, default shipper, business details; set Shipping Info for labels; optionally set pictures_matter_url and tutorial_system_folder_path. Tutorial and tips tab works with default system/tips/ and search/index. Token refresh and Etsy compliance followed.

---

## Optional / later

- **Print shipping label:** Generate and print label from order ship-to + stored Shipping Info per **shipping-label-carrier-templates.md** (no carrier API). Required Shipping Info in Config when needed.
- **Thank you note / Invoice:** Generate and print per ADR-013 content.
- **Record in inventory:** Link order to inventory item / mark item sold (ui-design Sales commands).
- **List on Etsy:** Add or remove once integration scope is known (ui-design §7).

---

## Where to look for detail

Same as [implementation-guide.md](implementation-guide.md):

| Topic                                      | Where                                       |
| ------------------------------------------ | ------------------------------------------- |
| Schema, DDL, indexes                       | ADR-017                                     |
| Schema drift and migration plan            | documents/database/SCHEMA_RECONCILIATION.md |
| Every API endpoint                         | ADR-018                                     |
| Etsy sync step-by-step                     | ADR-019                                     |
| Outstanding list queries and caching       | ADR-020                                     |
| Validation rules                           | ADR-021                                     |
| Delete / integrity                         | ADR-022                                     |
| Report content (exact)                     | ADR-013                                     |
| Dashboard                                  | ADR-016                                     |
| UI layout, tabs, commands                  | ADR-009, ui-design.md                       |
| Frontend component architecture            | ADR-024, documents/frontend-architecture.md |
| Client-side state management               | documents/state-management.md               |
| Inventory, customers, orders model         | ADR-002, ADR-003, ADR-004                   |
| Pictures, thumbnail, storage               | ADR-010, ADR-015, ADR-026                   |
| Token refresh middleware                   | ADR-025                                     |
| Backup and restore                         | ADR-027                                     |
| Etsy compliance                            | ADR-011, etsy-compliance.md                 |
| Etsy listing content, AI generation        | etsy-listing-template-and-requirements.md   |
| Listing generation modes and approval flow | ADR-023                                     |
| Build readiness checklist                  | documents/no-developer-questions-build.md   |
