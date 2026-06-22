# Ticket WS-L4b — Drift-aware cached quality score

| Field | Value |
|-------|-------|
| Workstream | **L** — follow-on to WS-L4. |
| Source ADR | **ADR-082** (rubric), **ADR-081** (drift detection / `listing-phase.ts`), ADR-085 (§4), ADR-016 (low-quality widget). |
| Recommended model | Mid model — small but needs a product decision applied carefully. |
| Complexity | Small–medium. |
| Risk | Medium — changes which score is shown for edited-after-eval items; touches the low-quality widget population. |
| Depends on | WS-L4 (done). Best after WS-L6 (so `listing-phase` is the only listing dimension). |

---

## Problem

`computeRubricFastScore` (`src/lib/listing-rubric.ts`) trusts a cached `listing_quality_json` score
**as-is when present** (the Resolution rule pinned in WS-L4). It does **not** check drift: if the
listing content changed after that evaluation, the cached score is stale.

Consequences:
- A drifted item can display its **last-evaluated** (possibly high) score until re-evaluated.
- Because the dashboard **low-quality widget** (ADR-016) filters on the resolved score, a drifted item
  with a stale high score can be **hidden** from that widget even though its current content may be weak.

This was accepted as by-design for WS-L4 (the rule was pinned to keep that ticket scoped). This ticket
decides whether to make the cached score **drift-aware**.

## Goal

When a cached quality result is **stale due to drift**, stop treating it as authoritative for fast
surfaces — fall back to the deterministic fast path (or mark it provisional) so stale high scores don't
mask weak current content.

## Approach (build to this)

- Reuse the existing drift check from `src/lib/listing-phase.ts` (`hasListingDrift` /
  `listing_source_hash` vs. recomputed hash) — do **not** invent a second drift definition.
- In `computeRubricFastScore`: if `listing_quality_json` is present **but** the item has drifted, skip
  the cached branch and return the deterministic **fast_path** result instead of `cached_full`.
- Keep totality (never throws) and the `{ score, source, photo_subscore }` shape unchanged.
- **Decision to confirm before coding:** drifted-with-cache should resolve as `source:"fast_path"`
  (recompute) — confirm we want recompute vs. simply flagging the cached value as provisional.

## Do NOT

- Do not change the non-drift Resolution rule (cached wins when present **and** current).
- Do not add async/AI to the fast path.

## Files

- Edit: `src/lib/listing-rubric.ts` (import/reuse the drift helper from `listing-phase.ts`).
- Verify: dashboard low-quality widget population (`src/lib/dashboard.ts` +
  `src/app/api/dashboard/low-quality-inventory/route.ts`) reflects the drift-aware score.

## Acceptance criteria

- [ ] A drifted item with a cached score resolves via the deterministic fast path (not the stale cache).
- [ ] A non-drifted item with a cached score still resolves `source:"cached_full"` (unchanged).
- [ ] Low-quality widget no longer hides drifted-but-weak items behind a stale high score.
- [ ] Scorer stays total (no throws); `{ score, source, photo_subscore }` shape unchanged.
- [ ] `npm run build` passes; no new lint.

## Escalation triggers (STOP and ask)

- Reusing `hasListingDrift` requires the full `InventoryRecord` but a fast surface only has a partial
  row (decide: widen the row, or compute drift only when the needed fields are present).
