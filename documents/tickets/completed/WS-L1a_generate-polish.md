# Ticket WS-L1a — Generate polish (per-field evidence + stale comment)

| Field | Value |
|-------|-------|
| Workstream | **L** — small follow-on to WS-L1. |
| Source ADR | **ADR-085** (§3), ADR-018 (generate payload). |
| Recommended model | Budget model — tiny, mechanical. |
| Complexity | Small. |
| Risk | Low. |
| Depends on | WS-L1 (done). Best landed **before WS-L3** so the evidence UI has data to render. |

---

## Goal

Two small cleanups left from WS-L1:

1. **Surface per-field evidence.** `generate-listing-content` currently returns `evidence: null`, but
   the engine (`researchAndCompose` in `listing-ai.ts`) produces per-field evidence/confidence
   (`FieldEvidence`). Pass it through so WS-L3's evidence/citations UI has real data.
   - Add the per-field `evidence` map to `GeneratedListing` (in `src/lib/listing-generator.ts`) from
     the engine result.
   - Return it from `src/app/api/inventory/[id]/generate-listing-content/route.ts` instead of `null`.
   - **Decision:** display-only (return in the response) vs persist. Default to **display-only** for
     now (no schema change); note it if you persist instead. The `citations` + `compliance_check`
     pass-through already works — keep it.

2. **Fix the stale comment.** In `src/lib/listing-phase.ts` the file header still says
   `listing_phase` is "independent of `inventory.status` and `listing_draft_state`." Drop the
   `listing_draft_state` reference (it's deprecated, ADR-085) — `listing_phase` is the single listing
   dimension, separate from `status`.

## Do NOT

- No schema change unless you choose to persist evidence (then justify it).
- Don't touch the deprecated-column writes (that's WS-L6).

## Files

- Edit: `src/lib/listing-generator.ts`, `src/app/api/inventory/[id]/generate-listing-content/route.ts`,
  `src/lib/listing-phase.ts`.

## Acceptance criteria

- [x] ~~`generate-listing-content` returns a real per-field `evidence` payload (not `null`).~~
      **DROPPED as redundant (see resolution below).**
- [x] `listing-phase.ts` header comment no longer references `listing_draft_state`. **DONE.**
- [x] `npm run build` passes; no new lint.

## Resolution (2026-06-21)

- **Item 2 — DONE.** `listing-phase.ts` header now says `listing_phase` is the single listing
  dimension (ADR-085), separate from `inventory.status`; dropped the `listing_draft_state` mention.
- **Item 1 — DROPPED (redundant).** After WS-L3 landed, evidence is surfaced via the **citations +
  compliance panel** (which renders), not per-field badges. `GenerateResult` has no `evidence` field
  and `EvidenceBadge` in `InventoryDetailPanel.tsx` is **defined but never rendered** (dead code).
  The engine only emits `FieldEvidence` for research fields (identification/era/materials), which the
  citations panel already covers. Wiring the route's `evidence` through would require new UI (extend
  `GenerateResult`, thread state, render badges) for value already provided. Left `evidence: null`
  in the route. **WS-L6 deletes the dead `EvidenceBadge`** from `InventoryDetailPanel.tsx`.

## Kickoff prompt

> Implement `documents/tickets/WS-L1a_generate-polish.md`. Read it + ADR-085 §3 / ADR-018; follow
> `.cursor/rules/implementer.mdc`. Pass the engine's per-field evidence through
> `generateListingFromAi` → the generate route (replace `evidence: null`), and fix the stale
> `listing_draft_state` mention in the `listing-phase.ts` header comment. No schema change. Run
> `npm run build`; confirm each acceptance checkbox.
