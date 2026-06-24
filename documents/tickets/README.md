# Tickets — remaining work backlog

**Last updated:** 2026-06-24  
**Branch:** `docs/adr-audit-remediation` (conformance-remediation follow-ups; was
`feature/final-system-completion`)

This folder holds **implementation tickets** for AiCE. Only **open** tickets live
in the folder root. **Completed** tickets are in [`completed/`](completed/) for reference.

---

## How to use

1. Work **Tier 1** tickets in order (they close the owner's original requirements).
2. Open the ticket `.md` file; paste its **Kickoff prompt** into a new agent chat.
3. When a ticket is done: `npm run build`, verify acceptance criteria, move the file to
   `completed/`, add a `> **Status: DONE — …**` banner at the top, update this README.

---

## Open tickets

The **WS-CR** workstream holds the follow-ups from the 2026-06-23/24 code↔docs conformance audit
(`documents/CODE_DOC_CONFORMANCE_AUDIT_2026-06-23.md`). The audit's findings were mostly executed
already (WP1–WP7); these tickets are the **remaining builds**.

| Ticket | File | Topic | Tier |
|--------|------|-------|------|
| **WS-CR1** | [WS-CR1_tax-compliance-ui.md](WS-CR1_tax-compliance-ui.md) | Tax compliance UI — dashboard badge + Settings inputs (C22) | **Tier 1 (penalty risk)** |
| **WS-CR2** | [WS-CR2_bootstrap-retirement.md](WS-CR2_bootstrap-retirement.md) | Retire runtime bootstrap; migrations as sole schema source (ADR-087) | Tier 2 |
| **WS-CR3** | [WS-CR3_remediation-autocycle.md](WS-CR3_remediation-autocycle.md) | Remediation auto-cycle (stall→escalate) — evidence-gated (D1) | Tier 3 / backlog |
| **WS-CR4** | [WS-CR4_user-docs-remediation-cycle.md](WS-CR4_user-docs-remediation-cycle.md) | User-facing help for the remediation cycle | Tier 3 / optional |
| **WS-061** | [WS-061_mobile-responsive-layout.md](WS-061_mobile-responsive-layout.md) | Mobile layout (ADR-061) | Backlog (later sprint) |

### Ops / verification (not tickets — operator steps)

- **`npm run db:migrate`** on the live dev DB — applies migrations 018/019 (drops dead schema;
  tested on a copy only).
- **`npm run dev` smoke-test** — confirm live behaviour the headless build couldn't: the remediation
  cycle actually lifts scores (WP5), AI-key encryption (WP1), and DB init (WP3).

---

## Already completed (archive)

All implemented workstreams are in [`completed/`](completed/). Do **not** re-run unless regressions appear.

| Area | Tickets |
|------|---------|
| Dashboard activity layout | WS-B |
| Dashboard activity coverage + deep-links | WS-A, WS-A1 |
| Dashboard widgets/KPIs | WS-D, WS-D1, WS-D2, WS-D3 |
| Communications | WS-C |
| SEMS forms | WS-E1–E6, WS-E6a, WS-E6b |
| Shipping module | WS-F |
| Listing lifecycle + quality | WS-G1–G3 |
| Listing consolidation | WS-L1–L6, WS-L1a |
| Publish re-gate | WS-L5 |
| Single quality engine | WS-L4, WS-L4a, WS-L4b |
| Terminology | WS-LABEL |
| Threshold 85 | WS-THRESH |
| Economy AI lane | WS-AICOST |
| Idempotent migrations | WS-MIGRATE |
| Receipt image persistence | WS-RCPTIMG |

See [`completed/README.md`](completed/README.md) for the full archived list.

---

## Requirement → ticket map

| Owner section | Topic | Status | Ticket(s) |
|---------------|-------|--------|-----------|
| **§1 Dashboard** | Recent Activity 25 / 1:3–2:3 layout | Done | WS-B |
| | Single-spaced activity rows | Done | WS-B |
| | Activity coverage + deep links | Done | WS-A, WS-A1 |
| | Filter chips | Done | WS-B (+ WS-A for data) |
| | Low-quality inventory list | Done | WS-D1 |
| | Record payment link style | Done | — |
| | Unpaid → payment reminder | Done | WS-D2 |
| | Awaiting shipment split | Done | WS-D3 |
| **§1.5 Forms** | SEMS list/editor/guard | Done | WS-E1–E6 |
| | Orders create guard | Done | WS-E6a |
| | Orders sub-action draft merge | Done | WS-E6b |
| **§2 Sales/Shipping** | Shipping top-level tab | Done | WS-F |
| **§3 Inventory** | Unified listing lifecycle | Done | WS-G*, WS-L* |
| **§10 New** | Shot list | Done | WS-G1 / ADR-083 |
| | Dimension annotation | Done | WS-G2 / ADR-084 |

---

## Adding tickets

Use the section order from **WS-B** or **WS-E6a**: metadata table, Goal, locked decisions, Files,
Acceptance criteria, Escalation triggers, Kickoff prompt. Update this README when adding or closing.
