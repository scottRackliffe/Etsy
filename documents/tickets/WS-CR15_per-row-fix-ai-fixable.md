# Ticket WS-CR15 — Per-row "Fix" button on AI-fixable remediation items

| Field | Value |
|-------|-------|
| Status | **OPEN** — Tier 2 (UX) |
| Workstream | **Conformance Remediation** — live-test finding 2026-06-26. |
| Source ADR | ADR-089 (remediation cycle), WS-L3 (single-field refine). |
| Recommended model | Sonnet — UI wiring, reuses an existing route. |
| Complexity | Small. |
| Risk | Low — additive button; no new endpoint. |
| Depends on | Reuses `/api/inventory/[id]/listing-refine` (already built). |

## Problem

In the remediation cycle panel, the **"Remaining AI-fixable"** rows render as plain
text with **no action button** ([RemediationCyclePanel.tsx:221-228](../../src/components/inventory/RemediationCyclePanel.tsx)),
while the **"Needs your attention"** rows each get a **"Fix →"** link
([:251-257](../../src/components/inventory/RemediationCyclePanel.tsx)). That reads
backwards: the items the **AI** can fix have no button, the items the **user** must
fix do. (The "Fix →" on user rows is only a deep-link to the field, not an AI fix.)

Today the only way to fix the AI-fixable items is the bulk **Cycle again / Advance AI**
buttons at the top, or the separate per-field **Fix** button below the panel.

## Goal

Add a per-row **"Fix"** button on each **AI-fixable** remediation item that runs the
**single-field refine** for that item's `ref`, reusing the existing
`FieldFixButton` logic ([InventoryDetailPanel.tsx:229-302](../../src/components/inventory/InventoryDetailPanel.tsx)
→ `POST /api/inventory/[id]/listing-refine`, reads `data.fields[fieldName]`).

- Map `ref` → field: `listing_title`, `listing_description`, `listing_tags`
  (the `AI_FIXABLE_REFS` set; `sale_revenue` has no refine field — omit its button).
- On success, update the draft for that field and re-score (same flow as the bulk cycle).
- Keep the bulk **Cycle again / Advance AI** buttons unchanged.

## Out of scope

- Changing the user-action "Fix →" deep-links (those are correct as navigation).

## Acceptance criteria

- [ ] Each AI-fixable row (title/description/tags) shows a **Fix** button that refines
      only that field and updates the listing in place.
- [ ] Visual parity: both groups now have a right-aligned action affordance.
- [ ] No new endpoint; reuses `listing-refine`.
- [ ] `npm run type-check` + `npm run build` pass.

## Kickoff prompt

> Implement `documents/tickets/WS-CR15_per-row-fix-ai-fixable.md`. In
> `RemediationCyclePanel.tsx`, add a per-row "Fix" button to each AI-fixable item that
> calls `POST /api/inventory/[id]/listing-refine` for the row's field (ref →
> listing_title/description/tags), mirroring `FieldFixButton` in InventoryDetailPanel.tsx.
> Update the draft + re-score on success. Don't touch the user-action "Fix →" links.
