# Implementation guide — high level

This document gives a **high-level** implementation order. All detailed behavior, schema, APIs, validation, and UI are in the **ADRs** and **ui-design.md**; this guide only lists phases and which ADRs apply. Do not rely on this document for specification detail; use the ADRs.

---

## Current baseline implemented

- OAuth/auth callback/logout and Etsy proxy routes (`/api/shop`, `/api/receipts`).
- Dashboard UI with modernized visual treatment and clear connected/not-connected states.
- Listing-generation path with preflight requirements gate:
  - `GET /api/inventory/[id]/listing-readiness`
  - `POST /api/inventory/[id]/generate-listing-content`
- Shared global API error envelope + actionable user guidance in UI.

---

## Phase 1: Foundation

- Database: create schema and migrations per **ADR-017** (DDL).
- Auth and Etsy proxy: implement per **ADR-007** (OAuth, token/session storage, API routes: auth, shop, receipts).
- Dashboard: implement per **ADR-016** (content, structure, behavior).
- **References:** ADR-001, ADR-012, ADR-017, ADR-007, ADR-016.

---

## Phase 2: Tabbed UI and Sales

- Layout: v1 = header + tab bar + full-width main content per **ADR-009** / **ADR-024** (commands panel and outstanding **side panel** deferred post-v1; Outstanding is a full tab; actions inline per **ui-design.md**).
- Tab set and command lists per **ui-design.md** §2 and §3.
- Sales tab: order list (from DB and/or Etsy), commands (New order, Sync, Mark paid/shipped, etc.) per ui-design. New order and “add sale” use item pick list per **ADR-015**.
- Etsy sync: implement **ADR-019** (sync endpoint and step-by-step import).
- **References:** ADR-009, ADR-015, ADR-018 (Sales/orders and sync endpoints), ADR-019, ui-design §2–3.

---

## Phase 3: Outstanding list and context in place

- Outstanding list: implement each type per **ADR-020** (definitions and query rules). Panel and full-page tab per **ADR-009**.
- Context in place: click outstanding item and navigate to the correct tab/record so the user can act immediately.
- **References:** ADR-009, ADR-020, ui-design §4.

---

## Phase 4: Inventory and customers

- Inventory: CRUD, pictures, thumbnail, other costs per **ADR-002**, **ADR-010**, **ADR-017**, **ADR-018** (inventory endpoints). Validation per **ADR-021**. Delete behavior per **ADR-022**.
- Listing authoring modes per **ADR-023**:
  - manual winning-listing guided form,
  - integrated AI generation path,
  - hybrid export/import AI handoff path,
  - approval gate before publish-to-Etsy.
- Integrated AI connection settings and validation (provider/model/auth + connection test + retry/timeout/token-budget controls) in settings/config.
- Customers and addresses: CRUD per **ADR-003**, **ADR-017**, **ADR-018**. Validation per **ADR-021**. Delete per **ADR-022**.
- **References:** ADR-002, ADR-003, ADR-010, ADR-017, ADR-018, ADR-021, ADR-022, ADR-023, ui-design §3 (Inventory, Customers).

---

## Phase 5: Purchases and orders

- Orders and purchases: create/update, snapshot copy from customer/address, order_id grouping per **ADR-003**, **ADR-017**, **ADR-018**. Validation per **ADR-021**. was_paid per **ADR-017**, **ADR-020**.
- **References:** ADR-003, ADR-004, ADR-017, ADR-018, ADR-021.

---

## Phase 6: Reports

- Report generation: PDF per **ADR-013** (format and **report content** section). Exact content and data per report type in ADR-013. Endpoints per **ADR-018**. User choices after report: **Print, Export PDF, Export CSV, Cancel** per ADR-013.
- **References:** ADR-006, ADR-008, ADR-013, ADR-018.

---

## Phase 7: Config, settings, and polish

- Settings: persist and read per **ADR-008**, **ADR-017** (settings table), **ADR-018** (settings endpoints). Panel layout, default shipper, business details, currency per ADR-009 and ui-design §5.7.
- Token refresh: implement per **ADR-007** (Notes).
- Compliance: follow **ADR-011** and **etsy-compliance.md**.
- Tutorial and tips tab: per **ui-design.md** and knowledge-base-design if present.
- **References:** ADR-007, ADR-008, ADR-009, ADR-011, ADR-017, ADR-018, ui-design §5.7, etsy-compliance.md.

---

## Where to look for detail

| Topic                                                                       | Where                                               |
| --------------------------------------------------------------------------- | --------------------------------------------------- |
| Schema, DDL, indexes                                                        | ADR-017                                             |
| Every API endpoint                                                          | ADR-018                                             |
| Etsy sync step-by-step                                                      | ADR-019                                             |
| Outstanding list queries                                                    | ADR-020                                             |
| Validation rules                                                            | ADR-021                                             |
| Delete / integrity                                                          | ADR-022                                             |
| Report content (exact)                                                      | ADR-013                                             |
| Dashboard                                                                   | ADR-016                                             |
| UI layout, tabs, commands                                                   | ADR-009, ui-design.md                               |
| Inventory, customers, purchase model                                        | ADR-002, ADR-003, ADR-004                           |
| Pictures, thumbnail                                                         | ADR-010, ADR-015                                    |
| Etsy compliance                                                             | ADR-011, etsy-compliance.md                         |
| Etsy listing content, List on Etsy, AI generation (all item pictures to AI) | documents/etsy-listing-template-and-requirements.md |
| Listing mode strategy (manual/integrated/hybrid)                            | ADR-023                                             |
