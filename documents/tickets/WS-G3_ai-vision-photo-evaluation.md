# Ticket WS-G3 — AI-vision per-photo quality evaluation (Photos §8b)

| Field | Value |
|-------|-------|
| Workstream | **G (part 3 of 3)** — the rigorous per-photo "is this shot on point?" judgment. |
| Source ADR(s) | **ADR-082 §8b + §10** (authoritative). Context: ADR-081 (phase/remediation), ADR-072 (shot taxonomy), ADR-083 (shot list — future), ADR-084 (measurement photo — future), ADR-075 (AI usage logging), ADR-023 (all pictures sent), ADR-018 (endpoint). |
| Recommended model | **T3 — Opus** *(or strong Sonnet)*. Vision prompt design + robust JSON parsing + cost/latency handling. |
| Complexity | Large |
| Risk | Medium–High (model-dependent judgments; cost/latency; needs graceful degradation) |
| Sequencing | **After WS-G2.** Replaces the provisional Photos §8b (24 pts) sub-score with a real AI-vision score, slotting into the `categories[]`/remediation structure G2 built. |

---

## Goal

Implement ADR-082 **§8b Per-photo quality (24 pts)**: send **all non-empty pictures** to an AI vision
model and judge **each photo** against the spec for its intended `shot_type`, producing per-photo
remediation items (slot + shortcoming + mitigation). Fold the resulting 24-pt sub-score into the
Photos category so the total rubric (G2) becomes complete.

## Locked decisions (do not deviate)

- **Reuse the existing vision plumbing** in `src/lib/listing-generator.ts`: `toImageUrl(reference)`
  (base64 data URL), the `input_image` content shape, `getOpenAiClient()` / `getAiConfig()`, and
  **`logApiCall("openai", ...)`** (ADR-075). Do **not** introduce a new AI client or bypass usage
  logging.
- **All non-empty pictures sent** (picture_1..20 + condition_picture_1..5), consistent with ADR-023.
- **Per-photo dimensions** (ADR-082 §8b table): on-point-for-purpose, sharp focus, lighting,
  background, fill-of-frame, resolution, framing/orientation. The 24 pts = average across evaluated
  photos, scaled to 24 (ADR-082 §8b).
- **Shot type** per photo from `inventory.picture_classifications` (ADR-072 taxonomy). If a photo is
  unclassified, judge it as a generic product photo and add a remediation note recommending
  classification (do not crash).
- **Resolution check is deterministic** where possible: read pixel dimensions from the file (the
  picture pipeline uses Sharp; reuse it) to verify "shortest side ≥ 2000px (3000 rec.)" rather than
  asking the model to guess. Vision handles the subjective dimensions (on-point, lighting, bg, etc.).
- **Graceful degradation:** if AI is not configured or the vision call fails, return the **G2
  deterministic score with §8b omitted** plus a clear remediation note ("Per-photo AI review
  unavailable — configure AI / retry"), and a flag `photo_ai_evaluated: false`. **Never 500** the
  whole evaluation because vision failed.
- **Threshold/target** unchanged from G2 (`listing.min_quality_score` default 85; target 98 advisory).

## Files (create/edit only these)

1. `src/lib/listing-photo-vision.ts` — **new**: `evaluatePhotosWithVision(item)` →
   `{ earned /* 0..24 */, per_photo: [{ slot, shot_type, dimensions: {...}, issues: [...] }],
   remediation: [...], photo_ai_evaluated: boolean }`. Builds the image content, calls the model with
   a strict-JSON prompt encoding the §8b dimensions per shot type, parses + validates, logs via
   `logApiCall`. Include the deterministic resolution check (Sharp) here.
2. `src/lib/listing-rubric.ts` — accept the injected `photoQuality` sub-result (the seam G2 left) and
   replace the provisional §8b 24 pts with `evaluatePhotosWithVision` output; merge its remediation
   into the Photos category. **No structural change** to the §9 output shape.
3. `src/app/api/inventory/[id]/listing-quality/route.ts` — call `evaluatePhotosWithVision` (await) and
   pass it into `evaluateListingQuality`; keep G1 drift-block + phase-set + activity log + persistence.
   Surface `photo_ai_evaluated` in the response.
4. `src/components/inventory/InventoryDetailPanel.tsx` — show per-photo remediation grouped under
   Photos (slot-labeled, e.g. "Picture 3 (backstamp): out of focus — retake…"), and a subtle
   "AI photo review unavailable" state when `photo_ai_evaluated` is false.
5. **Docs:** `documents/adr/0082-listing-quality-rubric.md` (mark §8b implemented; record the model +
   resolution-check approach in §10 notes), `documents/adr/0018-api-surface-endpoints.md`
   (`photo_ai_evaluated` field), `.cursorrules` (note: per-photo vision uses the ADR-075 usage log).

> Anything outside this list → **STOP and ask**.

## Prompt / parsing notes

- One vision call with all images is preferred for cost; if the model conflates photos, fall back to
  per-photo calls (document whichever you ship). Each image should be labeled with its slot + declared
  `shot_type` in the accompanying text so the model maps judgments to slots.
- Demand **strict JSON**: `{ photos: [{ slot, on_point, focus, lighting, background, fill, framing,
  issues: [{ dimension, shortcoming, mitigation }] }] }`. Reuse the `cleanJsonResponse` pattern from
  `listing-generator.ts`. Validate slot names against the actual non-empty slots; ignore unknowns.
- Map each `issues[]` entry to a §9 remediation item: `category:"photos"`, `ref:"picture_<n>"` (or
  `condition_picture_<n>`), `shortcoming`, `mitigation`, `weight` (derive from dimension importance;
  on-point/resolution highest), `resolution_link:/inventory?itemId=<id>#picture-<n>`.
- Scoring: per photo, fraction of passed dimensions → average across photos → ×24. Be explicit and
  documented; thresholds may need tuning (call it out in ADR §10 per "Negative" consequence).

## Acceptance criteria
- [ ] `evaluatePhotosWithVision(item)` sends **all non-empty pictures** through the existing image→AI
      plumbing, logs the call via `logApiCall("openai", …)` (ADR-075), and returns a 0–24 sub-score +
      per-photo issues.
- [ ] The full rubric (`listing-quality`) now includes a **real** Photos §8b score; the §9 output
      shape is unchanged from G2; Photos category possible = 40 (16 coverage + 24 per-photo).
- [ ] Per-photo remediation items name the **slot**, shortcoming, and mitigation, are weighted, sorted
      by weight desc with the rest, and deep-link to the photo slot.
- [ ] **Resolution** is checked deterministically (Sharp) against shortest-side ≥ 2000px and produces
      a remediation item when too small.
- [ ] **Graceful degradation:** with AI unconfigured or a vision failure, the endpoint returns the
      deterministic score (§8b omitted) + a clear note + `photo_ai_evaluated:false`, **no 500**.
- [ ] G1 drift-block, phase transitions, `listing.quality_evaluated` activity, and
      `listing_quality_json` persistence still work.
- [ ] Docs updated (ADR-082 §8b/§10, ADR-018, `.cursorrules`); cross-refs checked. No new AI client;
      no hardcoded hex; standard error envelope.

## Out of scope
- **Shot-list generation** (ADR-083 / WS-H) and **dimension annotation** (ADR-084 / WS-H) — separate.
- AI title/description polish suggestions (optional ADR-082 §10) — may be a tiny follow-up, not here.
- Tuning campaigns / golden-image test suites (note as a future task).

## Escalation triggers (STOP and ask)
- Vision cost/latency is unacceptable for typical 10–15 image listings (raise before shipping per-photo
  calls).
- `picture_classifications` is empty for most real items (affects shot-type mapping) — confirm whether
  to gate §8b on WS-H shot-list first.
- The chosen model can't reliably map judgments to specific slots even with labels.

## How to verify (manual)
1. `npm run build` → start. On an item with several photos, **Evaluate Listing Quality**.
2. Confirm Photos score reflects real per-photo judgments; a deliberately blurry/cluttered photo
   yields a slot-specific remediation item; a <2000px image yields a resolution remediation.
3. Temporarily unset the AI key → re-evaluate → deterministic score returns with
   `photo_ai_evaluated:false` and a clear note; no error page.
4. Check the API usage log increments (ADR-075) per evaluation.

---

## Kickoff prompt

> Implement ticket `documents/tickets/WS-G3_ai-vision-photo-evaluation.md`. Read it and **ADR-082 §8b
> + §10** (`documents/adr/0082-listing-quality-rubric.md`) first, and follow
> `.cursor/rules/implementer.mdc`. This is part 3 of 3 for workstream G and depends on WS-G1 + WS-G2
> being merged. **Reuse the existing vision plumbing in `src/lib/listing-generator.ts`** (toImageUrl /
> input_image / getOpenAiClient / logApiCall) — do not add a new AI client, and log usage per ADR-075.
> Send all non-empty pictures. Implement graceful degradation (never 500 on vision failure). Only touch
> the files the ticket lists, update the listed docs, then run `npm run build`. Report what you changed
> and confirm each acceptance-criteria checkbox. STOP and ask me if you hit an escalation trigger.
