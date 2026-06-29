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

Three tickets remain open. All other work is archived in [`completed/`](completed/).

| Ticket | File | Topic | Status |
|--------|------|-------|--------|
| **WS-CR3** | [WS-CR3_remediation-autocycle.md](WS-CR3_remediation-autocycle.md) | Remediation auto-cycle (stall→escalate) — evidence-gated (D1) | Backlog — needs live-cycle evidence before thresholds |
| **WS-061** | [WS-061_mobile-responsive-layout.md](WS-061_mobile-responsive-layout.md) | Mobile layout (ADR-061) | **ON HOLD** — last; owner sign-off on all other work |
| **WS-CR20** | [WS-CR20_ai-generated-scale-and-lifestyle-photos.md](WS-CR20_ai-generated-scale-and-lifestyle-photos.md) | AI-generated scale + lifestyle photos | **ON HOLD** — future / tech-gated (fidelity + Etsy authenticity) |

**WS-CR1–CR19** (conformance remediation from the 2026-06-23 audit) are **done** — see [`completed/`](completed/).

### Ops / verification (not tickets — operator steps)

- **`npm run db:migrate`** on the live dev DB — applies migrations 018/019 (drops dead schema;
  tested on a copy only). _Not yet run on the live DB._
- **`npm run dev` smoke-test — BACKEND + UI RENDER VERIFIED LIVE 2026-06-24** (clean restart; the
  long-running dev server had wedged after the rename/delete churn). Via API: app boots, `/api/health`
  200 (WP3 DB init OK); cycle endpoint `POST /api/inventory/[id]/listing-remediation-cycle` runs
  end-to-end → correct `409` phase-gate (WP5 module graph compiles + logic executes); tax-compliance
  summary returns the new payload (WP4). Via Chrome (extension connected): dashboard + Settings render
  with **no console errors**; nav shows the canonical tabs (Orders/Settings — WP7 renames intact);
  **the new "Premium model" AI-settings field renders** (WP5); Publish-defaults shows all image
  settings + min-quality 85 (confirms the G4 withdrawal).
- **WP5 END-TO-END VERIFIED WITH REAL AI 2026-06-24.** Operator loaded 3 OpenAI tiers (standard =
  `gpt-5.4-mini`) + key (stored **encrypted** -> WP1 confirmed live). On item 1: Generate succeeded
  (web research + compose, 15s, phase -> `generated`); Evaluate Quality -> **score 52**; one standard
  remediation cycle -> **score 56 (delta +4, improved:true)**, applied_fields =
  [listing_title, listing_tags, listing_description], premium_configured:true, **11 user-action items
  handed back** (photos/category/shipping). Confirms the design exactly: the AI fixes the text, the
  user adds the photos.

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
| Conformance remediation (2026-06 audit) | WS-CR1–CR19 |

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
