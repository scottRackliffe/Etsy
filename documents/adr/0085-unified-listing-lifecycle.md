# ADR-085: Unified listing lifecycle — a single listing processor

## Status

Accepted

## Date

2026-06-21

**Supersedes:**

- **ADR-023** (listing content generation *modes* + `listing_draft_state` machine) — the
  four-modes model and the `draft → generated|imported → approved → published` state machine are
  retired. Direct field editing survives as plain editing, not as a named "mode."
- **ADR-072** (Listing Coach guided new-listing flow) — the standalone `/listing-coach` wizard is
  removed; its entire AI capability is absorbed into the lifecycle **Generate** step.
- **ADR-068** (lightweight listing quality score) — `computeListingScore` is retired; **ADR-082**
  is the single quality engine everywhere.

**Amends (made canonical / coexistence language removed):** ADR-081 (lifecycle), ADR-082 (rubric).

## Context

The app accumulated **two parallel listing systems**:

1. The **ADR-081 lifecycle** (`listing_phase`) + **ADR-082 rubric** — a single context-aware
   button (Evaluate Data → Generate Listing → Evaluate Listing Quality). This is the UX the owner
   wants and the one wired into the inventory detail panel.
2. The **ADR-023 machinery** — four "modes," a separate `listing_draft_state` machine, portable
   export/import, approve/reject, and a publish gate keyed on `listing_draft_state = 'approved'`.
   Plus the **ADR-072 Listing Coach**, the only path that did real AI research (web-search price
   recommendation, identification, full-field authoring) and the only create flow. Plus a **second
   quality scorer** (ADR-068 `computeListingScore`) feeding the list column, Outstanding, and the
   dashboard — distinct from the ADR-082 rubric that drives the phase.

This duplication produced concrete defects: the lifecycle **Generate** only wrote
title/description/tags and **required** a sale price as input, while the owner's intent is that
**the AI recommends the price from research**. Publishing gated on a `draft_state` whose approve UI
did not exist. Two scorers disagreed.

The owner's decision: **"three listing state processors and remove all of the older stuff."**

## Decision

There is **one** listing system: the **three-processor lifecycle** on the inventory detail
editor, driven by `listing_phase`, scored by the single **ADR-082 rubric**, ending in **Publish to
Etsy** when quality is high enough.

```
Evaluate Data  →  Generate Listing  →  Evaluate Listing Quality  →  (listing_ready) → Publish to Etsy
```

### 1. The three processors (canonical button — ADR-081)

The single context-aware button on the inventory detail follows `listing_phase`:

| Phase | Button | Action |
| --- | --- | --- |
| `needs_data` | **Evaluate Data** | Show the data-remediation checklist. |
| `ready_to_generate` | **Generate Listing** | Run the full AI Generate engine (§3); recommend price + write all fields; set hash/timestamp; → `generated`. |
| `generated` / `needs_quality_remediation` / `listing_ready` (no drift) | **Evaluate Listing Quality** | Run the ADR-082 rubric; → `needs_quality_remediation` or `listing_ready`. |

When phase is `listing_ready`, a **Publish to Etsy** action becomes available (§5).

### 2. Required-data gate (price no longer required to generate)

The generation gate (`validateItemForListingRequest`) requires **only**:

- `item_number` (non-empty)
- `description` (non-empty)
- `condition_code` (set)
- **at least one picture** (the hero, `picture_1`)

`sale_revenue > 0` is **removed** as a generation/data prerequisite. Price is an **output** of
Generate (a recommendation the owner accepts/edits), not an input. Price still contributes to the
ADR-082 **Pricing & shipping** rubric category, so an unset/implausible price simply lowers the
quality score and produces a remediation item — it never blocks generation.

### 3. Generate absorbs the Listing Coach's full AI brain

The lifecycle **Generate Listing** step performs the research-and-compose work formerly unique to
the Coach. All of the following are **retained** and relocated into the inventory detail flow
(nothing is lost):

- **AI web-search price recommendation** — low/high/suggested, confidence, rationale citing
  comparable sales. Writes the recommended `sale_revenue` (editable by the owner).
- **Full AI authoring** — identification + all listing fields (`listing_title`,
  `listing_description`, `listing_tags`, `listing_category_path`, and the strategy fields:
  `listing_title_strategy`, `listing_product_story`, `listing_condition_clarity`,
  `listing_attributes`, `listing_pricing_shipping_notes`, `listing_quality_checklist`), plus
  suggested `etsy_when_made`, `etsy_taxonomy_id`/path, `materials`, dimensions, and
  `picture_classifications`.
- **Google Visual Search screenshot paste** for price comps.
- **Evidence/citation tags + compliance self-check** on AI claims (per-field
  `evidence`/`confidence`, citations array, compliance check).
- **Clipboard photo paste (Cmd+V)** in the picture grids.
- **Auto listing-video generation.**
- **Per-field and global AI "refine / Fix this field"** controls.

Generate always sends **all non-empty pictures** to the AI (unchanged invariant). The hero photo
drives the initial Generate; the remaining shots are added during the Quality step (guided by the
shot list, ADR-083).

### 4. Single quality engine (ADR-082 everywhere)

The ADR-082 rubric is the **only** quality scorer. `computeListingScore` (ADR-068) is retired.

- The rubric exposes a **deterministic fast path** (no AI: text/counts/presence/taxonomy/price) for
  fast surfaces — the Inventory list **Quality** column + sort, the **Outstanding** low-quality
  list, the **dashboard** low-quality widget, and the **inventory aging** report.
- The **full path** (deterministic + AI per-photo vision, ADR-082 §8b) runs on **Evaluate Listing
  Quality** and is cached in `listing_quality_json`. Cached score is used for display when present;
  the deterministic fast path is used when no cache exists.
- Publish gate = single setting `listing.min_quality_score` (default **85**, a firm minimum); the AI drives the score **toward ~100** (aspiration). No separate 98 target.

### 5. Publish gate moves to `listing_ready`

Publish-to-Etsy is gated on **`listing_phase = 'listing_ready'`** (rubric passed, no blocking
remediation) **plus** the existing Etsy field checks (`validatePublishReadiness`: `etsy_when_made`,
`etsy_taxonomy_id`, return policy + shipping profile per-item-or-global, materials/dimensions
validity). The **Publish to Etsy** action surfaces in the lifecycle controls once `listing_ready`.

Retired from the publish path: `listing_draft_state = 'approved'`, `listing_approved_at`, the
approve/reject step, and the publish-preview **hash** gate. Publishing remains **official Etsy API
only** (ADR-011/073) and still writes `etsy_listing_id`, `is_listed`, `status = 'Listed'`,
`listing_published_at`, `date_listed` on success.

**Re-publish guard (already on Etsy).** Publishing must never silently duplicate a live listing.
- **First publish** (no `etsy_listing_id`): publish directly (createDraftListing → activate).
- **Re-publish** (item already has `etsy_listing_id`): the **Publish to Etsy** action **requires an
  explicit user choice** via a confirmation dialog (ADR-032) that names the existing listing and
  offers two actions plus Cancel:
  - **Update existing listing** → call the Etsy **updateListing** API on the stored
    `etsy_listing_id` (no duplicate); refresh fields/images; update `listing_published_at`. Keeps
    the same `etsy_listing_id`.
  - **Create new listing** → createDraftListing → **new** `etsy_listing_id` (the dialog warns this
    creates a separate/duplicate Etsy listing; the previous one is left untouched on Etsy).
- The server enforces the guard too: `POST /api/inventory/[id]/publish-to-etsy` rejects a
  re-publish that lacks an explicit `mode` with **409 `ALREADY_PUBLISHED`** (returns the existing
  `etsy_listing_id` + the two offered actions) so the client cannot bypass the confirmation.

### 6. Item creation (no Coach)

A new item is created with the **same inline SEMS editor** as every other entity (ADR-079) — the
owner enters basic data + the **hero photo only**, saves, and the three processors take over.
"Add new item" and ⌘N on Inventory open the inline editor (they no longer route to `/listing-coach`,
which is removed). Additional photos are added during the Quality step.

### 7. Retired schema, routes, code, and activity

**Inventory columns — deprecated (stop reading/writing; left in table, no destructive rebuild):**
`listing_draft_state`, `listing_draft_source`, `listing_export_id`, `listing_approved_at`.

**Tables — retired (no longer written):** `listing_exports`, `listing_imports`,
`listing_publish_previews`.

**Kept columns** (the consolidated core): `listing_title/description/tags/category_path` + strategy
fields, `listing_phase`, `listing_source_hash`, `listing_generated_at`, `listing_quality_json`,
`shot_list_json`, `dimension_annotation_json`, `picture_classifications`, `is_listed`,
`listing_published_at`, and all `etsy_*` publish fields.

**API routes — removed:** `/api/listing-coach/*` (analyze, compose, complete, refine, video),
`/api/inventory/[id]/listing-export`, `/listing-import`, `/listing-approve`, `/listing-reject`,
`/improve-listing`. **Upgraded:** `/api/inventory/[id]/generate-listing-content` (now research +
price + full fields). **Added under inventory:** `/api/inventory/[id]/listing-refine`,
`/api/inventory/[id]/listing-video`. **Re-gated:** `/api/inventory/[id]/publish-to-etsy`
(`listing_ready`; accepts `mode: "create"|"update"`; **409 `ALREADY_PUBLISHED`** on re-publish
without a mode; `update` calls Etsy `updateListing` — needs a new Etsy-client update method). `listing-readiness` and `listing-quality` unchanged in shape.

**Activity actions (ADR-037) — retired:** `listing.coach_complete`, `listing.exported`,
`listing.imported`, `listing.approved`, `listing.rejected`, `listing.draft_saved`. **Kept:**
`listing.ai_generated` (a.k.a. `listing.generated`), `listing.quality_evaluated`,
`listing.shot_list_generated`, `inventory.dimensions_annotated`, `listing.published`,
`listing.publish_failed`.

## Consequences

### Positive

- One obvious path; the new-vs-existing inconsistency disappears.
- The AI recommends the price (the original bug is resolved by design).
- One quality number across the whole app.
- Large reduction in surface area: ~5 fewer API route groups, the Coach UI, two libs, one scorer.

### Negative / risks

- Generate becomes the only authoring path — it must reach Coach parity **before** the Coach is
  deleted (sequencing: port the Coach UI affordances first).
- Publishing re-gate must keep enforcing Etsy field checks (compliance) after dropping `approved`.
- Quality surfaces must compute the deterministic score on demand so never-evaluated items don't
  show blank.

## Notes

- **Cross-references updated (.cursorrules §1b):** ADR-023/068/072 (superseded headers), ADR-081
  (canonical lifecycle; coexistence language removed; publish gate = `listing_ready`; price not a
  prerequisite), ADR-082 (single engine; deterministic fast path; price scoring), ADR-017/002
  (deprecated columns + retired tables), ADR-018 (route catalog), ADR-021 (gates), ADR-020
  (Outstanding on `listing_phase`), ADR-024/030/033 (inline create + Generate UI + clipboard
  paste), ADR-037 (activity actions), ADR-016 (dashboard widget), ADR-034 (config), ADR-070
  (scope), ADR-075 (AI call sites), `documents/ui-design.md`, `.cursorrules` (§5/§6/§13, enums,
  cross-ref map, What's Built/Pending). Retired docs: `documents/LISTING_COACH_SCOPE.md`,
  `system/tips/Listing_Coach_Guide.md`.
- Implementation workstreams: WS-L1 (Generate engine + gate), WS-L2 (inline create), WS-L3 (port
  Coach UI), WS-L4 (quality unification), WS-L5 (publish re-gate + surface), WS-L6 (remove dead
  code). Tracked in `documents/PROGRAM_2026-06-21_major-enhancements.md`.
