# Tickets — remaining work backlog

**Last updated:** 2026-06-22  
**Branch:** `feature/final-system-completion`

This folder holds **implementation tickets** for Etsy Sales Manager. Only **open** tickets live
in the folder root. **Completed** tickets are in [`completed/`](completed/) for reference.

---

## How to use

1. Work **Tier 1** tickets in order (they close the owner's original requirements).
2. Open the ticket `.md` file; paste its **Kickoff prompt** into a new agent chat.
3. When a ticket is done: `npm run build`, verify acceptance criteria, move the file to
   `completed/`, add a `> **Status: DONE — …**` banner at the top, update this README.

---

## Tier 1 — Required (finish the original request)

Execute in this order.

| # | Ticket | File | Closes | Effort |
|---|--------|------|--------|--------|
| 1 | **WS-D1** | [WS-D1_low-quality-widget-finish.md](WS-D1_low-quality-widget-finish.md) | Dashboard §1.f — low-quality inventory scroll list | Small |
| 2 | **WS-A** | [WS-A_activity-coverage-deeplinks.md](WS-A_activity-coverage-deeplinks.md) | Dashboard §1.c/d — activity logging (bulk reports, etc.) | Medium |
| 3 | **WS-D2** | [WS-D2_dashboard-unpaid-payment-reminder.md](WS-D2_dashboard-unpaid-payment-reminder.md) | Dashboard §1.h — unpaid → payment reminders | Small |
| 4 | **WS-D3** | [WS-D3_dashboard-shipment-split-kpi.md](WS-D3_dashboard-shipment-split-kpi.md) | Dashboard §1.i — split awaiting-shipment KPI | Small |
| 5 | **WS-E6a** | [WS-E6a_orders-create-dirty-guard.md](WS-E6a_orders-create-dirty-guard.md) | Forms §1.5 — Orders create dirty guard | Small |
| 6 | **WS-E6b** | [WS-E6b_orders-subaction-draft-merge.md](WS-E6b_orders-subaction-draft-merge.md) | Forms §1.5 — preserve draft on order sub-actions | Medium |
| 7 | **WS-A1** | [WS-A1_address-activity-deeplink.md](WS-A1_address-activity-deeplink.md) | Dashboard §1.c — address rows link to customer | Small |

**When Tier 1 is done:** original requirements §1, §1.5, §2, §3, and §10 are complete.

---

## Tier 2 — Recommended polish

| # | Ticket | File | Why |
|---|--------|------|-----|
| 8 | **WS-L4a** | [WS-L4a_fast-score-memoization.md](WS-L4a_fast-score-memoization.md) | Inventory list quality-sort performance |
| 9 | **WS-L4b** | [WS-L4b_cached-score-drift.md](WS-L4b_cached-score-drift.md) | Don't show stale cached scores after drift |

---

## Tier 3 — Backlog (later sprint)

Not required for the original scope; track when capacity allows.

| Ticket | File | Topic |
|--------|------|-------|
| **WS-061** | [WS-061_mobile-responsive-layout.md](WS-061_mobile-responsive-layout.md) | Mobile layout (ADR-061) |
| **WS-MIGRATE** | [WS-MIGRATE_idempotent-migrations.md](WS-MIGRATE_idempotent-migrations.md) | Idempotent migration runner |
| **WS-RCPTIMG** | [WS-RCPTIMG_receipt-image-persistence.md](WS-RCPTIMG_receipt-image-persistence.md) | Persist scanned receipt images |

---

## Already completed (archive)

All implemented workstreams are in [`completed/`](completed/). Do **not** re-run unless regressions appear.

| Area | Tickets |
|------|---------|
| Dashboard activity layout | WS-B |
| Communications | WS-C |
| SEMS forms | WS-E1–E6 |
| Shipping module | WS-F |
| Listing lifecycle + quality | WS-G1–G3 |
| Listing consolidation | WS-L1–L6, WS-L1a |
| Publish re-gate | WS-L5 |
| Single quality engine | WS-L4 |
| Terminology | WS-LABEL |
| Threshold 85 | WS-THRESH |
| Economy AI lane | WS-AICOST |
| Low-quality widget (partial) | WS-D → finish with **WS-D1** |

See [`completed/README.md`](completed/README.md) for the full archived list.

---

## Requirement → ticket map

| Owner section | Topic | Status | Ticket(s) |
|---------------|-------|--------|-----------|
| **§1 Dashboard** | Recent Activity 25 / 1:3–2:3 layout | Done | WS-B |
| | Single-spaced activity rows | Done | WS-B |
| | Activity coverage + deep links | Open | WS-A, WS-A1 |
| | Filter chips | Done | WS-B (+ WS-A for data) |
| | Low-quality inventory list | Open | WS-D1 |
| | Record payment link style | Done | — |
| | Unpaid → payment reminder | Open | WS-D2 |
| | Awaiting shipment split | Open | WS-D3 |
| **§1.5 Forms** | SEMS list/editor/guard | Done | WS-E1–E6 |
| | Orders create guard | Open | WS-E6a |
| | Orders sub-action draft merge | Open | WS-E6b |
| **§2 Sales/Shipping** | Shipping top-level tab | Done | WS-F |
| **§3 Inventory** | Unified listing lifecycle | Done | WS-G*, WS-L* |
| **§10 New** | Shot list | Done | WS-G1 / ADR-083 |
| | Dimension annotation | Done | WS-G2 / ADR-084 |

---

## Adding tickets

Use the section order from **WS-B** or **WS-E6a**: metadata table, Goal, locked decisions, Files,
Acceptance criteria, Escalation triggers, Kickoff prompt. Update this README when adding or closing.
