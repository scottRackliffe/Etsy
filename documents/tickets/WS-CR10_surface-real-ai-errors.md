# Ticket WS-CR10 — Surface the real error in AI action dialogs (stop masking causes)

> **Status: DONE (code) 2026-06-24** — committed + type-check clean; pending live re-test.

| Field | Value |
|-------|-------|
| Status | **OPEN** — Tier 1 (diagnosability) |
| Workstream | **Conformance Remediation** — live-test finding 2026-06-24. |
| Source ADR | ADR-085 (generate), ADR-089 (cycle), ADR-075 (call logging). |
| Recommended model | Sonnet — error plumbing. |
| Complexity | Small–Medium. |
| Risk | Low–Medium — don't leak secrets in messages. |
| Priority | **Tier 1** — repeatedly blocked debugging during live testing. |
| Depends on | — |

## Problem

Every AI-action failure (Generate, remediation cycle, refine) shows the **same generic dialog** —
"We could not generate listing content" / "We could not run the remediation cycle" — which **hides
the actual cause**. During live testing this masked three distinct real errors:
- `400 ... model 'GPT-5.5' does not exist` (bad model id),
- `400 Unsupported parameter: 'temperature' ...` (reasoning model — WS-CR7),
- a **post-AI** generate failure where the OpenAI call **succeeded (200)** but
  `updateListingContent`/`markListingGenerated` then threw, so the **billed AI result was silently
  discarded**.

The real messages exist server-side (`logger.error(...)`, and `error.message` in the API response)
but aren't shown to the user.

## Goal

1. **Surface the real reason** in these dialogs — pass through `error.message` (sanitized) as the
   user-facing detail, or a mapped friendly version (e.g. "AI model not found / invalid", "this model
   doesn't support temperature", "couldn't save the generated content"). Keep the generic line as a
   fallback only.
2. **Never silently discard a successful-but-unsaved AI result** (the post-AI failure case): if the
   AI succeeded but persistence failed, say so explicitly (and ideally make the result recoverable /
   retryable without re-billing).
3. Make sure NO secrets (API keys) ever appear in surfaced messages.

## Out of scope

- The underlying fixes themselves (WS-CR6 concurrency, WS-CR7 reasoning) — this ticket is about
  *showing* the cause, which makes those self-diagnosing.

## Acceptance criteria

- [ ] A bad model id, a temperature/param rejection, and a persist failure each show a *specific*,
      actionable message (not the generic line).
- [ ] A generate that succeeds at the AI but fails to save reports that distinctly.
- [ ] No API key/secret text in any surfaced message.
- [ ] `npm run type-check` + `npm run build` pass.

## Kickoff prompt

> Implement `documents/tickets/WS-CR10_surface-real-ai-errors.md`. In the Generate / remediation-cycle
> / refine routes + their UI handlers, surface the real `error.message` (sanitized, no secrets) as the
> dialog detail instead of only the generic line; distinguish "AI succeeded but save failed". Read
> ADR-085/089. Don't change the underlying AI logic.
