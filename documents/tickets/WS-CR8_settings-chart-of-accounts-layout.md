# Ticket WS-CR8 — Settings: reposition + tighten the Chart of Accounts section

> **Status: DONE (code) 2026-06-26** — Sonnet; commit 61f9262. COA/GL moved under Item+Order Numbering, full-width (lg:col-span-3), table-fixed text-xs + truncate (no h-scroll); type-check + build pass.

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

On the **Settings** page, the **Chart of Accounts** and **GL Transaction Rules** (Accounting)
tables are poorly placed and too wide/loose — they horizontally scroll.

## Goal (owner request)

1. **Reposition** the Chart of Accounts / Accounting section to sit **directly under Item Numbering
   and Order Numbering** in the Settings layout.
2. Make **both the Chart of Accounts and the GL Transaction Rules** tables **full width** (span the
   whole settings column / grid, not a narrow card).
3. **Compress the rows** as tightly as practical (denser vertical padding) — both tables.
4. **Decrease the font size** of both tables so they **fit with no horizontal scrolling** at normal
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

- [ ] Chart of Accounts (+ GL Transaction Rules) appears immediately below Item + Order Numbering.
- [ ] **Both** the Chart of Accounts and GL Transaction Rules tables render full-width with **no
      horizontal scroll** at standard desktop width.
- [ ] Rows are visibly more compact; font reduced; still legible.
- [ ] `npm run type-check` + `npm run build` pass; no other Settings section disturbed.

## Kickoff prompt

> Implement `documents/tickets/WS-CR8_settings-chart-of-accounts-layout.md`. In the Settings page,
> move the Chart of Accounts / Accounting section (Chart of Accounts **and** GL Transaction Rules) to
> just under Item Numbering and Order Numbering; make both tables full width, compress rows + shrink
> the font so there is no horizontal scroll. Layout only — no data/logic changes.
