# Ticket WS-CR9 — Normalize OpenAI model names to lowercase (+ trim) on save

| Field | Value |
|-------|-------|
| Status | **OPEN** — Tier 2 |
| Workstream | **Conformance Remediation** — owner request / live-test finding 2026-06-24. |
| Source ADR | ADR-034 (AI settings), ADR-086 (tiers). |
| Recommended model | Sonnet — tiny, well-defined. |
| Complexity | Trivial. |
| Risk | Low. |
| Priority | Tier 2 — prevents a confusing silent failure. |
| Depends on | — |

## Problem

OpenAI model IDs are **lowercase and case-sensitive**. Entering a display-style name with capitals
(e.g. `GPT-5.4`, `GPT-5.5`) makes the API return `400 ... model 'GPT-5.5' does not exist`, even
though the model is real — observed live. The standard tier worked only because it was typed
lowercase (`gpt-5.4-mini`).

## Goal

Normalize the three model-name settings so casing/whitespace can't cause a silent failure:
- On save (`saveAiConfig`, `src/lib/ai-config.ts`), **trim + lowercase** `ai.model`,
  `ai.economy_model`, `ai.premium_model` before persisting.
- (Optional polish) lowercase as the user types in the Settings → AI inputs, or show a hint that IDs
  are lowercase.

Note: this is for the current **OpenAI-only** provider (all OpenAI IDs are lowercase). If a
non-OpenAI provider with case-sensitive mixed-case IDs is ever added (see the multi-provider
decision), revisit whether to normalize per provider.

## Acceptance criteria

- [ ] Saving `GPT-5.4` / `GPT-5.5` persists as `gpt-5.4` / `gpt-5.5`.
- [ ] Existing values are normalized on next save; leading/trailing spaces trimmed.
- [ ] `npm run type-check` + `npm run build` pass.

## Kickoff prompt

> Implement `documents/tickets/WS-CR9_lowercase-model-names.md`. In `saveAiConfig`
> (`src/lib/ai-config.ts`), trim + lowercase the model-name values (`ai.model`, `ai.economy_model`,
> `ai.premium_model`) before persisting. OpenAI-only scope.
