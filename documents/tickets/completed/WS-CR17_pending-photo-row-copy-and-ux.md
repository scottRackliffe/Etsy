# Ticket WS-CR17 — "Per-photo AI review pending" row: stale copy + misleading Fix link

> **Status: DONE (code) 2026-06-26** — Sonnet; commit dc80e5c. Stale "WS-G3" copy replaced; PHOTO_AI_PENDING row filtered from the user-action list. type-check + build clean. Pending live re-eval.

| Field | Value |
|-------|-------|
| Status | **OPEN** — Tier 2 (UX/copy) |
| Workstream | **Conformance Remediation** — live-test finding 2026-06-26. |
| Source ADR | ADR-082 §8b (photo quality), ADR-089 (cycle panel). |
| Recommended model | Sonnet — copy + display filter. |
| Complexity | Small. |
| Risk | Low. |
| Depends on | Related to WS-CR18 (the underlying empty-vision cause). |

## Problem

When the per-photo AI vision sub-score is unavailable, the rubric emits a placeholder
remediation item via `provisionalPhotoQuality`
([listing-rubric.ts](../../src/lib/listing-rubric.ts), ref `PHOTO_AI_PENDING_REF`):

1. Its mitigation text says **"Per-photo AI evaluation … lands in WS-G3."** — but
   **WS-G3 already shipped** (photo vision is live and verified). The copy is stale and
   wrongly implies a future feature.
2. The row renders under **"Needs your attention"** with a **"Fix →"** link in the cycle
   panel, but it is a **system** pending state (weight 0, explicitly non-blocking — the
   route already excludes it from `blocking` at
   [listing-quality route:73](../../src/app/api/inventory/%5Bid%5D/listing-quality/route.ts)).
   The user cannot "fix" it, so the Fix link is misleading.

## Goal

1. **Rewrite the copy** to describe the real state: the per-photo AI review (focus,
   lighting, background, framing) could not be computed this run, so a provisional score
   is shown — re-evaluate to retry. No "WS-G3".
2. **Stop showing it as a user-action row with a Fix link.** Either filter
   `PHOTO_AI_PENDING_REF` out of the "Needs your attention" list in
   `RemediationCyclePanel.tsx`, or render it as a non-actionable info note (no "Fix →").

## Out of scope

- Fixing *why* the vision call returns empty — that's **WS-CR18**.

## Acceptance criteria

- [ ] No "WS-G3" (or other ship-date) text remains in the pending message.
- [ ] The pending row no longer appears under "Needs your attention" with a Fix link
      (filtered or shown as a plain info note).
- [ ] `npm run type-check` + `npm run build` pass.

## Kickoff prompt

> Implement `documents/tickets/WS-CR17_pending-photo-row-copy-and-ux.md`. (1) Rewrite the
> `provisionalPhotoQuality` remediation copy in listing-rubric.ts (drop "lands in WS-G3";
> say the per-photo AI review couldn't be computed this run — re-evaluate to retry).
> (2) In RemediationCyclePanel.tsx, exclude `PHOTO_AI_PENDING_REF` from the user-action
> list (or render it as a non-actionable info note, no "Fix →"). Don't change the scoring.
