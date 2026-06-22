# ADR-082: Listing quality rubric — per-field and per-photo specifications

## Status

Accepted

## Date

2026-06-21

## Context

ADR-081 defines the listing lifecycle and the **Evaluate Listing Quality** action. That action
needs a **rigorous, explicit rubric**: every listing field and **every photo** must be judged
against concrete specifications, and each failure must produce a remediation item (shortcoming +
mitigation). The owner wants this to be sophisticated and aligned with Etsy best practices, with a
**target around 98%** (pass threshold remains 85 per ADR-068). The simpler ADR-068 score is not
detailed enough for per-photo "is this artwork on point?" judgments.

This ADR is the canonical **rubric** — and, per **ADR-085**, the app's **single** quality engine.
Its specifications are grounded in documented Etsy guidance and listing best practices compiled in
`documents/research/2026-06-21_etsy-listing-best-practices.md` (citations there). It **supersedes
ADR-068** (`computeListingScore` is retired). To serve the fast surfaces ADR-068 used to feed, this
rubric exposes a **deterministic fast path** (§10) — no AI, no cache required — used by the
Inventory list quality column/sort, the Outstanding low-quality list, the dashboard low-quality
widget (ADR-016 §7), and the inventory aging report. The full AI-vision path runs on Evaluate
Listing Quality and is cached in `listing_quality_json`.

Program reference: `documents/PROGRAM_2026-06-21_major-enhancements.md` workstream **G/D**.

## Decision

Define a **weighted, criterion-based rubric (0–100)** evaluated by deterministic checks (text
fields, counts, presence) **plus AI vision** (per-photo "on point" judgment). Each unmet criterion
emits a **quality-remediation item** consumed by ADR-081 §4. Pass = **85**; target = **98**.

---

### 1. Category weights (sum = 100)

| Category | Weight | Evaluator |
| --- | --- | --- |
| Photos | **40** | AI vision + counts |
| Title | 15 | deterministic + AI |
| Description | 15 | deterministic + AI |
| Tags | 10 | deterministic |
| Category & attributes | 10 | deterministic |
| Condition disclosure | 5 | deterministic + AI |
| Pricing & shipping | 5 | deterministic |

Photos dominate because they are the single biggest driver of conversion and are the owner's
primary concern. Each category's points are split among its criteria below; a criterion's points
are awarded fully, partially (where noted), or zero.

### 2. Title (15) — aligned to Etsy's Aug-2025 title guidance (research §1)

> **Important:** Etsy's official 2025 guidance **reversed** the old "use all 140 characters"
> approach. The rubric rewards **concise, noun-first, naturally-readable** titles. (Evidence:
> research doc §1, sources [E2][E4][T1].)

| Criterion | Pts | Pass spec |
| --- | --- | --- |
| Noun-first | 3 | The **item type/noun** (e.g. "Teapot", "Quilt") appears **first**, stated once |
| Key descriptors up front | 4 | Top **2–3 objective descriptors** (color, material, size, **era/age**, maker/style) within the **first ~70 characters** (mobile-visible zone) |
| Concise & readable | 3 | **≤ 15 words** and **≤ ~140 chars**; reads as a human phrase; **no ALL-CAPS**, ≤2 commas |
| No banned content | 3 | **No subjective words** ("beautiful"/"perfect"), **no gifting/aspirational** ("gift for her"), **no price/shipping/sale** wording (Etsy badges these) |
| No repeated words | 2 | No word repeated in the title; not a comma-soup of single keywords |

### 3. Description (15)

| Criterion | Pts | Pass spec |
| --- | --- | --- |
| Strong opening hook | 4 | **First ~160 chars** state what the item is + main keyword + a reason to buy (this is the Etsy search snippet **and** the Google meta description). **Not** a generic "Thanks for visiting my shop!" opener |
| Required sections present | 5 | Overview, **dimensions/measurements**, **materials**, **era/age + maker**, **condition + flaws**, notable features, shipping/handling note (+ provenance/story is recommended for vintage) |
| Length/detail | 2 | **~250–400 words** recommended (≥150 minimum; >500 rarely helps) |
| Scannability | 2 | Short paragraphs / **bullets**; mobile-friendly; not one giant block |
| Natural keyword usage | 2 | Relevant keywords used naturally (not stuffed); **does not copy the title in** or dump the 13 tags at the bottom |

### 4. Tags (10)

| Criterion | Pts | Pass spec |
| --- | --- | --- |
| Count | 4 | All **13** tags used (each ≤20 chars) |
| Long-tail multi-word | 3 | Majority are 2–3 word phrases (not single words) |
| No redundancy / no duplication | 2 | No repeated words across tags; **does not duplicate category/attributes/materials** (those already act as tags); for vintage, include **era variants** (e.g. "60s", "1960s") plus color/style/material |
| Relevance | 1 | All tags clearly relevant to the item |

### 5. Category & attributes (10)

| Criterion | Pts | Pass spec |
| --- | --- | --- |
| Specific taxonomy | 3 | Most-specific applicable Etsy taxonomy node selected (`etsy_taxonomy_id` set); **correct top category — Vintage = 20+ years old** |
| Vintage attributes | 3 | `etsy_when_made` set (and `etsy_who_made`) per ADR-017 |
| Item attributes complete | 4 | **All** applicable attributes filled (cross-platform: completeness is a top ranking/filter factor): material **from the official list (not "other")**, color, style, occasion |

### 6. Condition disclosure (5)

| Criterion | Pts | Pass spec |
| --- | --- | --- |
| Condition code | 1 | `condition_code` set |
| Measurable flaw notes | 3 | If `has_condition_issue`, `condition_notes` describe each flaw with **measurable, objective language** (type + size + location, e.g. "2 mm chip on rim at 3 o'clock") — **not** bare adjectives like "good condition" |
| Condition photos | 1 | If issues noted, ≥1 `condition_picture_*` clearly shows each flaw (with scale) |

### 7. Pricing & shipping (5)

| Criterion | Pts | Pass spec |
| --- | --- | --- |
| Price set & plausible | 2 | `sale_revenue` > 0 and ≥ cost basis (non-negative margin) |
| Shipping configured | 2 | Shipping profile/cost present; package dimensions set (ADR-080) |
| Processing/handling | 1 | Handling/processing info present |

### 8. Photos (40) — per-photo specifications (the rigorous part)

Photos are scored in two parts:

**8a. Coverage (16 pts)** — the right shots exist (cross-checked against the shot list, ADR-083):

| Shot (ADR-072 type) | Pts | Required? |
| --- | --- | --- |
| Hero (`hero`) | 4 | Required |
| ≥2 alternate angles incl. **back / underside** (`angle`/`underside`) | 3 | Required |
| Detail / close-up (`detail`) | 2 | Required |
| Scale / in-context (`scale`/`lifestyle`) | 2 | Required |
| Measurement (`measurement`) | 2 | Required (see ADR-084) |
| Backstamp / maker's mark (`backstamp`) | 1 | **Required if the item bears any mark/signature/label** (cross-platform marketplaces mandate a mark photo) |
| Condition / imperfection (`imperfection`) | 1 | Required **if** condition issues noted; show each flaw with a scale reference |
| Count ≥ 5 (up to 10; use all 10 ideal) | 1 | Recommended |

**8b. Per-photo quality (24 pts)** — **AI vision** judges EACH photo against the spec for its
intended `shot_type`. Every photo is scored on the following dimensions; the category points are
the average across evaluated photos, scaled to 24:

> **Implementation (WS-G3):** `src/lib/listing-photo-vision.ts` → `evaluatePhotoQuality()` evaluates up
> to 10 main photos via the OpenAI Responses API (focus, lighting, background, framing, color), folds a
> deterministic Sharp resolution gate (long edge < 1000px caps that photo at 50%), and emits per-photo
> remediation keyed by `picture_{slot}`. It **degrades gracefully**: on missing AI config or any
> AI/parse/file error it returns `null` and the rubric falls back to the provisional sub-score
> (`photo_ai_evaluated:false`). AI calls are logged as `responses.create/listing-photo-quality` (ADR-075).

| Quality dimension | Pass spec |
| --- | --- |
| **On-point for purpose** | The photo actually shows what its shot type requires (e.g. a `backstamp` photo clearly shows the underside mark; a `hero` shows the whole item front-on). If not on point → remediation with the specific shortcoming. |
| **Sharp focus** | Subject is in focus; not blurry/soft. |
| **Lighting** | Even, **natural/diffused** light; no blown-out highlights or heavy shadows hiding detail; **no color-distorting filters** (accurate color for vintage). |
| **Background** | Clean, **white/neutral**, uncluttered; consistent across the listing; not distracting. |
| **Fill of frame** | Item fills roughly **70–85%** of the frame, **centered with a safe-zone margin** so Etsy's 1:1 / 4:3 / 3:4 auto-crop never clips the subject. |
| **Resolution** | **Shortest side ≥ 2000px (3000px recommended)** — required for Etsy zoom; Etsy upscales smaller images poorly. JPEG ~90%, sRGB. |
| **Framing/orientation** | Hero is **square or 4:3**, subject centered/level; consistent orientation across all photos. |

Each failing photo dimension generates a remediation item naming the **photo slot**, the
**shortcoming**, and the **mitigation** (e.g. "Picture 3 (backstamp): mark is out of focus —
retake closer with steady focus on the stamp"). Video, if present, earns a small bonus toward 8a
coverage but is not required.

### 9. Output and remediation

`POST /api/inventory/[id]/listing-quality` (ADR-081 §6) returns:

```json
{
  "score": 0,                       // 0–100 weighted sum
  "passed": false,                  // score >= threshold (85 default)
  "target": 98,
  "categories": [
    { "name": "photos", "earned": 0, "possible": 40 }
  ],
  "quality_remediation": [
    {
      "category": "photos",
      "ref": "picture_3",          // field name or picture slot
      "shortcoming": "Backstamp photo is out of focus.",
      "mitigation": "Retake the underside mark sharply; fill the frame with the stamp.",
      "weight": 3,
      "resolution_link": "/inventory?itemId=42#picture-3"
    }
  ],
  "evaluated_at": "2026-06-21T12:00:00Z"
}
```

- Sorted by `weight` descending (highest-impact fixes first).
- `resolution_link` deep-links to the exact field/slot (ADR-081 §4, ADR-035, anchors within the
  SEMS editor, ADR-079).
- The latest result may be cached on the item for display until the next data change (ADR-081
  drift logic invalidates it).

### 10. Evaluator notes

- **Deterministic fast path** (lengths, counts, presence, taxonomy/attribute set, price) runs
  server-side with no AI cost and **no cache required**. This is the single scorer for the fast
  surfaces (Inventory list quality column/sort, Outstanding low-quality, dashboard widget, aging
  report) — there is no longer a separate ADR-068 score (ADR-085 §4). On these surfaces the AI
  photo sub-score (§8b) uses the provisional fallback unless a cached full evaluation exists.
- **Full path = deterministic + AI vision** (§8b per-photo "on point + quality"); **all non-empty
  pictures are sent** (unchanged invariant). Runs on Evaluate Listing Quality, result cached in
  `listing_quality_json`. Each AI call is logged via ADR-075.
- Threshold is read from the single setting key `listing.min_quality_score` (default **85**;
  `listing.quality_threshold` is retired — WS-THRESH). The **target 98** is advisory (shown as a
  goal). The **publish gate** is `listing_phase = 'listing_ready'` (= rubric passed, no blocking
  remediation) plus the Etsy field checks (ADR-085 §5 / ADR-081 §1); it is no longer ADR-023.

---

## Consequences

- **Positive**
  - A concrete, explainable quality definition; every point is traceable to a checkable spec.
  - Per-photo AI judgment gives the rigorous "is the artwork on point?" review the owner wants.
  - Drives the remediation list and the `listing_phase` machine (ADR-081).
- **Negative**
  - Heavier than ADR-068; multiple AI vision calls per evaluation (cost/latency, logged).
  - Photo judgments are model-dependent; thresholds may need tuning after real use.

## Notes

- **Reconciliation (done 2026-06-21):** the rubric tables above have been **validated and revised
  against** `documents/research/2026-06-21_etsy-listing-best-practices.md` (Etsy Seller Handbook +
  eBay/Chairish/1stDibs + general e-commerce). Key folded-in changes: **Title** rewritten to Etsy's
  Aug-2025 guidance (noun-first, ≤15 words, descriptors in first ~70 chars, no subjective/gifting/
  price words, no repeats — reversing "use all 140"); **Description** opening hook = first ~160
  chars (Etsy snippet + Google meta), ~250–400 words; **Tags** no category/attribute duplication +
  era variants; **Attributes** completeness emphasized + material from official list; **Condition**
  requires measurable flaw language; **Photos** resolution = **shortest side ≥2000px (3000 rec.)**,
  hero fills ~70–85% centered for auto-crop, white/neutral bg, maker's-mark photo required for
  marked items, back/underside coverage. The research doc is evidence; this ADR is the rule.
- **Cross-references (.cursorrules §1b):** ADR-085 (single quality engine; deterministic fast path
  replaces the retired ADR-068 score), ADR-068 (superseded; `computeListingScore` retired),
  ADR-081 (consumes remediation + phase; publish gate = `listing_ready`), ADR-083 (shot-list
  coverage), ADR-084 (measurement photo), ADR-016 (dashboard widget reads this rubric), ADR-018
  (endpoint), ADR-075 (AI usage), `.cursorrules` (quality threshold + rubric reference).
