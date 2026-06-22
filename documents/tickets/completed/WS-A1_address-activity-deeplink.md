# Ticket WS-A1 — Address activity rows deep-link to customer

> **Status: DONE — merged 2026-06-22.** Address activity rows deep-link to the parent customer.

| Field | Value |
|-------|-------|
| Status | **OPEN** — Tier 1, queue **#7** |
| Workstream | **A** — follow-on to WS-A. |
| Source ADR | **ADR-037 §A3**, **ADR-035** (deep links). |
| Recommended model | Budget model — small logging + helper change. |
| Complexity | Small. |
| Risk | Low. |
| Depends on | WS-A core logging (can run after or with WS-A). |

---

## Problem

WS-A ticket notes an open follow-up: address CRUD routes log `entity_type = 'address'` with
`entity_id = address id`, but `activityEntityHref` does not link address rows — users see the
activity but cannot click through to the customer record.

## Goal

Address create/update/delete rows in Recent Activity and Activity Log should deep-link to
`/customers?customerId=<parent_customer_id>` (ADR-035).

## What to build

1. **Logging:** in address API routes (`src/app/api/addresses/**`, customer address sub-routes),
   pass `entityId: customer_id` (parent) when logging address mutations **or** keep address id in
   `detail_json` and pass customer id as `entityId` — pick one approach; `entityId` must be the
   customer for the href helper.
2. **`activityEntityHref`:** add `address` case → `/customers?customerId=${entityId}` when
   `entityId` is the customer id (document in ADR-037 if you change logging shape).
3. **Deleted addresses:** still no link if action is `*.deleted` (existing rule).

## Do NOT

- Add a standalone `/addresses` tab.
- Invent new entity_type values.

## Files

- Edit: address route(s) that call `logActivity`, `src/lib/activity-display.ts`.
- Optional: one-line ADR-037 §A3 note.

## Acceptance criteria

- [ ] Address activity rows link to the owning customer detail.
- [ ] Deleted address rows remain unlinked.
- [ ] `npm run build` passes.

## Kickoff prompt

> Implement `documents/tickets/WS-A1_address-activity-deeplink.md`. Make address activity rows link
> to `/customers?customerId=…`. Adjust logging or `activityEntityHref` consistently. Run build.
