# Ticket WS-CR18 — Per-photo AI vision returns empty → score stuck provisional

| Field | Value |
|-------|-------|
| Status | **OPEN** — Tier 1 (blocks 24 pts of the score) |
| Workstream | **Conformance Remediation** — live-test finding 2026-06-26. |
| Source ADR | ADR-082 §8b, ADR-086 (economy lane), ADR-075 (call logging). |
| Recommended model | **Opus / strong — diagnostic; owner-led.** |
| Complexity | Medium — investigation first, then targeted fix. |
| Risk | Medium — touches the economy vision path + scoring. |
| Depends on | Pairs with WS-CR10 (surface real cause) + WS-CR14 (token budget). |

## Problem

On item 1 (11 photos, AI configured) the per-photo AI vision review shows **"pending"** —
i.e. `evaluatePhotoQuality` returned **null**, so the rubric fell back to a provisional
~60% sub-score ([listing-quality route:69](../../src/app/api/inventory/%5Bid%5D/listing-quality/route.ts)).
`evaluatePhotoQuality` returns null silently on several paths
([listing-photo-vision.ts](../../src/lib/listing-photo-vision.ts): no config, no photos,
image-load failure, **AI call failure**, **empty/garbage output**, zero judgments). The
user never learns which — the 24-pt photo-quality category just stays provisional.

Most likely cause given the inputs: the **economy model** (`ai.economy_model` = `gpt-5.4`)
on the vision task returns empty output (the WS-CR14 class) **or** isn't reliably
vision-capable for this prompt.

## Goal (investigate first — facts, not guesses)

1. **Diagnose**: instrument/inspect `api_call_log` + `evaluatePhotoQuality` to find the
   exact null path for item 1 (empty output? non-vision model? image load? token budget?).
   Report the finding before large changes.
2. **Fix the root cause** once known — e.g. ensure a vision-capable model + adequate
   `max_output_tokens` for the photo task (mirror WS-CR14's floor/retry), or correct
   model resolution for the economy vision lane.
3. **Stop the silent fallback**: when vision genuinely can't run, surface the real reason
   (pairs with WS-CR10) instead of only an opaque "pending" — so it's diagnosable like the
   other AI actions now are.

## Acceptance criteria

- [ ] Root cause for item 1's "pending" identified and documented in the ticket.
- [ ] Per-photo AI vision completes on a configured setup → `photo_ai_evaluated: true`,
      real §8b score replaces the provisional.
- [ ] A genuine failure surfaces a specific cause (not just "pending").
- [ ] `npm run type-check` + `npm run build` pass.

## Notes

Owner-led / diagnostic — do **not** hand to Sonnet for blind implementation; diagnose,
confirm the cause, then scope the fix.
