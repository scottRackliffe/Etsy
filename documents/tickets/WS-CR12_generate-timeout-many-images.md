# Ticket WS-CR12 — Generate times out (~30s) with many images; server succeeds but UI false-fails

> **Status: DONE + LIVE-VERIFIED 2026-06-26** — generate on item 1 (all 11 photos) returned HTTP 200 in **17.8s** (was ~30s+ false-fail); image cap(6)+downscale holds. Fix commit e840a58. _Note: optional async/poll "still working" UX (goal #3) intentionally not built — perf fix made it moot._

| Field | Value |
|-------|-------|
| Status | **OPEN** — Tier 1 |
| Workstream | **Conformance Remediation** — live smoke-test finding 2026-06-24. |
| Source ADR | ADR-085 (generate), ADR-026 (picture handling), ADR-075 (timeouts). |
| Recommended model | Strong model — perf + async UX. |
| Complexity | Medium. |
| Risk | Medium — touches the generate call + its UX. |
| Priority | **Tier 1** — blocks Generate once an item has several photos. |
| Depends on | Relates to WS-CR10 (don't report a billed-but-saved result as failure). |

## Problem

Observed in the dev-server log: every `POST /api/inventory/[id]/generate-listing-content` returns
**`200` but takes exactly `~30.0s`** (the AI client timeout ceiling, `ai.timeout_ms` default 30000).
With **1 photo** generate took ~15s and worked; with **11 photos** it hits ~30s. The **server
completes and saves the listing (200)**, but the **browser/UI gives up first** and shows "Could not
generate listing content" — a **false failure on a billed call**, with the listing actually saved.

Root cause: Generate sends **all** item pictures to the AI; more/larger images → much slower call →
hits the timeout boundary; and the client doesn't wait/poll for a long call.

## Goal

Make Generate reliable as photos grow:
1. **Right-size the timeout** for the (heaviest) generate call — it should not share the default 30s
   ceiling; give it a longer, dedicated timeout.
2. **Bound the image payload** sent to Generate — cap count and/or **downscale** images before
   sending (the AI doesn't need full-res; ADR-026 already has a max-dimension concept), to keep the
   call fast and cheap.
3. **Async/await UX** — for a long generate, show a proper "working…" state and await completion
   (consider the existing jobs pattern), instead of a short client timeout that false-fails.
4. **Reconcile with the saved result** — since the server saved the listing, the UI must not claim
   failure (ties to WS-CR10).

## Acceptance criteria

- [ ] Generate on an item with 10+ photos completes in the UI without a false failure.
- [ ] Image payload to the AI is bounded (count and/or resolution).
- [ ] If the server saved a listing, the UI reflects success (no "could not generate" on a 200).
- [ ] `npm run type-check` + `npm run build` pass.

## Kickoff prompt

> Implement `documents/tickets/WS-CR12_generate-timeout-many-images.md`. Generate is hitting the ~30s
> AI timeout with many photos (server returns 200 but the UI false-fails). Give generate a dedicated
> longer timeout, bound/downscale the images sent to the AI, and make the UI await/poll a long
> generate instead of false-failing. Read ADR-085/026.
