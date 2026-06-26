# Ticket WS-CR19 — Remove the per-field "Fix" buttons on listing fields (redundant)

| Field | Value |
|-------|-------|
| Status | **OPEN** — Tier 2 (UX cleanup) |
| Workstream | **Conformance Remediation** — owner request 2026-06-26. |
| Source ADR | ADR-089 (remediation cycle), WS-L3 (global refine), WS-CR15. |
| Recommended model | Sonnet — deletion + cleanup. |
| Complexity | Small. |
| Risk | Low — removing UI; keep the other two refine paths. |
| Depends on | WS-CR15 (per-row Fix) already provides findings-driven fixing. |

## Problem

Every listing field below the quality evaluation carries its own **"Fix"** button
(9 instances of `FieldFixButton` in
[InventoryDetailPanel.tsx](../../src/components/inventory/InventoryDetailPanel.tsx) at
lines ~1867–2049). This is now redundant: AI fixing is already available three other
ways that are clearer and findings-driven:

1. **Remediation cycle** — bulk "Cycle again" / "Advance AI" (ADR-089).
2. **Per-row Fix** in the quality analysis (WS-CR15) — fixes the specific flagged field.
3. **Global AI refine** — whole-listing, feedback-driven (WS-L3).

A "Fix" on every field is clutter and duplicates (2)/(3).

## Goal

Remove the per-field `FieldFixButton` from the listing fields.

- Delete all 9 `<FieldFixButton .../>` usages (lines ~1867–2049) and the now-unused
  `FieldFixButton` component definition (~line 229) and any imports/state it alone used.
- **KEEP** the **Global AI refine** block (WS-L3, ~line 2062 "Global AI refine") — that is
  the primary "AI fixes most of it" path the owner wants to retain.
- **KEEP** WS-CR15's `RowFixButton` in `RemediationCyclePanel.tsx` (separate component;
  findings-driven fixing stays).
- The field rows keep their normal editing (the fields remain manually editable); only the
  AI "Fix" affordance per field is removed.

## Out of scope

- Changing the cycle, the per-row Fix, or the global refine.

## Acceptance criteria

- [ ] No per-field "Fix" buttons remain on the listing fields.
- [ ] Global AI refine and the remediation cycle (incl. per-row Fix) still work.
- [ ] No dead code / unused imports left from `FieldFixButton`.
- [ ] `npm run type-check` + `npm run build` pass.

## Kickoff prompt

> Implement `documents/tickets/WS-CR19_remove-per-field-fix-buttons.md`. In
> `src/components/inventory/InventoryDetailPanel.tsx`, remove all 9 `FieldFixButton`
> usages (~lines 1867–2049) and delete the unused `FieldFixButton` component (~line 229)
> plus any imports/state used only by it. KEEP the "Global AI refine" block (~line 2062)
> and do not touch `RemediationCyclePanel.tsx`. Fields stay manually editable. Run
> type-check + build.
