# Ticket WS-CR14 — Economy-lane AI calls fail on gpt-5.x (token budget + temperature, not covered by CR7)

| Field | Value |
|-------|-------|
| Status | **OPEN** — Tier 1 |
| Workstream | **Conformance Remediation** — live-test finding 2026-06-24. |
| Source ADR | ADR-083 (shot-list), ADR-084 (dimension annotation), ADR-082 §8b (photo vision), ADR-086. |
| Recommended model | Strong model — AI call path. |
| Complexity | Small–Medium. |
| Risk | Medium — three economy-lane call sites. |
| Priority | **Tier 1** — shot-list/photo-vision/measure are broken on gpt-5.x. |
| Depends on | Sibling of WS-CR7 (which only fixed `callAiJson`). |

## Problem

WS-CR7 fixed reasoning/temperature handling in `callAiJson` (generate/refine) only. But three
**separate** economy-lane AI call sites each have their **own** `openai.responses.create` that CR7
did not touch:
- `src/lib/shot-list.ts` (ADR-083)
- `src/lib/listing-photo-vision.ts` (ADR-082 §8b)
- `src/lib/dimension-annotation.ts` (ADR-084)

Observed live: **Shot-list generation fails** with a masked 502 ("We could not generate a shot list").
The OpenAI call actually **succeeds (200 in `api_call_log`)** but returns **empty `output_text`** →
shot-list.ts throws `"The AI returned an empty shot list."` Root cause: these calls request only
`max_output_tokens: config.tokenBudget` (default **2000**), whereas `callAiJson` uses a **4000 floor**.
With the **gpt-5.x** family, reasoning/overhead consumes the 2000-token budget and leaves no visible
output. They also still hardcode `temperature` (e.g. shot-list `temperature: 0.3`), so a reasoning
model that rejects temperature would 400 here too.

## Goal

Bring the three economy-lane call sites to parity with the CR7 work:
1. **Raise `max_output_tokens`** to a sensible floor (≥ 4000, matching `callAiJson`; more headroom for
   reasoning models) so output isn't empty.
2. **Temperature handling**: catch the "temperature not supported" 400 and retry without it (or omit
   for reasoning models), same as CR7.
3. Optionally **send `reasoning: { effort }`** for reasoning models (reuse the CR7 plumbing /
   `ai.premium_reasoning_effort` or an economy equivalent).
4. **Surface a clearer error** when output is empty/unparseable (pairs with WS-CR10) — distinguish
   "AI returned empty output (raise token budget / model issue)" from a transport failure.
5. Best: **factor the shared OpenAI-call logic** so all call sites go through one helper (avoids this
   drift recurring) — but a targeted per-file fix is acceptable if a refactor is too large.

## Acceptance criteria

- [ ] Shot-list, photo-vision, and dimension-annotation succeed on a gpt-5.x economy model.
- [ ] `max_output_tokens` floor ≥ 4000 on all three; temperature-400 retry in place.
- [ ] Empty/unparseable output yields a specific, non-masked error.
- [ ] `npm run type-check` + `npm run build` pass.

## Kickoff prompt

> Implement `documents/tickets/WS-CR14_economy-lane-reasoning-token-budget.md`. In `src/lib/shot-list.ts`,
> `src/lib/listing-photo-vision.ts`, and `src/lib/dimension-annotation.ts`: raise `max_output_tokens`
> to a ≥4000 floor, add the CR7 temperature-400 catch-and-retry, and surface a specific error on empty
> output. Mirror the WS-CR7 approach in `callAiJson`. Don't change non-AI logic.
