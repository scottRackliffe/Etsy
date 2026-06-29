# Ticket WS-CR7 — Support reasoning-class models as a tier (temperature + reasoning effort)

> **Status: DONE + LIVE-VERIFIED 2026-06-26** — premium tier set to reasoning model `gpt-5.5` + effort=medium; remediation cycle **succeeded** (76→79, applied title/tags/description) with **no temperature-400** — the path that previously 400'd now works. Fix commit e840a58.

| Field | Value |
|-------|-------|
| Status | **OPEN** — Tier 1 (blocks premium/reasoning tier) |
| Workstream | **Conformance Remediation** — live smoke-test finding 2026-06-24. |
| Source ADR | **ADR-086 §1a** (model tiers/cost), ADR-089 (remediation cycle), ADR-075 (call sites). |
| Recommended model | Strong model — touches the shared AI call path. |
| Complexity | Small–Medium. |
| Risk | Medium — `callAiJson` is the shared generate/refine path; don't break non-reasoning tiers. |
| Priority | **Tier 1** — "Advance AI" to a reasoning model is currently broken. |
| Depends on | WP5 (ADR-089) shipped. |

## Problem

Found live: setting a tier to a **reasoning-class model** (e.g. `gpt-5.5`) breaks the AI call.
`callAiJson` (`src/lib/listing-ai.ts`) hardcodes `temperature: 0.2`, and reasoning models reject it:

> `400 Unsupported parameter: 'temperature' is not supported with this model.`

Two distinct facts about reasoning models:
1. They **do not accept `temperature`**.
2. They take a **reasoning effort** parameter instead — observed levels: **`none` / `low` / `medium`
   / `high` / `xhigh`** — which is itself a cost/quality dial (more effort = better + pricier).

Today the app sends `temperature` unconditionally and never sends a reasoning-effort, so the standard
tier (`gpt-5.4-mini`, non-reasoning) works while the premium reasoning tier 400s.

## Goal

Support reasoning-class models anywhere a tier can point (esp. **premium / "Advance AI"**):
1. **Omit `temperature`** for models that don't support it. Preferred = **catch the specific 400 and
   retry without `temperature`** (robust; no hardcoded model list). Alternative = detect reasoning
   models by id pattern.
2. **Send the reasoning-effort** parameter when the model is reasoning-class.
3. **Make effort configurable** — a new setting (e.g. `ai.premium_reasoning_effort`, or a small
   per-tier effort field) with the levels above; default a sensible mid value. Surface it in
   Settings → AI next to the premium model.
4. **Do not change non-reasoning tiers** (standard/economy keep `temperature`).

## Approach (doc-first)

1. Confirm the exact OpenAI **Responses API** shape (the app uses `responses.create`): reasoning
   effort is passed as `reasoning: { effort: "<level>" }` — **verify the exact param + accepted
   values during implementation** (the operator observed none/low/medium/high/xhigh).
2. Add an effort setting + wire it for reasoning tiers; implement the temperature omit (catch-400
   retry) in `callAiJson`.
3. Update ADR-086 §1a (reasoning effort = an additional cost dial) + ADR-075 (no new call sites, but
   note the param) as needed.

## Out of scope

- A full provider abstraction (that's the multi-provider decision; this is OpenAI-only).

## Acceptance criteria

- [ ] Premium = a reasoning model (e.g. `gpt-5.5`) → "Advance AI" runs (no temperature 400).
- [ ] Reasoning effort is configurable and actually sent; standard/economy tiers unchanged.
- [ ] `npm run type-check` + `npm run build` pass; a live cycle at the premium tier succeeds.

## Kickoff prompt

> Implement `documents/tickets/WS-CR7_reasoning-model-tier-support.md`. In `callAiJson`
> (`src/lib/listing-ai.ts`): catch the "temperature not supported" 400 and retry without temperature,
> and send `reasoning: { effort }` for reasoning models. Add a configurable reasoning-effort setting
> (none/low/medium/high/xhigh) in Settings → AI for the premium tier. Verify the exact OpenAI
> Responses-API param shape first. Don't change non-reasoning (standard/economy) behavior.
