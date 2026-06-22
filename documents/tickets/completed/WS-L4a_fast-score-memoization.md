# Ticket WS-L4a — Memoize fast quality score (perf)

> **Status: DONE — merged 2026-06-22.** Fast quality score memoized for inventory list quality-sort performance.

| Field | Value |
|-------|-------|
| Status | **OPEN** — Tier 2, queue **#8** |
| Workstream | **L** — follow-on to WS-L4. |
| Source ADR | **ADR-082** (rubric), ADR-085 (§4 single quality engine). |
| Recommended model | Budget model — small, mechanical. |
| Complexity | Small. |
| Risk | Low — pure performance; no behavior change to scores. |
| Depends on | WS-L4 (done). |

---

## Problem

`computeRubricFastScore` (`src/lib/listing-rubric.ts`) runs the **full deterministic rubric**
(`evaluateListingQuality`) on every call. On the inventory list it is called:

1. **Inside the sort comparator** (`src/app/(app)/inventory/page.tsx` ~1032–1033) — so each row is
   re-evaluated on **every comparison** (≈ O(n log n) evaluations per sort), and
2. **Again per badge render** (`ListingQualityScore.tsx` / `ListingQualityScoreBadge`).

Fine for tens–low-hundreds of items, but wasteful and can get sluggish on large inventories. Scores
are correct; this is only redundant compute.

## Goal

Compute each visible row's fast score **once per list render** and reuse it for both sort and badge —
no change to the resolved score values.

## What to build

- In the inventory list data path, build a `Map<number /* item id */, number /* score */>` (or attach
  a derived `__fastScore` to the row view-model) computed once via `computeRubricFastScore(row).score`,
  memoized on the row set (`useMemo` keyed on the items array / their `updated_at`).
- Sort comparator reads the precomputed value instead of calling `computeRubricFastScore` per compare.
- Badge reads the same precomputed value when available (fall back to a direct call if a row isn't in
  the map, e.g. a freshly fetched detail row).
- Keep `computeRubricFastScore` itself unchanged (still the single resolution rule); this is caller-side
  memoization only.

## Do NOT

- Do not change the score math, the Resolution rule, or the `{ score, source, photo_subscore }` shape.
- Do not introduce async/AI scoring (fast path stays sync/deterministic).

## Files

- Edit: `src/app/(app)/inventory/page.tsx` (and the badge wiring in
  `src/components/inventory/ListingQualityScore.tsx` if it needs the precomputed value threaded in).

## Acceptance criteria

- [ ] Each list row's fast score is computed once per render (no per-comparison recompute in the sort).
- [ ] Displayed badge score === sort key score (still the same resolved value).
- [ ] No change to any displayed score vs. WS-L4 output.
- [ ] `npm run build` passes; no new lint.
