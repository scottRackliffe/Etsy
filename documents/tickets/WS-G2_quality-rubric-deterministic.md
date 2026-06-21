# Ticket WS-G2 — Listing quality rubric (deterministic engine) + listing-quality endpoint

| Field | Value |
|-------|-------|
| Workstream | **G (part 2 of 3)** — the ADR-082 rubric, **deterministic criteria only** (no AI vision yet). |
| Source ADR(s) | **ADR-082** (authoritative rubric). Context: ADR-081 (consumes phase + remediation), ADR-068 (light score retained for list column), ADR-035 (resolution links), ADR-018 (endpoint), ADR-017 (fields). Evidence: `documents/research/2026-06-21_etsy-listing-best-practices.md`. |
| Recommended model | **T3 — Opus** *(or strong Sonnet)*. Lots of precise, spec-driven scoring logic. |
| Complexity | Large |
| Risk | Low–Medium (pure scoring lib + endpoint body swap; no schema change) |
| Sequencing | **After WS-G1.** Replaces the stub body of `listing-quality` from G1. **Before WS-G3** (G3 adds the Photos §8b vision sub-score into the structure this ticket creates). |

---

## Goal

Implement the **ADR-082 weighted rubric (0–100)** as a deterministic engine and wire it into
`POST /api/inventory/[id]/listing-quality` (the endpoint G1 stubbed). Produce a **quality-remediation
list** (one entry per failing criterion) consumed by the ADR-081 phase machine and the detail panel.

**Scope boundary:** implement **all categories except the per-photo AI judgment (§8b)**. Photos §8a
**Coverage (16 pts)** is deterministic and **is** implemented here. Photos §8b **Per-photo quality
(24 pts)** is implemented in **WS-G3**; in this ticket, award §8b provisionally (see "Photos interim"
below) and mark it clearly so G3 can slot in the vision score without restructuring.

## Locked decisions (do not deviate)

- **Category weights (sum 100)** per ADR-082 §1: Photos **40** (Coverage 16 + Per-photo 24), Title
  15, Description 15, Tags 10, Category & attributes 10, Condition 5, Pricing & shipping 5.
- **Pass = `listing.min_quality_score`, default 85** (canonical per ADR-068/081/082). Read via the
  shared `getMinQualityScore()` helper from **WS-THRESH**; fall back to
  `getSetting("listing.min_quality_score") ?? "85"` if not yet merged. **Target = 98** is **advisory**
  (returned as `target`, shown as a goal). Publish gate is unchanged (ADR-023).
- **Deterministic checks only** here — no OpenAI calls. (Title/description "AI polish" hints noted in
  ADR-082 §10 belong to G3's optional pass; do not add AI here.)
- **Shot types** come from `inventory.picture_classifications` (ADR-072 taxonomy:
  `hero|angle|detail|backstamp|scale|imperfection|underside|grouping|lifestyle|measurement|extra`).
  Use it for §8a coverage. If classifications are absent, fall back to counts only and emit a
  remediation item recommending classification.
- **Output shape is the ADR-082 §9 JSON** exactly (`score, passed, target, categories[],
  quality_remediation[], evaluated_at`). Remediation **sorted by `weight` desc**.
- **Resolution links** = `/inventory?itemId=<id>#<anchor>` (ADR-082 §9 / ADR-035).
- **Caching:** persist the latest result JSON on the item for display (see "Persistence"); ADR-081
  drift invalidates it (already handled by phase recompute on save).

## Files (create/edit only these)

1. `src/lib/listing-rubric.ts` — **new**: the engine. `evaluateListingQuality(item, opts)` returns
   the ADR-082 §9 object. Pure/deterministic; accepts an optional injected `photoQuality` sub-result
   so **WS-G3** can pass in the vision score without changing this file's signature.
2. `src/lib/listing-rubric-specs.ts` — **new (optional but recommended)**: the criterion tables
   (points, ids, anchors, pass-spec predicates) transcribed from ADR-082 §2–§8a, kept data-driven.
3. `src/app/api/inventory/[id]/listing-quality/route.ts` — replace the G1 stub body with a call to
   `evaluateListingQuality`; keep the **drift block** and the phase-setting + `listing.quality_evaluated`
   activity log from G1. Persist the result (Persistence below).
4. `src/lib/listing-phase.ts` — set phase from the rubric result: `passed && no remediation` →
   `listing_ready`, else `needs_quality_remediation` (extend the helper G1 added; keep it the single
   source of phase truth).
5. **Persistence** — add one additive column `listing_quality_json TEXT` to `inventory`:
   `migrations/014_listing_quality_cache.sql` + bootstrap in `src/lib/sqlite.ts`. Store the last
   result; the readiness/quality GET can return it for display.
6. `src/components/inventory/InventoryDetailPanel.tsx` — render the **quality-remediation list**
   (grouped by category, each row: shortcoming · mitigation · weight chip · resolution link) and a
   category score breakdown bar. Reuse the G1 remediation-list styling.
7. **Docs:** `documents/adr/0018-api-surface-endpoints.md` (finalize listing-quality response),
   `documents/adr/0068-listing-quality-score.md` (note: superseded as authoritative by ADR-082;
   light score retained for the list column), `.cursorrules` (add `listing_quality_json` column +
   `listing.quality_threshold`/target-98 note pointing at `listing.min_quality_score`).

> Anything outside this list → **STOP and ask**.

## Criterion implementation notes (transcribe ADR-082 precisely)

Implement each criterion as a predicate that returns `{ earned, possible, remediation? }`. Summary of
the deterministic specs (see ADR-082 for exact wording — copy the shortcoming/mitigation text from
there):

- **Title (15)** §2: noun-first (3), key descriptors in first ~70 chars (4), concise & readable
  (≤15 words, ≤~140 chars, no ALL-CAPS, ≤2 commas) (3), no banned content (subjective/gifting/price
  words) (3), no repeated words (2). *(Deterministic heuristics; the optional AI polish is G3.)*
- **Description (15)** §3: opening hook in first ~160 chars + not a generic "thanks for visiting"
  (4), required sections present — overview, dimensions, materials, era/maker, condition+flaws,
  features, shipping (5), length ~250–400 words / ≥150 (2), scannability (bullets/short paras) (2),
  natural keywords / not title-copy / not tag-dump (2).
- **Tags (10)** §4: 13 tags each ≤20 chars (4), majority multi-word (3), no redundancy / no
  duplication of category/attrs/materials, era variants for vintage (2), relevance (1 — basic).
- **Category & attributes (10)** §5: specific taxonomy `etsy_taxonomy_id` set (3), `etsy_when_made`
  (+`etsy_who_made`) set (3), item attributes/`materials` complete & not "other" (4).
- **Condition (5)** §6: `condition_code` set (1), measurable flaw notes when `has_condition_issue`
  (3), ≥1 `condition_picture_*` when issues noted (1).
- **Pricing & shipping (5)** §7: `sale_revenue` > 0 and ≥ cost basis (2), shipping/package dims
  present (2), handling/processing info (1).
- **Photos §8a Coverage (16)**: hero present (4), ≥2 alternate angles incl back/underside (3),
  detail (2), scale/lifestyle (2), measurement (2), backstamp **if** the item bears a mark (1),
  imperfection **if** condition issues noted (1), count ≥5 (1). Use `picture_classifications`.

### Photos §8b interim (24 pts) — until WS-G3
Award §8b as a **provisional flat allocation** based on photo count/presence (e.g. proportional to
non-empty pictures up to a cap), and add a single remediation note: *"Per-photo AI quality review
pending (WS-G3)."* Keep the result object's `categories[]` entry for photos split so G3 can replace
the 24-pt sub-score cleanly. **Document this interim clearly in the route + ADR note.**

### Persistence
On each evaluation, `UPDATE inventory SET listing_quality_json = ?` with the §9 result. Phase recompute
on later edits (G1) leaves the JSON but the phase flips to `ready_to_generate` on drift; the panel
should treat cached JSON as stale when phase ≠ `generated|needs_quality_remediation|listing_ready`.

## Acceptance criteria
- [ ] `evaluateListingQuality(item)` returns the **exact ADR-082 §9 shape** with `categories[]`
      summing to the right possibles (Photos 40 / Title 15 / Desc 15 / Tags 10 / Cat 10 / Cond 5 /
      Price 5) and `score` 0–100.
- [ ] Each unmet criterion emits a remediation item with `category, ref, shortcoming, mitigation,
      weight, resolution_link`; list is **sorted by weight desc**.
- [ ] `POST /api/inventory/[id]/listing-quality` returns the rubric result, **blocks on drift**
      (from G1), sets phase `listing_ready` vs `needs_quality_remediation`, logs
      `listing.quality_evaluated` with `{score, issue_count}`, and persists `listing_quality_json`.
- [ ] Migration 014 + `sqlite.ts` bootstrap add `listing_quality_json`; `npm run build` clean.
- [ ] Detail panel shows the category breakdown + remediation list with working resolution links.
- [ ] Photos §8b is awarded provisionally and **explicitly flagged** as pending WS-G3 (one note +
      ADR/route comment), with the result structure ready for the vision sub-score.
- [ ] Pass threshold reads `listing.min_quality_score` (default **85**); `target: 98` returned as
      advisory; publish gate unchanged. Light ADR-068 score still powers the inventory list column.
- [ ] Docs updated (ADR-018/068, `.cursorrules`); cross-refs checked (`.cursorrules` §1b). No AI calls
      added in this ticket; no hardcoded hex; standard error envelope.

## Out of scope
- **All AI/OpenAI usage** (per-photo vision, AI title/desc polish) → **WS-G3**.
- Changing the light list-column score (ADR-068) — leave it.
- Listing Coach integration → follow-up.

## Escalation triggers (STOP and ask)
- A criterion's deterministic heuristic is genuinely ambiguous (e.g. "noun-first" detection) beyond a
  reasonable rule — implement a documented best-effort and flag it, don't block, unless it materially
  changes scoring.
- `picture_classifications` format differs from the ADR-072 taxonomy assumption.

## How to verify (manual)
1. `npm run build` → start. Generate a listing (G1), then **Evaluate Listing Quality**.
2. Confirm the score, the category breakdown, and that a deliberately bad title (ALL-CAPS / "gift for
   her" / "beautiful") loses the right points with the matching remediation text.
3. Fix the flagged items → re-evaluate → score rises, resolved items disappear; when all deterministic
   criteria pass and score ≥ threshold, phase becomes `listing_ready` (Photos §8b note may remain).

---

## Kickoff prompt

> Implement ticket `documents/tickets/WS-G2_quality-rubric-deterministic.md`. Read that ticket and
> **ADR-082** (`documents/adr/0082-listing-quality-rubric.md`) in full first (and skim the cited
> research doc), and follow `.cursor/rules/implementer.mdc`. This is part 2 of 3 for workstream G and
> depends on WS-G1 being merged. Implement the **deterministic** rubric only — **no OpenAI/AI calls**
> (per-photo vision is WS-G3); award Photos §8b provisionally and flag it. Use the
> `listing.min_quality_score` setting for the pass threshold and return `target: 98` as advisory.
> Only touch the files the ticket lists, update the listed docs, then run `npm run build`. Report what
> you changed and confirm each acceptance-criteria checkbox. STOP and ask me if you hit an escalation
> trigger.
