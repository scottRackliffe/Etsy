# ADR-089: Listing remediation cycle — user-observed scoring ↔ AI-mitigation loop

## Status

Accepted. **Implemented 2026-06-24 (WP5)** — endpoint + UI + `ai.premium_model` setting built and
type-checked; live behaviour (real AI passes) pending an `npm run dev` smoke-test.

## Date

2026-06-23

**Scope:** how a listing is improved from "generated" toward the quality gate. Owns the **loop** and
its **controls** only. Model-tier choice → ADR-086. Score/remediation data → ADR-082. Lifecycle
phases → ADR-081/085. Photo shot-list → ADR-083.

## Context

After a listing is generated (Phase 1), it must reach the **85 quality gate** (ADR-082/085). The
owner's intent: the **scoring engine names what is wrong and the AI fixes it**, with the **user
watching each pass** to confirm the score is actually improving (preventing runaway/no-progress
loops) and to learn where a more capable model becomes necessary. The deterministic rubric already
emits a structured remediation list (`{ ref, shortcoming, mitigation }` per item), so the AI has a
ready-made worklist.

## Decision

**Entry (Phase 1 → cycle).** The user supplies the minimal seed inputs (defined in
[ADR-085 §2](0085-unified-listing-lifecycle.md)) and the AI generates the listing and a first score,
which emits both the shortcomings list and a per-item **photo shot-list** (incl. a scale photo,
ADR-083). The cycle below then drives that score toward the gate.

**The cycle (one pass).**
1. Score the listing — deterministic ADR-082 rubric → remediation list.
2. Partition the remediation items: **AI-fixable** (listing output fields the AI can rewrite) vs
   **user-action** (the required photos from the shot-list, or data only the user can provide).
3. The AI fixes the AI-fixable items **driven by the rubric's `mitigation` text** (not ad-hoc
   instructions); re-score.
4. Surface the result to the user: new score, the **change vs. the previous score**, and the
   remaining items (AI-fixable + user-action).

**User controls (one choice per cycle — "learning mode").** After each pass the user picks one of:
- **Stop cycling** — halt and keep the current listing.
- **Cycle again** — run another pass at the **current** model tier.
- **Advance AI** — escalate to a more capable tier (per ADR-086) and continue.

**Why user-observed.** Initially a human watches each pass so an unproductive loop can't run away,
and **the moment the user reaches for "Advance AI" is the evidence** for where the standard tier
stops being adequate. That recorded evidence is what later allows this to be **automated** (auto-cycle
with stall→escalate) from real data rather than a guess — consistent with ADR-086's
cheapest-first / escalate-on-proven-inadequacy principle.

**Reaching the gate vs. going beyond.** The climb to 85 normally runs on the **standard** tier;
**Advance AI** brings in a premium tier when evidence shows it's needed (which may be before or after
85). At ≥ 85 the user may instead finish any user-only items and publish, or keep cycling to push the
score higher (ADR-085 publish gate; ADR-086 §1a for tier intent).

## Consequences

- **Positive:** the cheap, deterministic score makes each measurement free, so the loop is low-cost;
  the human-in-the-loop prevents runaway spend and produces the evidence to automate later; the AI
  works from the rubric's own remediation text, so "fix what the scoring engine found" is literal.
- **Cost/limits:** each pass is a real AI call; the user (for now) is the stop condition. A later
  automated mode will need an explicit pass cap + stall definition (configurable), informed by the
  evidence gathered here.

## Implementation

**Endpoint:** `POST /api/inventory/[id]/listing-remediation-cycle` — runs exactly **one** pass.
Body: `{ tier?: "standard" | "premium" }` (default `standard`). Gated to a current, generated
listing (same readiness check as `listing-quality`: blocked when phase is `needs_data` /
`ready_to_generate`).

**One pass:**
1. Score the item with the deterministic ADR-082 rubric (no photo-AI call — free; a text refine does
   not change the photo sub-score). Record `previous_score`.
2. Partition the remediation list by `ref`:
   - **AI-fixable** = `{ listing_title, listing_description, listing_tags, sale_revenue }` — the
     listing text/price the AI can rewrite.
   - **User-action** = everything else (`pictures`, `picture_1`, `condition_pictures`, `dimensions`,
     `materials`, `etsy_taxonomy_id`, `etsy_when_made`, `etsy_who_made`, `condition_code`,
     `condition_notes`, `shipping`) — surfaced to the user, never auto-fixed.
   - If no AI-fixable items remain → return `no_ai_action: true` and hand back the user-action list.
3. Resolve the model (ADR-086 §1a): `standard` → `ai.model`; `premium` → **`ai.premium_model`** when
   configured (else falls back to `ai.model`, reported via `premium_configured`).
4. One **global `refineListing`** call at the resolved model, instructed with the scoring engine's own
   `shortcoming` + `mitigation` text for the AI-fixable items (not ad-hoc).
5. **Apply only listing OUTPUT fields (+ price)** — whitelist: the `listing_*` fields and
   `sale_price → sale_revenue`. **No ADR-081 `HASH_FIELDS` are ever written** (e.g. `condition_notes`,
   `materials`, dimensions are excluded), so a cycle improves the listing **in place without causing
   drift**.
6. Re-score, persist `listing_quality_json` + recompute the phase (mirrors `listing-quality`), log
   `listing.remediation_cycle`.

**Response:** `{ previous_score, new_score, delta, improved, passed, model_used, premium_configured,
remediation, user_action_items, applied_fields }` — everything the UI needs for the score-delta
display and the **Stop / Cycle again (tier=standard) / Advance AI (tier=premium)** controls.

**New setting:** `ai.premium_model` (ADR-034 / ADR-086) — the more-capable tier for "Advance AI";
blank = no premium configured (Advance AI runs at standard until set).

## Notes

- Cross-refs: ADR-081/085 (lifecycle & phases), ADR-082 (quality rubric + remediation list),
  ADR-083 (photo shot-list), ADR-086 (model tiers & cost strategy), ADR-034 (`ai.premium_model`).
- The `model?` override on `callAiJson` / `RefineListingInput` (the escalation hook) is part of this
  build.
