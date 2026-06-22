# Ticket WS-A — Activity coverage, deep-links, and deleted=no-link

| Field | Value |
|-------|-------|
| Status | **OPEN** — Tier 1, queue **#2** (partial: chips + deep links done; bulk report logging remains) |
| Workstream | A (full activity coverage + deep-links) |
| Source ADR(s) | **ADR-037 §A2/§A3** (authoritative). Context: ADR-035 (deep-link targets), ADR-018 (API), ADR-039/074/076/077 (action sources). |
| Recommended model | **T2 — Sonnet (`claude-4.6-sonnet-medium-thinking`)**. Many small edits across routes; needs care to stay in the canonical enum. |
| Complexity | Medium (breadth, not depth — repetitive `logActivity()` calls + one helper) |
| Risk | Low–Medium (no schema/enum/settings change; touches many mutating routes) |

---

## Goal

Make every mutating route for **receipts, expenses, tax payments, and reports** call
`logActivity()` with the **canonical** `entity_type`/`action` values. This fills the filter chips
added earlier (Receipts, Expenses, Reports, etc.) with real data and completes ADR-037 §A2.

> **Already done (do NOT redo):**
> - A4 (filter chips) + A5 (comma-separated `entity_type` API filter).
> - **§A3 deep-link map + deleted=no-link** — `activityEntityHref(entityType, entityId, action)` in
>   `src/lib/activity-display.ts` already links receipt/vendor/expense/tax_payment/shipping and
>   returns null for `*.deleted` rows and config/sync/backup/system/report. Both call sites pass
>   `entry.action`.
>
> This ticket is **only** §A2 (logging coverage). Once a route logs with the right
> `entity_type`/`entity_id`, its rows will deep-link automatically via the existing helper.
>
> **Open follow-up:** `address` rows do not yet link, because the address routes log
> `entityId = address id` rather than the parent `customer_id`. If you want address rows to link to
> `/customers?customerId=…`, change the address logging to pass the parent customer id (and add the
> `address` case back to `activityEntityHref`). Otherwise leave address unlinked.

## Context / current state

- `logActivity({ action, entityType, entityId, entityLabel, detail, source })` lives in
  `src/lib/activity-log.ts`. Call it **after** a successful mutation (it is fire-and-forget and
  already swallows its own errors — never let it break the request).
- Existing routes that already log (copy their pattern): `src/app/api/vendors/route.ts`,
  `src/app/api/vendors/[id]/route.ts`, `src/app/api/orders/route.ts`,
  `src/app/api/orders/[order_id]/shipping-buy/route.ts`.
- The deep-link helper is `activityEntityHref(entityType, entityId)` in
  `src/lib/activity-display.ts`. It currently handles only `order`, `inventory`, `customer`.
- **Routes confirmed MISSING `logActivity`** (verified this session):
  - Receipts: `src/app/api/receipts/route.ts`, `receipts/[id]/route.ts`,
    `receipts/[id]/items/[itemId]/route.ts`, `receipts/ocr/route.ts`
  - Expenses: `src/app/api/expenses/route.ts`, `expenses/[id]/route.ts`,
    `expenses/[id]/payments/route.ts`, `expenses/scan/route.ts`, `expenses/bills/route.ts`
  - Tax payments: `src/app/api/tax-payments/route.ts`, `tax-payments/[id]/route.ts`
  - Reports: `src/app/api/reports/**/route.ts` (the ones that actually generate an artifact)

## Canonical values (from `.cursorrules` + ADR-037 §A2 — DO NOT invent new ones)

| Entity | entity_type | Actions (action / when) |
|--------|-------------|-------------------------|
| Receipt | `receipt` | `receipt.created`, `receipt.updated`, `receipt.deleted`, `receipt.scanned` (detail `{ item_count }`), `receipt.item_linked` (detail `{ inventory_id }`), `receipt.item_unlinked` |
| Expense | `expense` | `expense.created`, `expense.updated`, `expense.deleted`, `expense.payment_recorded` (detail `{ amount }`), `expense.scanned` |
| Tax payment | `tax_payment` | `tax_payment.created`, `tax_payment.updated`, `tax_payment.deleted` |
| Report | `report` | `report.generated` (detail `{ report_name, format }`); `entity_id` is **null** |

- `source` is `user` for all of these (default; omit or pass `"user"`).
- `entityLabel`: a short human label (e.g. receipt vendor name, expense description, payee, report
  name) so the Activity log "Record" column is meaningful.

## Files (touch only these)

1. The route files listed under "Routes confirmed MISSING" above — add a `logActivity()` call after
   each successful create/update/delete/scan/link/pay/generate.

> Do **not** edit `src/lib/activity-display.ts` — the deep-link helper is already complete (see the
> "Already done" note above). Linking happens automatically once routes log with the correct
> `entity_type` + `entity_id`.
>
> If a route needs a new entity_type or action **not** in the table above, **STOP and ask** — the
> enum is closed (canonical in `.cursorrules`).

## Steps

1. **Add logging (per route):** after the DB mutation succeeds and before returning the response,
   call `logActivity` with the matching row from the canonical table. Examples:
   - `POST /api/receipts` success → `logActivity({ action: "receipt.created", entityType: "receipt", entityId: id, entityLabel: vendorName })`
   - `DELETE /api/expenses/[id]` success → `logActivity({ action: "expense.deleted", entityType: "expense", entityId: id, entityLabel: description })`
   - `POST /api/expenses/[id]/payments` → `logActivity({ action: "expense.payment_recorded", entityType: "expense", entityId, entityLabel, detail: { amount } })`
   - Report generation route (after artifact built) → `logActivity({ action: "report.generated", entityType: "report", entityLabel: reportName, detail: { report_name, format } })` (no `entityId`).
   - Match each route's actual handler verbs (POST/PATCH/DELETE). One route file may have several.
   - Pass a real `entityId` (the record's id) so the existing deep-link helper can link the row.
     `report.generated` is the only one with no `entityId`.
2. Run `npm run build`; fix any type/lint errors you introduced.

## Acceptance criteria

- [ ] Creating/updating/deleting a receipt, expense, tax payment, and generating a report each
      produce an Activity log row with the **canonical** `entity_type`/`action`.
- [ ] The Activity log filter chips **Receipts**, **Expenses**, and **Reports** now return matching
      rows after those actions occur.
- [ ] Receipt/vendor/expense/tax_payment/shipping/address rows are **clickable** and deep-link to
      the correct tab + query param (per ADR-035).
- [ ] Rows whose action is a `*.deleted` (or `customer.batch_deleted`) render with **no link**.
- [ ] `report.generated` rows show a label but are **not** links.
- [ ] `npm run build` passes; no new lint errors; no `any`; no hardcoded hex; standard API error
      envelope preserved (don't change response shapes).

## Out of scope (do NOT do here)

- Filter chips + multi-type API filter (A4/A5) — already done.
- Communications/outreach logging (`communication` entity_type) → **WS-C**.
- Low-quality inventory widget → **WS-D**.
- Any schema, enum, or settings change. New `/shipping` route → **WS-F**.

## Escalation triggers (STOP and ask)

- A route needs an `entity_type`/`action` not in the canonical table above.
- You can't get a stable `entityId`/`entityLabel` without changing the route's response or query.
- Changing `activityEntityHref`'s signature would ripple beyond its 2 known call sites.
- A report route doesn't clearly "generate an artifact" (skip pure read/preview endpoints — only
  log routes that produce a report document).

## How to verify (manual)

1. `npm run build` then `npm run start`.
2. Create then delete an expense; open the dashboard Activity log → filter **Expenses** → see a
   created row (linked) and a deleted row (no link).
3. Create a receipt → filter **Receipts** → row links to `/receipts?receiptId=…`.
4. Generate any report → filter **Reports** → see a `report.generated` row (no link).

---

## Kickoff prompt (paste into a new chat on the Recommended model)

> Implement ticket `documents/tickets/WS-A_activity-coverage-deeplinks.md`. Read that ticket and
> **ADR-037 §A2/§A3** (`documents/adr/0037-activity-log-and-audit-trail.md`) first, and follow
> `.cursor/rules/implementer.mdc`. Use ONLY the canonical `entity_type`/`action` values in the
> ticket. Only touch the files the ticket lists. When done, run `npm run build`, report what you
> changed, and confirm each acceptance-criteria checkbox. STOP and ask me if you hit any escalation
> trigger.
