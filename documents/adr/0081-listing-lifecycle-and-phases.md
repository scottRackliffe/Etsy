# ADR-081: Listing lifecycle and phases — unified evaluate/generate/quality flow

## Status

Accepted — **made canonical by ADR-085 (2026-06-21):** this lifecycle is now the *single* listing
system. Coexistence with the ADR-023 `listing_draft_state` machine is removed; the publish gate is
`listing_phase = 'listing_ready'`; `sale_revenue` is no longer a generation prerequisite (it is an
AI-recommended output). Edits below reflect this.

## Date

2026-06-21

## Context

Automated/auto-assisted listing creation is the app's flagship value (next to packing and
shipping, listing authoring is the most time-consuming task). Today the AI flow differs between
**new** and **existing** items (e.g. "regenerate" requires a sale price, "new" does not), the
entry points are inconsistent, and there is no single, obvious next action. The owner wants **one
context-aware button** that always shows the correct next step, plus a structured **remediation**
experience that walks the user to exactly what needs fixing, and a way to know when an item's data
has drifted away from its generated listing.

Existing related specs: ADR-023 (listing modes + draft state machine
`draft→generated→approved→published`), ADR-068 (listing quality score), ADR-072 (Listing Coach),
canonical "generation blocked until…" rule in `.cursorrules` §5.

Program reference: `documents/PROGRAM_2026-06-21_major-enhancements.md` workstream **G** (LOCKED:
the quality review is a **new class/phase**, separate from `inventory.status`, which is retained).

## Decision

Introduce a **listing phase** for every inventory item — a separate dimension from
`inventory.status` (Draft/In stock/Listed/Sold/Reserved/Retired, unchanged) — that drives **one
context-aware action button** and two **remediation lists**. The per-item AI flow is **identical
for new and existing items** (same required-data set). The quality review (the sophisticated
rubric) is specified in **ADR-082**; this ADR defines the lifecycle, states, button logic, drift
detection, and remediation model.

---

### 1. New field — `inventory.listing_phase` (additive; ADR-017/ADR-002)

A stored, recomputed column (additive — does not alter `status`). Closed value set:

| `listing_phase` | Meaning |
| --- | --- |
| `needs_data` | One or more **required** generation inputs are missing. |
| `ready_to_generate` | All required inputs present; no current generated listing, **or** item data has drifted since the last generation. |
| `generated` | A listing was generated and is current (no drift); **not yet** quality-evaluated since this generation. |
| `needs_quality_remediation` | Quality evaluated; rubric (ADR-082) found issues; remediation items outstanding. |
| `listing_ready` | Quality re-evaluated with no outstanding issues and score ≥ the firm publish gate (`listing.min_quality_score`, default 85). **This is the publish gate** — the **Publish to Etsy** action becomes available (plus the Etsy field checks in `validatePublishReadiness`; ADR-085 §5). (The AI drives the score toward a ~100 aspiration; 85 is the firm minimum to publish.) |

`listing_phase` is recomputed whenever the item is saved, a picture changes, a listing is
generated, or a quality evaluation completes. It is a separate dimension from `inventory.status`
(Draft/In stock/Listed/Sold/Reserved/Retired, unchanged). The retired `listing_draft_state`
machine (ADR-023, superseded by ADR-085) no longer participates. `listing_phase` is exposed as an
**Inventory list filter** (ADR-029) so the owner can work items by phase.

### 2. Required-data set for generation (unified — new == existing)

The single canonical required set, applied **identically** to new and existing items (this
eliminates the new-vs-existing inconsistency):

- `item_number` (non-empty)
- `description` (non-empty)
- `condition_code` (set)
- **at least one picture** (the hero, `picture_1`)

If any are missing → `listing_phase = needs_data`.

> **Price is NOT required to generate (ADR-085 §2).** The previous `sale_revenue > 0` prerequisite
> is removed: the AI **recommends** the price during Generate (web-search comps), and the owner
> accepts/edits it. Price still feeds the ADR-082 *Pricing & shipping* category, so an unset/low
> price lowers the quality score and emits a remediation item — it never blocks generation.

### 3. One context-aware button

A single primary button on the inventory detail whose label and action follow `listing_phase`:

| Phase | Button label | Action |
| --- | --- | --- |
| `needs_data` | **Evaluate Data** | Show the **data remediation list** (Section 4) — required items, missing ones highlighted, each with a resolution link. |
| `ready_to_generate` | **Generate Listing** | Run the full AI Generate engine (ADR-085 §3) with all item data **+ all non-empty pictures**: web-search **price recommendation**, identification, and **all** listing fields. Save returned fields (incl. recommended `sale_revenue`, editable), set `listing_generated_at` + `listing_source_hash` (Section 5), move to `generated`. |
| `generated` or `listing_ready` (no drift) | **Evaluate Listing Quality** | Run the ADR-082 rubric; produce the **quality remediation list**; set `needs_quality_remediation` or `listing_ready`. |
| `needs_quality_remediation` | **Evaluate Listing Quality** | Re-run rubric after the user addresses items; clears resolved items. |

If data drifts at any time (Section 5), the button reverts to **Generate Listing** (or **Evaluate
Data** if a now-required field became empty).

### 4. Remediation lists (two kinds)

Both are lists of actionable items, each with a **resolution link** that deep-links/scrolls to the
exact form location needing attention (in-page anchor within the inventory detail / SEMS editor,
ADR-079).

1. **Data remediation** (from *Evaluate Data*): the required-data checklist (Section 2) plus any
   high-value recommended fields, with **missing required items highlighted**. When all required
   items are satisfied → phase advances to `ready_to_generate` and the button becomes **Generate
   Listing**.
2. **Quality remediation** (from *Evaluate Listing Quality*, ADR-082): one entry per failing
   field or photo, each with: the **shortcoming** (why it failed the spec), the **mitigation**
   (what to change), a **severity/weight**, and a **resolution link**. When the list is empty and
   the score meets threshold → `listing_ready`; otherwise `needs_quality_remediation`.

Remediation lists are computed on demand by the evaluate endpoints (Section 6); the latest quality
result may be cached for display (see ADR-082).

### 5. Drift detection (`listing_generated_at` + `listing_source_hash`)

To know whether a generated listing still reflects the item:

- On **Generate Listing**, store `listing_generated_at` (timestamp; `listing_published_at` etc.
  already exist) and **`inventory.listing_source_hash`** (new additive column) = a stable hash of
  the **contributing inputs**: the required + listing-relevant item fields (e.g. description,
  condition_code, condition_notes, materials, dimensions, sale_revenue, category/tags) **and** the
  ordered set of picture paths (picture_1..20 + condition_picture_1..5).
- On any later save/picture change, recompute the hash. If it **differs** from
  `listing_source_hash`, the listing has **drifted**:
  - If a required field is now empty → `needs_data`.
  - Else → `ready_to_generate` (button = **Generate Listing**), so quality is never evaluated
    against stale generated content.
- Quality evaluation is only offered when **no drift** (hash matches), guaranteeing the rubric
  judges the current item.

### 6. APIs (added to ADR-018; consolidates/extends ADR-068/023 endpoints)

- `GET /api/inventory/[id]/listing-readiness` — returns `{ listing_phase, button: {label, action},
  required: [{field, present}], data_remediation: [...] }` (existing endpoint, extended).
- `POST /api/inventory/[id]/generate-listing-content` — generate; sets timestamp + hash; returns
  new phase (existing endpoint, behavior unified per Section 2).
- `POST /api/inventory/[id]/listing-quality` — run the ADR-082 rubric (the **single** quality
  engine; the legacy `listing-score` is retired per ADR-085 §4); returns `{ score,
  quality_remediation: [...], listing_phase }` and caches the result in `listing_quality_json`.
- `POST /api/inventory/[id]/publish-to-etsy` — available at `listing_ready`; gated on
  `listing_phase = 'listing_ready'` + `validatePublishReadiness` Etsy field checks (ADR-085 §5).
- `POST /api/inventory/[id]/listing-refine` and `/listing-video` — per-field/global AI refine and
  listing-video generation, ported from the former Coach (ADR-085 §3).

Activity (ADR-037): `listing.ai_generated` (exists), `listing.quality_evaluated`
(`detail_json: { score, issue_count }`), and `listing.published`.

---

## Consequences

- **Positive**
  - One obvious next action at every step; identical for new and existing items.
  - Drift detection prevents quality-evaluating stale listings and prevents publishing items whose
    data changed after generation.
  - `listing_phase` gives a powerful Inventory filter for working the listing pipeline.
- **Negative**
  - Two additive columns (`listing_phase`, `listing_source_hash`) + recompute logic on mutations.
  - `status` and `listing_phase` are distinct dimensions and must be clearly explained in UI.

## Notes

- `listing_phase` is **derived-but-stored** for filter performance; it must be recomputed on every
  relevant mutation (save, picture change, generate, quality eval) to avoid staleness.
- Publish gating (ADR-085 §5): publish is allowed only at `listing_phase = 'listing_ready'` plus
  the Etsy field checks in `validatePublishReadiness`. The retired `listing_draft_state =
  'approved'` gate no longer applies.
- **Cross-references (.cursorrules §1b):** ADR-085 (authoritative single lifecycle), ADR-017/002
  (`listing_phase`, `listing_source_hash` columns; deprecated draft-state columns), ADR-082 (single
  quality engine), ADR-018 (endpoints), ADR-037 (`listing.quality_evaluated`), ADR-030 (detail
  panel button), ADR-020 (Outstanding on `listing_phase`), `.cursorrules` (enum + columns).
- The **rubric** that powers *Evaluate Listing Quality* (per-field and per-photo specifications,
  weights, firm 85 gate with a ~100 aspiration) is **ADR-082**, populated from
  `documents/research/2026-06-21_etsy-listing-best-practices.md`.
