# Ticket WS-CR18 — Per-photo AI vision returns empty → score stuck provisional

> **Status: DIAGNOSED 2026-06-26 (owner-led)** — reasoning-budget hypothesis **disproven**
> (16/16 evals succeeded; reasoning_tokens=0; output ~700 of 4000). Real issue = a low-rate,
> **non-retried, silent** unusable-200 path (empty/malformed JSON). Implementation (app-level
> retry + reason-surfacing) is now scoped and **ready for Sonnet**. See Diagnosis below.

| Field | Value |
|-------|-------|
| Status | **OPEN** — Tier 2 (resilience/diagnosability; not the score-blocker first thought) |
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

Initial hypothesis (later **disproven**): the economy model (`gpt-5.4`) on the vision
task returns empty output because reasoning overhead exhausts the token budget (WS-CR14
class).

## Diagnosis — 2026-06-26 (facts, instrumented)

Temporarily instrumented `evaluatePhotoQuality` to log output length + token usage, then
ran the eval **16 times** on item 1 (11 photos). Findings:

- **All 16 calls returned 200 with valid JSON** → `photo_ai_evaluated: true`. **Could NOT
  reproduce "pending."** The path is currently healthy.
- **Reasoning-budget hypothesis is DISPROVEN**: `reasoning_tokens = 0` on every call;
  `output_tokens ≈ 630–710` against a `max_output_tokens` of 4000 (huge headroom);
  `input_tokens ≈ 29,600` (the 11 base64 images). Output length steady at ~1,750–2,020 chars,
  always a clean JSON array. So it is **not** token exhaustion and **not** a non-vision model.
- Transport resilience is already ample: `ai.timeout_ms = 20000` (calls take ~6–9s) and
  `ai.retry_count = 5`. The call log shows **15 consecutive 200s**, no recent 4xx/5xx
  (the only 400s were 2026-06-24, the bogus-model era).

**Conclusion:** there is **no reproducible structural defect**. The "pending" the owner
saw was a **transient / low-rate** failure in one of the **non-retried, silent** null
paths. Key insight: the OpenAI client's 5 retries only cover **transport** errors
(timeouts, 5xx, 429) — they do **NOT** retry a **200 that is usable-but-bad** (empty
output, malformed JSON, or zero judgments). So a single bad-JSON/empty 200 → **instant,
silent** fallback to provisional with no retry and no surfaced reason. That is the real
weakness, even though its rate is low.

## Goal (revised per diagnosis — resilience + diagnosability, not a root-cause patch)

1. **App-level retry on the unusable-200 paths** (empty output / parse error / zero
   judgments): retry once (the client won't, since these aren't transport errors) before
   falling back. Converts most transient one-offs into successes.
2. **Surface the real reason** when it ultimately falls back (pairs with WS-CR10): record
   *which* null path fired (empty output vs parse error vs API status N vs timeout) so the
   next "pending" is diagnosable instead of guessed — not an opaque "pending."
3. (Optional) Keep a lightweight structured log of `usage`/`incomplete_details` for future
   investigations.

## Acceptance criteria

- [x] Root cause investigated & documented (above): reasoning-budget DISPROVEN; failure is
      a low-rate, non-retried, silent unusable-200 path.
- [ ] Empty/parse-fail/zero-judgment 200 triggers one app-level retry before provisional.
- [ ] A genuine fallback surfaces a specific cause (not just "pending").
- [ ] `npm run type-check` + `npm run build` pass.

## Notes

Diagnosis was owner-led. The remaining work (items 1–3) is now well-scoped and **safe to
hand to Sonnet** — it's bounded retry + reason-surfacing in `listing-photo-vision.ts`, no
open-ended investigation left.
