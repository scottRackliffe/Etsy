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

## MA specifics — confirmed by owner 2026-06-26 (Massachusetts DOR)

Owner's state is **Massachusetts** (an earlier lookup pulled Connecticut by mistake). The
feature stays **jurisdiction-agnostic** (no state calendar in code; owner enters values); these
are the MA facts to default/label toward:

- **Rate:** MA statewide sales tax is **6.25%** (`tax.default_rate`) — _owner to confirm; not in
  the source paste, but MA is a flat 6.25% statewide._
- **Platform / filing:** electronic via **MassTaxConnect** (commonly **Form ST-9** for sales tax).
- **Due date rule:** by the **30th of the month following** the filing period.
- **Frequency (DOR-assigned by annual liability):** **Annual** ≤ $100/yr · **Quarterly**
  $101–$1,200/yr · **Monthly** > $1,200/yr. (Matches the 3 select options; thresholds are good
  helper text.)
- **Zero returns:** a **"zero return" is required even with $0 due** — validates the
  **schedule-driven** `filing_status` (badge nags at $0). ✔
- **Advance payment:** if cumulative MA tax liability > **$150,000** in the prior year, advance
  payments are required before the final return (likely N/A for a small shop — note only).
- **Records:** retain sales-tax records **3 years**.
- **Penalty:** specific MA late penalties/interest **not in the source** — confirm before putting
  figures in the nag copy.

Optional follow-ups: default `tax.default_rate` to 6.25%; helper text (MassTaxConnect / ST-9 /
due 30th / zero-return required); frequency-threshold hint. **Do not hardcode MA in code.**

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
