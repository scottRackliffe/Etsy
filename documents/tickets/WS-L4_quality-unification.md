# Ticket WS-L4 — Single quality engine (retire computeListingScore)

| Field | Value |
|-------|-------|
| Workstream | **L** — listing consolidation, 4 of 6. |
| Source ADR | **ADR-085** (§4), ADR-082 (rubric + deterministic fast path), ADR-016 (dashboard widget), ADR-068 (retired). |
| Recommended model | Budget/mid model OK. |
| Complexity | Medium. |
| Risk | Medium — must not leave any quality surface blank for never-evaluated items. |
| Depends on | Independent of L1–L3 (can run in parallel), but land before L6. |

---

## Goal

Make the **ADR-082 rubric the only quality scorer**. Retire `computeListingScore` (ADR-068) and
repoint every fast surface to the rubric's **deterministic fast path**.

## What to build

1. **Deterministic fast path** in `src/lib/listing-rubric.ts`: a pure function that returns the
   0–100 score using only deterministic checks (text/counts/presence/taxonomy/price), with the AI
   photo sub-score (§8b) using its **provisional fallback** when no cached AI evaluation exists. If a
   cached full result exists in `inventory.listing_quality_json`, prefer its score for display.
2. **Repoint these surfaces** from `computeListingScore` → the fast path:
   - Inventory **list Quality column + client sort** (`src/app/(app)/inventory/page.tsx` / table data).
   - **Outstanding** low-quality entries (`src/lib/outstanding.ts`).
   - **Dashboard** low-quality widget (`src/lib/dashboard.ts` + the widget component +
     `src/app/api/dashboard/low-quality-inventory/route.ts`).
   - **Inventory aging** report if it surfaces a score (`src/lib/inventory-aging.ts`).
3. **Threshold:** read the single setting `listing.min_quality_score` (default **85**) everywhere
   (some surfaces may still reference an old default — unify to 85).
4. **Remove the legacy score:** delete `src/lib/listing-score.ts` and
   `src/app/api/inventory/[id]/listing-score/route.ts` and every import. (If anything outside listing
   needs a quick number, it now calls the rubric fast path.)

## Do NOT

- Do not change the full Evaluate-Listing-Quality path (`listing-quality` route +
  `listing-photo-vision.ts`) — that already uses the rubric; just make sure list/widget surfaces share
  the deterministic core.

## Files

- Edit: `src/lib/listing-rubric.ts`, `src/app/(app)/inventory/page.tsx`, `src/lib/outstanding.ts`,
  `src/lib/dashboard.ts`, `src/components/dashboard/LowQualityInventoryWidget.tsx`,
  `src/app/api/dashboard/low-quality-inventory/route.ts`, `src/lib/inventory-aging.ts`.
- Delete: `src/lib/listing-score.ts`, `src/app/api/inventory/[id]/listing-score/route.ts`.

## Acceptance criteria

- [ ] No references to `computeListingScore` / `listing-score` remain (grep clean).
- [ ] Inventory list Quality column/sort, Outstanding, dashboard low-quality widget, and aging report all
      derive their score from the ADR-082 deterministic fast path (cached full score used when present).
- [ ] Never-evaluated items still show a sensible deterministic score (no blanks).
- [ ] All surfaces use `listing.min_quality_score` (default 85).
- [ ] `npm run build` passes; no new lint.

## Escalation triggers (STOP and ask)

- The deterministic fast path can't reproduce the list column's previous numbers closely enough to avoid
  user confusion (decide whether a one-time visual shift is acceptable).
- A surface needs an async (AI) score where only a sync deterministic one is available.

## Kickoff prompt

> Implement `documents/tickets/WS-L4_quality-unification.md`. Read it + **ADR-085 §4**, ADR-082, ADR-016;
> follow `.cursor/rules/implementer.mdc`. Add a deterministic fast-path scorer to `listing-rubric.ts`,
> repoint the inventory list column/sort, Outstanding, dashboard low-quality widget, and aging report to
> it (using cached `listing_quality_json` when present), unify the threshold to `listing.min_quality_score`
> (85), and delete `listing-score.ts` + its route. Grep to confirm no `computeListingScore` remains. Run
> `npm run build`; confirm each acceptance checkbox; STOP on any escalation trigger.
