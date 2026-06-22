# Ticket WS-D2 — Dashboard unpaid orders → payment reminders

> **Status: DONE — merged 2026-06-22.** Dashboard unpaid orders link to payment reminders.

| Field | Value |
|-------|-------|
| Status | **OPEN** — Tier 1, queue **#3** |
| Workstream | **D** — dashboard UX (owner req **1.h**). |
| Source ADR | **ADR-016**, **ADR-078** (payment reminders: manual-channel only), ADR-013/036 (payment-reminder letter). |
| Recommended model | Budget/mid model. |
| Complexity | Small. |
| Risk | Low — navigation/wiring only; compliance gate stays server-side. |
| Depends on | WS-C (done — Communications center + `/api/reports/payment-reminder/[orderId]`). |

---

## Problem

The dashboard **Unpaid orders** KPI links to `/orders` only. The owner wanted unpaid (especially
**shipped but unpaid manual orders**) to reach the **payment reminder** flow — letter/PDF generator
and send path — without hunting through order detail.

Communications already implements:
- Candidate query (manual + unpaid): `src/lib/communications.ts`
- Tab: `/communications` with payment reminder actions
- Per-order PDF: `GET /api/reports/payment-reminder/[orderId]`
- Send modal from order detail (`SendCommunicationModal`)

The dashboard does not surface this.

## Goal

From the dashboard **Needs attention → Unpaid orders** area, provide a **small accent text link**
(same pattern as "Record payment", "View report") that jumps the user into the payment-reminder
workflow with context preserved.

## Locked UX (implement exactly)

- Add link label: **"Payment reminders →"** (or **"Send payment reminders →"** if clearer).
- **Target:** `/communications` with query param that pre-selects the payment-reminder candidate list
  (e.g. `?messageType=payment_reminder` — add param handling on Communications page if missing).
- Show the link only when **eligible count > 0** (manual-channel, active, unpaid — same rules as
  `getCandidates("payment_reminder")`). Optionally show count in link text: `Payment reminders (3) →`.
- Do **not** bypass ADR-078: Etsy-channel orders must never appear in this path.
- Keep the existing KPI tile link to `/orders` for the main count; the new link is a **secondary**
  action on the same widget row (match `WidgetHeader` / `KpiTile` action slot pattern).

## What to build

1. **API (optional, preferred):** extend `GET /api/dashboard` or add a tiny field on existing KPI
   payload: `payment_reminder_candidates` count (server-side query mirroring communications
   candidates — do not duplicate business rules in the client).
2. **Dashboard UI:** secondary link on Unpaid orders KPI (or Finances/Needs attention row).
3. **Communications page:** if not already supported, read `messageType` query param on load and
   select the payment-reminder tab/filter.

## Do NOT

- Auto-send email from the dashboard (user must still preview/send in Communications or order detail).
- Relax manual-channel-only gate.

## Files

- Edit: `src/app/(app)/dashboard/page.tsx`, `src/lib/dashboard.ts` (count query),
  `src/app/(app)/communications/page.tsx` (query param, if needed).
- Reuse: `src/lib/communications.ts` candidate rules.

## Acceptance criteria

- [ ] Dashboard shows accent link when ≥1 payment-reminder-eligible order exists.
- [ ] Link opens Communications focused on payment reminders (or equivalent single-click path).
- [ ] Etsy/manual compliance unchanged; no new send path without preview.
- [ ] `var(--ui-*)` only; `npm run build` passes.

## Kickoff prompt

> Implement `documents/tickets/WS-D2_dashboard-unpaid-payment-reminder.md`. Add a secondary
> "Payment reminders →" link on the dashboard Unpaid orders KPI when manual unpaid candidates exist;
> deep-link to `/communications` with payment-reminder context. Server-side count; ADR-078 compliant.
> Run `npm run build`.
