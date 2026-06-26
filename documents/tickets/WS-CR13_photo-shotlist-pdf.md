# Ticket WS-CR13 — Printable photo shot-list PDF (what to shoot + what each photo must show)

> **Status: DONE (code) 2026-06-26** — Sonnet; commit 95f9a46. GET shot-list-pdf route (pdfkit) + Download PDF button; type-check + build pass.

| Field | Value |
|-------|-------|
| Status | **OPEN** — Tier 2 |
| Workstream | **Conformance Remediation** — owner request / live-test finding 2026-06-24. |
| Source ADR | **ADR-083** (AI shot-list generation), ADR-013 (PDF report output), ADR-082 (photo rubric). |
| Recommended model | Sonnet — report/PDF generation. |
| Complexity | Small–Medium. |
| Risk | Low. |
| Priority | Tier 2 — needed to actually take the required photos. |
| Depends on | Shot-list data (ADR-083, `GET /api/inventory/[id]/shot-list`). |

## Problem

The AI generates a per-item **photo shot-list** — which photos to take, tailored to the item
(hero, angle, detail, backstamp, scale, imperfection, underside, measurement, etc.), and the quality
rubric flags the missing ones ("no scale photo", "no measurement photo with a ruler", "missing
alternate angles"). But there is **no printable/exportable version**. The operator wants a **PDF they
can take to the photography step** that lists **each required photo and the exact detail it must
show**.

## Goal

A **per-item "Photo shot list" PDF** (and/or print view), consistent with the other PDF reports
(ADR-013):
- One entry per **required shot**, each with: the **shot name/type**, **what it must show** (a clear
  one-line purpose — e.g. "Scale photo: item beside a ruler/coin so buyers judge size";
  "Measurement photo: ruler aligned to longest dimension"; "Underside/backstamp: any maker marks"),
  and **captured / still-needed** status.
- Item header (item number + name/identification) so the printout is identifiable on the bench.
- Generated from the existing shot-list (`GET /api/inventory/[id]/shot-list` / `shot_list_json`,
  ADR-083). **Confirm each shot carries a human "what to show" description** — if the shot-list
  generation doesn't already produce per-shot descriptions, add them there (ADR-083) so the PDF has
  the detail.
- Surfaced from the inventory detail / listing flow (a "Print shot list" / "Download PDF" action
  near the photos / shot-list panel).

## Acceptance criteria

- [ ] A per-item shot-list PDF lists each required photo with a clear "what it must show" line and
      captured/needed status.
- [ ] Item is identifiable (number + name) on the printout.
- [ ] Uses the shared PDF pipeline (ADR-013); reachable from the item's listing/photo UI.
- [ ] `npm run type-check` + `npm run build` pass.

## Kickoff prompt

> Implement `documents/tickets/WS-CR13_photo-shotlist-pdf.md`. Build a per-item "Photo shot list" PDF
> from the existing shot-list (ADR-083, `/api/inventory/[id]/shot-list`), one entry per required shot
> with shot name + a clear "what it must show" description + captured/needed status, using the shared
> PDF report pipeline (ADR-013). If the shot-list lacks per-shot descriptions, add them in the
> shot-list generation. Add a "Print/Download shot list" action in the item's photo/listing UI.
