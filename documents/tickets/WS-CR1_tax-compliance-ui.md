# Ticket WS-CR1 — Tax compliance UI: dashboard badge + Settings inputs (C22)

> **Status: DONE + VERIFIED 2026-06-26** — backend schedule-driven nag (2be8267) + Settings inputs + persistent dashboard badge (88a0fb7). Live-verified: badge fires at $0 balance (due_soon/overdue); Settings persist. CT facts recorded below.

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

## CT specifics — confirmed by owner 2026-06-26 (DRS)

The operator-entered schedule model is correct; these are the real CT facts to default/label
toward (we still do NOT hardcode a calendar — the owner enters dates):

- **Rate:** state sales tax **6.35%** (`tax.default_rate`).
- **Form / platform:** **Form OS-114**, e-filed via the **myconneCT** portal.
- **Due date rule:** by the **last day of the month following the reporting period**
  (weekend/holiday → next business day).
- **Frequency:** DRS-assigned **Monthly / Quarterly / Annually** (matches the 3 select options).
- **Zero returns:** required **even if no tax is owed or no sales were made** — this validates
  the **schedule-driven** `filing_status` (the badge nags at $0). ✔
- **Penalty:** **$50 or 15% of tax due (greater)** + **1%/month** interest — worth surfacing
  in the nag copy to make the stakes concrete.

Possible follow-ups (not required now): default `tax.default_rate` to 6.35%; add helper text
(OS-114 / myconneCT) by the inputs; optionally auto-suggest `next_filing_due_date`.

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
