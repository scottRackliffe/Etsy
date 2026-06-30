# Major Enhancements Program — Master Plan

**Created:** 2026-06-21
**Owner:** Trudy / Scott (product) + AI implementer
**Status:** Active — design/doc phase
**Branch:** `feature/final-system-completion`

---

## 0. How to use this document

This is the **backbone** for a multi-part enhancement program. It is intentionally the
single source of truth for:

1. The **locked product decisions** made with the owner (Section 2).
2. The **eight workstreams** (A–H), each with scope, impacted/new ADRs, dependencies, open
   design questions, and status (Section 4).
3. The **sequencing/phases** (Section 5).
4. The **ADR reconciliation checklist** required by `.cursorrules` §1b (Section 6).

**Process rule (owner directive): doc-first.** For every workstream we (a) resolve all open
design questions in this doc, (b) write/update the impacted ADRs so there is *no ambiguity or
assumption*, and only then (c) produce the step-by-step implementation instruction sheet and
write code. ADRs are king (`.cursorrules` §1, §1b).

**Status legend:** `planned` · `designing` · `adr-ready` · `in-progress` · `done` · `blocked`

---

## 1. Goal

Move the app from "data manager" toward its flagship value: **automated / auto-assisted
creation of Etsy listings** (the most time-consuming task next to packing and shipping), plus
a consistent, friction-free UI and richer activity/communication tooling.

---

## 2. Locked decisions (from owner, 2026-06-21)

| Ref | Decision |
|-----|----------|
| **B** | Recent Activity and Activity Log show the **same data, two views**. Recent Activity = **newest 25 only**, no footer/paging, **narrower** so the Activity Log can show all its columns full-width. **Width split confirmed: Recent Activity 1/3, Activity Log 2/3.** |
| **A** | **Deleted** records appear in the activity lists with **no link** (record no longer exists). **"Sales" and "Orders" are the same thing — one filter chip labeled "Sales / Orders".** |
| **C** | **LOCKED.** Maximize automation; do **not** reinvent. In-app Communications/Outreach Center. **Etsy-compliance ("Etsy Safe") rule — owner-approved:** all messages are transactional/order-tied only (never marketing). **Payment reminders restricted to manual-channel orders** (Etsy collects payment at checkout, so Etsy orders are already paid). **Thank-you notes** allowed for both channels — default **printed letter** for Etsy-channel, email optional; email or letter for manual-channel. Channels: **email (new SMTP) + printable PDF**. |
| **D** | Listing quality pass threshold: **≥ 85% passes** (85 passes). Real target ≈ **98%** via a rigorous rubric built from Etsy + cross-platform best practices (must research the web). The **low-quality dashboard widget** excludes **Sold / Retired / Inactive**. |
| **E** | Define the new universal form standard, **update/create all impacted ADRs together**, **pilot on ONE form** (recommend **Vendors**), debug, update ADRs, then roll out to all. |
| **G** | The sophisticated quality review is a **new Listing Quality phase/class**, **separate** from the existing `inventory.status` enum (which is retained). |
| **Infra** | Local store, SQLite DB, and GitHub remote are all already accessible — nothing to reconnect. |

---

## 3. Connectivity / environment (verified 2026-06-21)

- **Local:** `/Users/scottrackliffe/etsy` (read/write OK)
- **DB:** `data/app.sqlite` (activity_log = 441 rows at time of check)
- **Remote:** `origin → https://github.com/scottRackliffe/Etsy.git`
- **Stack today:** Next.js 16, better-sqlite3, OpenAI, EasyPost, pdfkit, sharp. **No email/SMTP layer exists yet.**

---

## 4. Workstream catalog

Sizes: ▪ small · ▪▪ medium · ▪▪▪ large · ▪▪▪▪ very large.

### WS-B — Dashboard "Recent Activity" view (▪ small) — `adr-ready`
**Source:** 1.a, 1.b
**Goal:** Recent Activity = newest **25**, single-spaced, **no footer/paging**, **narrower**
column; give the remaining width to Activity Log so all its columns fit.
**Impacted ADRs:** ADR-016 (dashboard).
**Dependencies:** none (current data already supports it).
**Resolved:** Width split = **Recent Activity 1/3, Activity Log 2/3** (`lg:grid-cols-3` with
`col-span-1` / `col-span-2`).
**Notes:** Removes the pagination footer added earlier; Recent = pure "latest 25" snapshot.

### WS-D — Low-quality inventory widget (▪ small, widget only) — `adr-ready`
**Source:** 1.f
**Goal:** Dashboard widget: scrollable list of **current inventory below the quality
threshold** (initially < 85% using existing score), each row linking to the item.
**Scope in:** active/listable items. **Scope out:** Sold, Retired, Inactive.
**Impacted ADRs:** ADR-016 (dashboard), ADR-064 (widget pattern), ADR-068 (quality score).
**Dependencies:** ships now at 85% with the *existing* score; the **98% rubric upgrade lands
with WS-G** (do not block the widget on the rubric).
**Open questions:** Columns to show (item #, title, score, status?); sort order (lowest score
first?); click target (inventory detail deep-link).

### WS-A — Activity tracking expansion (▪▪ medium) — `adr-ready`
**Source:** 1.c, 1.d, 1.e
**Goal:** Log **all** meaningful events and make them filterable + deep-linkable in **both**
the Recent Activity and Activity Log views.
**Entities to cover (add/change; delete = logged but no link):** Orders, Customers,
Receipts, Vendors, AP/Business Expenses, Shipping, Reports-run, System events, Config changes,
Inventory (existing).
**Filter chips to add:** Receipts, Sales, Vendors, Expenses, Reports, Config, Shipping
(in addition to existing All, Inventory, Orders, Customers, Sync, System, Backup).
**Impacted ADRs:** ADR-037 (activity log), ADR-035 (deep links), ADR-016 (dashboard),
ADR-018 (`/api/activity` filter params).
**Dependencies:** none hard; pairs naturally with WS-B.
**Resolved:** "Sales" and "Orders" are the same — **one chip labeled "Sales / Orders".**
**Open questions:**
1. Canonical `entity_type` values + the **deep-link target** per type (must align logging
   taxonomy with filter taxonomy and ADR-035 routes). Draft mapping to live in ADR-037.
2. Which actions are logged per entity (create/update/delete/run/export/etc.).

### WS-C — Communications / Outreach Center (▪▪ medium) — `adr-ready`
**Source:** 1.h (payment reminders) + owner's broader "lists who needs X, generate, send" idea
**Proposed goal:** A center that (1) **computes action lists** from existing data
(e.g. *Needs payment reminder* = shipped + unpaid; *Needs thank-you* = delivered + not yet
thanked; extensible), (2) **merges** customer/order data into reusable templates (same engine
as Invoice/Thank-You PDFs), (3) **sends in batch** via **email** (new SMTP/nodemailer,
credentials in Config, encrypted) and/or **batch PDF/print** (reuse print queue), (4) **tracks**
sends in a new `communication_log` so nothing double-sends and it surfaces in activity.
**Impacted ADRs:** ADR-006/013/036 (documents), ADR-034 (Config: email settings),
ADR-037 (activity), ADR-011/etsy-compliance (off-platform messaging caution).
**New ADR:** **ADR-078 — Communications & customer outreach.**
**New infra (only genuinely new piece):** email sending + `communication_log` table.
**Resolved (Etsy compliance + channels):** All messages transactional/order-tied only (never
marketing). **Payment reminders → manual-channel orders only** (Etsy prepays at checkout).
**Thank-you notes →** both channels; default **printed letter** for Etsy-channel (email
optional), email or letter for manual-channel. Channels = **email (new SMTP) + printable PDF**.
**Open questions:**
1. Editable `.docx` output ever needed, or is branded **PDF + email body** sufficient? (Propose
   PDF + email body; add `.docx` only if requested.)
2. Which additional action-list triggers beyond payment-reminder and thank-you (e.g. review
   request, back-in-touch)? — enumerate in ADR-078.

### WS-F — Split Shipping into a top-level module (▪▪▪ large) — `adr-ready`
**Source:** 2
**Goal:** New top-level **Shipping** menu/tab with the shipping functionality currently inside
Sales: shipping fields, package dimensions, and the (working) shipping-shopping modal. Sales
no longer hosts shipping. Clarify where "Financials" summary numbers live (owner believes they
are computed summaries — likely stay computed on the order).
**Impacted ADRs:** ADR-024 (frontend arch — add tab, remove shipping from order detail),
ADR-031 (order detail — shipping fields move out), ADR-074 (EasyPost shipping),
ADR-009 / ui-design.md (tab bar), ADR-018 (routes). Likely **no schema change** (data stays on
`orders`); to confirm.
**New ADR:** **ADR-080 — Top-level Shipping module.**
**Open questions:** Exact field set that moves; how Shipping selects an order (its own list vs
deep-link from Sales); whether Financials block stays on Sales (yes, as computed summary).

### WS-E — Universal data-entry form framework (▪▪▪▪ very large) — `adr-ready`
**Source:** 1.5.a, 1.5.b, 1.5.c
**Goal:** One consistent structure for **every** entity screen:
- **Dirty-form guard everywhere:** cannot leave a changed form without choosing **Save changes /
  Cancel changes**; even on navigation away, confirm and report the outcome, then clear the
  dirty flag.
- **Consistent Save placement** + add **"Save changes"** to the existing unsaved-changes popup
  (currently only Keep editing / Discard). Popup outcomes: *saved* message, *cancelled* message,
  or *return to prior location*.
- **List-first, full-width layout:** single-spaced full-width record list with appropriate
  **stacked-but-compact filters** (one or two rows, not stacked vertically without reason);
  **first row = "Add New"**; **edit/delete icon** at end of each row; **double-click = edit**.
- **Delete** = status/flag change (soft-delete) per agreed rule, or cascade delete of record +
  children where appropriate.
- **Add/Edit panel** = next grouping, all fields as today but **dead space removed** for a
  readable, efficient layout; all current validation + dropdown behavior preserved.
**Impacted ADRs (reconcile — this CHANGES established patterns):** ADR-024 (currently "inline
panels, no detail sub-routes, master-detail"), ADR-030 (inventory detail), ADR-031 (order
detail), ADR-042 (unsaved-changes guard — extend popup with Save), ADR-028 (shared components),
ADR-029 (search/filter/sort/pagination), ADR-032 (confirm dialogs), ADR-062 (inline edit).
**New ADR:** **ADR-079 — Standard Entity Management Screen (SEMS).**
**Approach (locked):** define standard → write/reconcile ADRs → **pilot on Vendors** → debug →
update ADRs → roll out to all entities one at a time.
**Open questions:** Soft-delete vs hard-delete per entity (likely per-entity table in ADR-079);
keep "Add New as first row" vs a sticky toolbar button; mobile/responsive behavior (ADR-061).

> **Follow-on: WS-L — Listing consolidation (ADR-085, 2026-06-21).** After WS-G/WS-H landed, the
> owner directed collapsing to a **single** listing system. WS-L removes the Listing Coach, the
> ADR-023 modes + `listing_draft_state` machine, portable export/import, approve/reject,
> `improve-listing`, and `computeListingScore`; the lifecycle's **Generate** absorbs the Coach's
> full AI brain (research, **price recommendation**, all fields, Google paste, clipboard paste,
> video, refine); **`sale_revenue` is no longer a generation prerequisite**; publish gates on
> `listing_phase = 'listing_ready'`; the ADR-082 rubric becomes the single quality engine. See
> **ADR-085**. Steps: L1 Generate engine, L2 inline create, L3 port Coach UI, L4 quality unify,
> L5 publish re-gate, L6 delete dead code.

### WS-G — Inventory AI listing lifecycle + quality engine (▪▪▪▪ very large) — `adr-ready`
**Source:** 3 (+ flagship goal)
**Goal:** Unify the new-vs-existing AI flow behind **one context-aware button** with three phases:
1. **Evaluate Data** — when required fields are missing. Produces a **remediation list** of the
   high-quality-listing requirements with **missing items highlighted**, each having a
   **resolution link** that jumps to the exact form location.
2. **Generate Listing** — when all required data present. Calls AI with all data + **all
   pictures**; on success stores a **generation timestamp** to detect later data drift.
3. **Evaluate Listing Quality** — when a listing exists and no item data changed since the
   timestamp. Runs a **very sophisticated** review against Etsy best practices covering
   everything a buyer sees (titles, descriptions, tags, **per-photo specs**, etc.). Each field
   and each photo has a **comprehensive specification**; failures add **shortcomings +
   mitigations** to a **listing-quality remediation list**. When that list is empty → ready for
   re-evaluation. Target ≈ **98%**.
**New phase class (locked):** a **separate "listing phase"** (Needs Data / Ready to Generate /
Needs Quality Remediation / Listing-Ready, etc.), **not** folded into `inventory.status`
(which stays Draft/In stock/Listed/Sold/Reserved/Retired). Used as an inventory list filter.
**Impacted ADRs:** ADR-023 (listing modes), ADR-068 (quality score), ADR-072 (Listing Coach),
ADR-002/017 (new phase field — additive), ADR-018 (endpoints), ADR-038 (sale revenue
requirement nuance: required for existing, not for brand-new — unify per owner).
**New ADRs:** **ADR-081 — Listing lifecycle & phases**; **ADR-082 — Listing quality rubric
(field & photo specifications)**.
**Dependency:** **WS-G research task** (Etsy + cross-platform best practices) feeds the rubric
and the WS-D 98% upgrade.
**Open questions:** Exact required-field set for "Generate"; how drift is detected (hash of
contributing fields vs timestamp compare); photo classification taxonomy reuse (ADR-072 shot
types); how AI per-photo judgment is specified/measured.

### WS-H — New AI assist features (▪▪▪ large) — `adr-ready`
**Source:** 10.a, 10.b
**Goal:**
- **10.a Shot list generator:** upload the **primary photo**, AI returns a **shot list** of all
  photos/videos needed for top rating — each item with a **name** and a **purpose/description**.
- **10.b Dimension annotation:** provide a photo containing a **reference ruler**; system copies
  the primary photo and overlays the derived **dimensions** (length, height, width as needed).
**Impacted ADRs:** ADR-026 (picture storage), ADR-033 (image upload), ADR-068 (quality),
ADR-072 (shot types). **New ADRs:** **ADR-083 — AI shot-list generation**; **ADR-084 — AI
dimension annotation.**
**Dependency:** best paired with WS-G (feeds photo specs/quality).
**Open questions:** Vision model + cost (10.a); ruler-detection reliability and manual-correction
fallback (10.b); output storage (new condition/extra slots vs annotated copy path).

---

## 5. Sequencing (phases)

Visible progress first; heaviest design last. Each phase is **doc/ADR-first**, then implement.

| Phase | Workstreams | Why here |
|-------|-------------|----------|
| **1** | **B**, **D (widget only)** | Quick, low-risk, no ADR conflicts; immediate visible wins. |
| **2** | **A** | Natural completion of activity work; locks the entity/deep-link taxonomy. |
| **3** | **C** | Medium; one new ADR + email infra; high owner value. |
| **4** | **F** | Architectural but self-contained (new tab, move fields). |
| **5** | **E** | Frontend re-architecture; ADRs together → pilot Vendors → roll out. |
| **6** | **G + H** | Flagship; deepest spec + web research (98% rubric); H feeds quality. |

---

## 6. ADR reconciliation checklist (`.cursorrules` §1b)

New ADRs **created (✅ done 2026-06-21):** **078** (Communications), **079** (SEMS forms),
**080** (Shipping module), **081** (Listing lifecycle/phases), **082** (Listing quality rubric),
**083** (AI shot-list), **084** (AI dimension annotation). All added to `documents/adr/README.md`
and `.cursorrules` §1 index.

ADR cross-updates — status (✅ = applied to canonical source now; ◻ = applied at workstream
implementation, tracked in the owning new ADR's Notes):

- ✅ **ADR-016** — WS-B (Recent Activity 25/narrower 1/3-2/3) + WS-D (low-quality widget) §6/§7.
- ✅ **ADR-037** — WS-A entity taxonomy (§A1), actions (§A2), deep-link map (§A3), filter chips
  (§A4), multi-type filter (§A5); + `communication` type/chip (ADR-078).
- ✅ **ADR-035** — WS-A new deep-link targets (receipt/vendor/expense/tax_payment/shipping) +
  deleted-no-link note.
- ✅ **ADR-018** — WS-A multi-type `/api/activity`; + §39 Communications endpoints (ADR-078).
- ✅ **ADR-017** — §6h `communication_log` + email/template settings (ADR-078). ◻ additive
  inventory columns (`listing_phase`, `listing_source_hash`, `shot_list_json`,
  `dimension_annotation_json`) at WS-G/WS-H impl (named in `.cursorrules` + ADRs 081/083/084).
- ✅ **ADR-042** — WS-E three-button unsaved dialog (Save / Discard / Keep editing).
- ✅ **ADR-031** — WS-F note: shipping/package/label move to ADR-080; `seller_shipping_cost`
  read-only mirror.
- ✅ **ADR-068** — superseded as authoritative quality def by ADR-082 (light score retained).
- ◻ **ADR-006 / 013 / 036** — WS-C payment-reminder letter output (at impl).
- ◻ **ADR-034** — WS-C Config Email section + template editors (at impl).
- ◻ **ADR-024 / ui-design.md** — WS-F `/shipping` tab; WS-E SEMS pattern; WS-B widths (at impl).
- ◻ **ADR-030** — WS-E SEMS scaffold + WS-G one-button (at impl; fields/validation unchanged).
- ◻ **ADR-028 / 029 / 032 / 062 / 061** — WS-E reconciliation (annotations at impl).
- ◻ **ADR-074** — WS-F shipping module is the EasyPost UI home (at impl).
- ◻ **ADR-023 / 072** — WS-G lifecycle/state alignment + Coach button; WS-H photo features (at impl).
- ◻ **ADR-002** — WS-G/WS-H additive inventory columns narrative (at impl).
- ◻ **ADR-011 / etsy-compliance.md** — WS-C transactional-only ruling (authoritative copy in
  ADR-078 §1; mirror at impl).
- ✅ **.cursorrules** — §1 index, cross-ref map, enums (entity_type, listing_phase, communication),
  settings keys, `communication_log` table, inventory columns, and "what's built/pending" updated.

---

## 7. Immediate next actions

**Doc-first phase is COMPLETE (2026-06-21):** all 7 new ADRs (078–084) written; canonical sources
(ADR-016/017/018/035/037/042/068, README, `.cursorrules`) reconciled; remaining cross-updates are
prose/UI annotations tracked above and applied per-workstream at implementation.

1. Owner review of ADRs 078–084 + this program for accuracy/no-ambiguity.
2. ✅ **Done:** best-practices research written
   (`documents/research/2026-06-21_etsy-listing-best-practices.md`, Etsy + eBay/Chairish/1stDibs +
   general e-commerce) and **folded into ADR-082** (notably the Etsy Aug-2025 title-guidance
   reversal, photo resolution = shortest-side ≥2000px, measurable condition, attribute
   completeness, maker's-mark photo).
3. Begin implementation in the Section 5 phase order (quick wins first: WS-B, WS-D, WS-A), each
   applying its ◻ cross-updates as it lands.

---

## 8. Change log

- **2026-06-21** — Document created; decisions B/A/C/D/E/G captured; 8 workstreams + phases +
  ADR plan drafted.
- **2026-06-21** — "Etsy Safe" locked for WS-C. **All 7 ADRs (078–084) written**; ADR-016/017/018/
  035/037/042/068 + README + `.cursorrules` reconciled; all workstreams set to `adr-ready`. WS-G
  best-practices research generated.
- **2026-06-21** — Research expanded to **cross-platform** (eBay, Chairish, 1stDibs, general
  e-commerce) + **photography technique, video, and dimension-imagery** sections (§9–§11, ~45
  sources). Folded into **ADR-082** (rubric), **ADR-083** (per-shot pass specs + lighting/raking-
  light technique + video spec), and **ADR-084** (overlay style: dual-unit labels, keep-hero-clean,
  per-shape logic) for the 98–100% quality goal.
