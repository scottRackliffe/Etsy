# Ticket WS-L3 — Port Listing Coach UI into the inventory detail panel

| Field | Value |
|-------|-------|
| Workstream | **L** — listing consolidation, 3 of 6. |
| Source ADR | **ADR-085** (§3), ADR-030 (detail), ADR-033 (clipboard paste), ADR-018 (refine/video endpoints). |
| Recommended model | Mid/strong model — large UI port, but mechanical with the source components in hand. |
| Complexity | Large. |
| Risk | Medium — must not drop any Coach capability before L6 deletes the Coach. |
| Depends on | **WS-L1** (engine + refine/video endpoints) and **WS-L2** (inline create). |

---

## Goal

Bring every Listing-Coach AI affordance into the inventory detail editor so nothing is lost when the
standalone Coach is deleted (L6). The lifecycle **Generate** already runs the engine (L1); this ticket
adds the surrounding UX.

## What to port (from `src/components/listing-coach/*` and `/listing-coach/page.tsx`)

1. **Google Visual Search paste** — port `GoogleResultsPasteZone.tsx` into the detail editor so the
   owner can paste Google/Lens screenshots as price-comp input for Generate.
2. **Evidence / citations / compliance display** — render the per-field `evidence`/`confidence`,
   `citations[]`, and `compliance_check` returned by Generate (types from `listing-ai.ts`). Reuse the
   `EvidenceBadge`/types from `src/components/listing-coach/types.ts`.
3. **Clipboard photo paste (⌘V)** in `PictureGrid` (ADR-033 updated) — port from
   `PhotoPasteZone.tsx`; pasted images upload immediately via the pictures API.
4. **Per-field + global AI refine** — "Fix this field" per listing field + a global "Fix" action,
   calling the **new** `POST /api/inventory/[id]/listing-refine` (add this route in this ticket if L1
   didn't; it wraps `refineListing()` from `listing-ai.ts`).
5. **Auto listing-video** — a "Generate video" action calling **new** `POST
   /api/inventory/[id]/listing-video` (wraps the existing `src/lib/video-generator.ts`), writing
   `inventory.video_path`.
6. **Price suggestion display** — show the `PriceSuggestion` (low/high/suggested/confidence/rationale)
   next to `sale_revenue` with an "accept" affordance (the field stays editable).

## New API routes (thin wrappers over `listing-ai.ts` / `video-generator.ts`)

- `POST /api/inventory/[id]/listing-refine` → `{ mode:"field"|"global", field_name?, current_value?, instruction }`.
- `POST /api/inventory/[id]/listing-video` → builds the slideshow, sets `video_path`.

(If WS-L1 already added `listing-refine`, just consume it.)

## Do NOT

- Do not delete the Coach route/components (L6).
- Do not change the publish path (L5) or rubric (L4).

## Files

- Edit: `src/components/inventory/InventoryDetailPanel.tsx`, the lifecycle controls component,
  `src/components/inventory/*PictureGrid*`, `src/app/(app)/inventory/page.tsx`.
- Add: `src/app/api/inventory/[id]/listing-refine/route.ts`, `src/app/api/inventory/[id]/listing-video/route.ts`.
- Reuse (copy/adapt, don't import from the soon-deleted coach tree long-term): `GoogleResultsPasteZone`,
  `PhotoPasteZone`, `EvidenceBadge`, `ListingPreview`, types. (Temporary import is fine; L6 relocates/deletes.)

## Acceptance criteria

- [ ] Google screenshot paste, evidence/citations/compliance display, clipboard photo paste, per-field +
      global refine, video generation, and price-suggestion display all work **inside the inventory detail editor**.
- [ ] Refine + video go through the new inventory routes (not `/api/listing-coach/*`).
- [ ] No Coach capability is missing vs the old `/listing-coach` flow (enumerate parity in your report).
- [ ] `var(--ui-*)` only; `npm run build` passes; no new lint.

## Escalation triggers (STOP and ask)

- A Coach affordance depends on coach-only session/multipart state that can't be reproduced on an item.
- Clipboard paste conflicts with the existing PictureGrid drag-drop/reorder.

## Kickoff prompt

> Implement `documents/tickets/WS-L3_port-coach-ui.md`. Read it + **ADR-085 §3**, ADR-030, ADR-033,
> ADR-018; follow `.cursor/rules/implementer.mdc`. Port every Listing-Coach AI affordance (Google paste,
> evidence/citations/compliance, clipboard photo paste, per-field + global refine, video, price
> suggestion) into the inventory detail editor, adding `listing-refine`/`listing-video` inventory routes
> that wrap `listing-ai.ts`/`video-generator.ts`. Don't delete the Coach. List parity vs the old flow.
> Run `npm run build`; confirm each acceptance checkbox; STOP on any escalation trigger.
