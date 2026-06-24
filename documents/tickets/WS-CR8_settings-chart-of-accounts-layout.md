# Ticket WS-CR8 — Settings: reposition + tighten the Chart of Accounts section

| Field | Value |
|-------|-------|
| Status | **OPEN** — Tier 3 (UI polish) |
| Workstream | **Conformance Remediation** — owner request 2026-06-24. |
| Source ADR | ADR-034 (Settings layout), ADR-009 (chart of accounts). |
| Recommended model | Sonnet — layout/CSS. |
| Complexity | Small. |
| Risk | Low — presentation only, no data/logic change. |
| Priority | Low / cosmetic. |
| Depends on | — |

## Problem

On the **Settings** page, the **Chart of Accounts** (Accounting) section is poorly placed and too
wide/loose — its table horizontally scrolls.

## Goal (owner request)

1. **Reposition** the Chart of Accounts / Accounting section to sit **directly under Item Numbering
   and Order Numbering** in the Settings layout.
2. Make the Chart of Accounts **full width** (span the whole settings column / grid, not a narrow
   card).
3. **Compress the rows** as tightly as practical (denser vertical padding).
4. **Decrease the font size** of the table so it **fits with no horizontal scrolling** at normal
   desktop width.
5. General tightening to that effect ("etc.").

## Files

- `src/app/(app)/settings/page.tsx` — section ordering + grid placement (move the
  `ChartOfAccountsSection` mount to after Item/Order Numbering; give it a full-width container).
- `src/components/settings/ChartOfAccountsSection.tsx` — table density + font size; ensure the table
  fits without horizontal scroll (e.g. smaller text, tighter `px/py`, sensible column widths).

## Out of scope

- Changing chart-of-accounts data, GL rules, or any accounting logic.

## Acceptance criteria

- [ ] Chart of Accounts appears immediately below Item Numbering + Order Numbering.
- [ ] It renders full-width; the table has **no horizontal scroll** at standard desktop width.
- [ ] Rows are visibly more compact; font reduced; still legible.
- [ ] `npm run type-check` + `npm run build` pass; no other Settings section disturbed.

## Kickoff prompt

> Implement `documents/tickets/WS-CR8_settings-chart-of-accounts-layout.md`. In the Settings page,
> move the Chart of Accounts / Accounting section to just under Item Numbering and Order Numbering,
> make it full width, compress rows + shrink the table font so there is no horizontal scroll. Layout
> only — no data/logic changes.
