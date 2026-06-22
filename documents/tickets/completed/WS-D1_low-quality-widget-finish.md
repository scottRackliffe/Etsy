# Ticket WS-D1 — Finish low-quality dashboard widget (placement + rubric)

> **Status: DONE — merged 2026-06-22.** Low-quality inventory dashboard widget finished (placement + rubric scroll list).

| Field | Value |
|-------|-------|
| Status | **OPEN** — Tier 1, queue **#1** (widget + API exist; dashboard placement + rubric repoint remain) |
| Workstream | **D** — follow-on to WS-D (partially implemented). |
| Source ADR | **ADR-016 §7**, **ADR-082/085** (single quality engine), ADR-035 (deep-link). |
| Recommended model | Budget/mid model — small wiring + verify existing component. |
| Complexity | Small. |
| Risk | Low. |
| Depends on | WS-L4 (done — `computeRubricFastScore` is canonical). |

---

## Problem

WS-D was **partially implemented**: `getLowQualityInventory()` in `src/lib/dashboard.ts`,
`GET /api/dashboard/low-quality-inventory`, and `LowQualityInventoryWidget.tsx` exist — but the
widget is **not rendered** on `src/app/(app)/dashboard/page.tsx` (owner requirement **1.f**).

The original WS-D ticket referenced retired `computeListingScore`; L4 replaced scoring with
`computeRubricFastScore`. Confirm the lib query and widget use the rubric fast path and
`getMinQualityScore()` (default **85**), not 80.

## Goal

Complete owner requirement **1.f**: a **scrollable dashboard list** of current inventory below the
quality pass threshold, lowest score first, each row deep-linking to `/inventory?itemId=<id>`.
Exclude Sold and Retired (use existing `UNSOLD_STATUSES`).

## What to build

1. **Verify/repoint** `getLowQualityInventory()` in `src/lib/dashboard.ts`:
   - Score via `computeRubricFastScore(row).score` (Resolution rule — same as list/Outstanding).
   - Threshold via `getMinQualityScore()` (default 85).
   - Include when `score < threshold`; sort lowest first.
2. **Verify** `LowQualityInventoryWidget.tsx` displays threshold from API (not hardcoded 80).
3. **Place on dashboard** — `src/app/(app)/dashboard/page.tsx`:
   - Add in the **Inventory** section (alongside Inventory Value / Aging), or a dedicated row
     above Activity — pick the layout that matches ADR-016 §7 without crowding the 1/3–2/3 activity
     row. Document placement in the report.
   - Title: **"Needs work"** (or match ADR-016 wording); scrollable single-spaced list;
     positive empty state when all items pass.
4. **Optional one-line ADR-016 §7 note** if threshold wording still says 80-only.

## Do NOT

- Change the rubric engine or add a second threshold key.
- Paginate the widget (fixed scrollable list is fine).

## Files

- Edit: `src/lib/dashboard.ts`, `src/components/dashboard/LowQualityInventoryWidget.tsx`,
  `src/app/(app)/dashboard/page.tsx`.
- Optional: `documents/adr/0016-dashboard-content-and-behavior.md` (threshold note).

## Acceptance criteria

- [ ] Dashboard shows the low-quality widget; Sold/Retired excluded.
- [ ] Scores/threshold match Inventory list badge (same `computeRubricFastScore` + `listing.min_quality_score`).
- [ ] Rows deep-link to `/inventory?itemId=<id>`; scrollable, single-spaced.
- [ ] Empty state when no items below threshold.
- [ ] `npm run build` passes; no new lint.

## Kickoff prompt

> Implement `documents/tickets/WS-D1_low-quality-widget-finish.md`. Wire `LowQualityInventoryWidget`
> onto the dashboard; confirm `getLowQualityInventory` uses `computeRubricFastScore` +
> `getMinQualityScore()` (85). Do not use retired `computeListingScore`. Run `npm run build`.
