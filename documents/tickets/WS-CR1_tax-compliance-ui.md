# Ticket WS-CR1 — Tax compliance UI: dashboard badge + Settings inputs (C22)

| Field | Value |
|-------|-------|
| Status | **OPEN** — Tier 1 (penalty risk) |
| Workstream | **Conformance Remediation** — WP4 finish (2026-06-23/24 audit). |
| Source ADR | **ADR-039 §7** (on-time filing focus), ADR-034 (settings). |
| Recommended model | Sonnet — well-defined UI; backend done. |
| Complexity | Small. |
| Risk | Low — additive UI; data layer already shipped. |
| Priority | **High** (CT late-filing penalties). |
| Depends on | WP4 backend (done): `getTaxComplianceStatus()`, `getDashboardStats().tax_compliance`. |

## Problem

The tax on-time-filing focus (C22) was built at the data/logic layer only: `getTaxComplianceStatus()`
computes `filing_status`/`days_until_due`/`balance_due` and it's exposed via
`/api/tax-payments/summary` + `getDashboardStats().tax_compliance`. **Nothing renders it**, so the
operator can't see "tax due / overdue" or set the filing schedule.

## Goal

- **Dashboard** "Needs attention" surface shows a tax badge when money is owed: status
  (`due_soon`/`overdue`), `balance_due`, and `days_until_due` (reads `tax_compliance`).
- **Settings → Tax settings** gains three inputs (mirror the existing `tax.default_rate` field):
  `tax.next_filing_due_date` (date), `tax.filing_frequency` (monthly/quarterly/annual),
  `tax.filing_reminder_days` (number, default 14).

## Approach (doc-first)

1. Read ADR-039 §7 for the field semantics + status values.
2. Add the three Settings inputs (existing tax section save pattern).
3. Add the dashboard badge in the "Needs attention" area, gated on `tax_compliance.filing_status`
   being `due_soon` or `overdue`.

## Out of scope

- Auto-filing or e-file integration; per-jurisdiction calendars (schedule is operator-entered).

## Acceptance criteria

- [ ] Settings persists the 3 keys; reload shows saved values.
- [ ] Dashboard shows the badge only when owed + due soon/overdue; hidden when current.
- [ ] `npm run type-check` + `npm run build` pass.

## Kickoff prompt

> Implement `documents/tickets/WS-CR1_tax-compliance-ui.md`. Backend is done
> (`getTaxComplianceStatus`, dashboard `tax_compliance`). Add the 3 tax Settings inputs and the
> dashboard "Needs attention" tax badge. Read ADR-039 §7. No backend changes.
