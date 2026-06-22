# Ticket WS-B — Dashboard "Recent Activity" view (newest 25, 1/3 ÷ 2/3 split)

> **This ticket is also the template for all future tickets. Keep the same section order.**

| Field | Value |
|-------|-------|
| Workstream | B (dashboard activity views) |
| Source ADR(s) | **ADR-016 §6** (authoritative). Context: ADR-037 (data), ADR-028 (components). |
| Recommended model | **T1 — Composer (`composer-2.5-fast`)** or Auto. Step up to Sonnet only if stuck. |
| Complexity | Small (front-end layout + trimming an existing component) |
| Risk | Low (no schema/API/enum changes) |

---

## Goal

On the dashboard, make **Recent Activity** a narrow (1/3-width) snapshot of the **newest 25**
activity entries with **no pagination and no footer**, and give the remaining **2/3** width to the
existing **Activity log** so all its columns fit. (Per ADR-016 §6.)

## Context / current state

- Dashboard renders the two side-by-side here: `src/app/(app)/dashboard/page.tsx` around the
  `<div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-stretch">` block
  (`<ActivityFeed compact … />` + `<ActivityLogSection … compact />`).
- `src/components/dashboard/ActivityFeed.tsx` (compact mode) already has column headers, ellipsis
  truncation, and hover tooltips from earlier work, **but** it currently uses dynamic page sizing
  + pagination. This ticket removes the paging/footer and fixes it to 25.
- The `GET /api/activity?limit=25` param is already supported — **no API change needed.**

## Files (touch only these)

1. `src/app/(app)/dashboard/page.tsx` — change the 2-col grid to a 3-col grid; set the Recent
   Activity wrapper to span 1 column and the Activity log wrapper to span 2.
2. `src/components/dashboard/ActivityFeed.tsx` — in **compact** mode: fetch newest 25, remove the
   pagination controls and the record-count footer, remove the dynamic container page-sizing for
   the compact path; keep single-spaced rows + Time/Activity/Originator headers + ellipsis + hover.

> If you find you need to edit any other file, **STOP and ask** (scope signal).

## Steps

1. **Dashboard grid (page.tsx):**
   - Change the wrapper `lg:grid-cols-2` → `lg:grid-cols-3`.
   - On the `<div>` wrapping `<ActivityFeed … />`, add `lg:col-span-1`.
   - On the `<div ref={activityLogRef} …>` wrapping `<ActivityLogSection … />`, add
     `lg:col-span-2`.
   - Keep the `grid-cols-1` (stacked) behavior on small screens, Recent Activity first.
2. **ActivityFeed compact (ActivityFeed.tsx):**
   - Fetch with `limit=25`, newest first; render **at most 25** rows.
   - **Remove** the pagination UI (next/prev) and the footer/record-count from the compact view.
   - **Remove** the `useContainerPageSize`-driven dynamic row count for the compact path (delete
     now-unused imports/vars it leaves behind).
   - Keep: single-spaced rows; sticky header `Time | Activity | Originator`; the **Activity**
     column truncates with ellipsis and shows full text on hover (`title`).
   - If the 25 rows exceed the panel height, let the list scroll internally (`overflow-y-auto`) —
     but **no** paging controls.
3. Verify the Activity log (right column) still renders and is now wider; do not change its logic.
4. Run `npm run build`; fix any type/lint errors you introduced.

## Acceptance criteria

- [ ] On `lg` screens: Recent Activity ≈ **1/3** width, Activity log ≈ **2/3** width (3-col grid,
      1 + 2 spans). On small screens they stack, Recent Activity first.
- [ ] Recent Activity shows the **newest 25** entries (≤25), newest first.
- [ ] Recent Activity has **no pagination controls and no footer/record count**.
- [ ] Rows are single-spaced with **Time | Activity | Originator** headers; long Activity text
      shows an **ellipsis** and the **full text on hover**.
- [ ] Activity log behavior unchanged (just wider).
- [ ] `npm run build` passes; no new lint errors; **no hardcoded hex** (uses `var(--ui-*)`).

## Out of scope (do NOT do here)

- Deleted-records-show-no-link and new entity types/filter chips → **WS-A**.
- Low-quality inventory widget → **WS-D**.
- Any change to `/api/activity`, the DB, enums, or settings.

## Escalation triggers (STOP and ask the human/architect)

- You think the API or DB needs to change to get 25 newest entries (it doesn't — use `limit=25`).
- Removing pagination would require changing `ActivityLogSection` or shared pagination components
  used elsewhere.
- The grid change affects other dashboard sections unexpectedly.

## How to verify (manual)

1. `npm run build` then `npm run start` (or dev), open the dashboard.
2. Confirm the 1/3 ÷ 2/3 split on a wide window; resize narrow → they stack.
3. Confirm Recent Activity shows ≤25 rows, no next/prev, no footer; hover a long Activity row to
   see the full text.

---

## Kickoff prompt (paste into a new chat on the Recommended model)

> Implement ticket `documents/tickets/WS-B_dashboard-activity-views.md`. Read that ticket and the
> cited section **ADR-016 §6** (`documents/adr/0016-dashboard-content-and-behavior.md`) first, and
> follow `.cursor/rules/implementer.mdc`. Only touch the files the ticket lists. When done, run
> `npm run build`, report what you changed, and confirm each acceptance-criteria checkbox. STOP and
> ask me if you hit any escalation trigger.
