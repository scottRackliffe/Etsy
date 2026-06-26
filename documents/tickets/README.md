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
| **WS-CR5** | [WS-CR5_photo-add-drift-ux.md](WS-CR5_photo-add-drift-ux.md) | Photo-add → drift → regenerate UX (confusing reset) — live-test finding | Tier 2 (UX) |
| ~~WS-CR6~~ | [WS-CR6_generate-concurrency-baseline.md](WS-CR6_generate-concurrency-baseline.md) | "Record modified" / `PATCH 409` concurrency on save — **CONFIRMED** (live log) | ✅ DONE — guard-verified 06-26 |
| ~~WS-CR7~~ | [WS-CR7_reasoning-model-tier-support.md](WS-CR7_reasoning-model-tier-support.md) | Reasoning-class model tier support (drop temperature + reasoning-effort dial) — live-test finding | ✅ DONE — live-verified 06-26 |
| ~~WS-CR8~~ | [WS-CR8_settings-chart-of-accounts-layout.md](WS-CR8_settings-chart-of-accounts-layout.md) | Settings: Chart of Accounts **+ GL Transaction Rules** under Item/Order Numbering, full-width, no h-scroll | ✅ DONE (code) 06-26 |
| ~~WS-CR9~~ | [WS-CR9_lowercase-model-names.md](WS-CR9_lowercase-model-names.md) | Normalize OpenAI model names to lowercase + trim on save (casing trap) | ✅ DONE (code) 06-26 |
| ~~WS-CR10~~ | [WS-CR10_surface-real-ai-errors.md](WS-CR10_surface-real-ai-errors.md) | Surface the real error in AI dialogs (stop masking causes; don't discard billed AI on save-fail) — live-test finding | ✅ DONE — live-verified 06-26 |
| ~~WS-CR11~~ | [WS-CR11_error-dialog-details-button.md](WS-CR11_error-dialog-details-button.md) | Error dialogs: add a "Details" button revealing code/message/timestamp (+ Copy) — owner request | ✅ DONE — live-verified 06-26 |
| ~~WS-CR12~~ | [WS-CR12_generate-timeout-many-images.md](WS-CR12_generate-timeout-many-images.md) | Generate times out (~30s) with many images; server saves but UI false-fails — live-test finding | ✅ DONE — live-verified 06-26 |
| ~~WS-CR13~~ | [WS-CR13_photo-shotlist-pdf.md](WS-CR13_photo-shotlist-pdf.md) | Printable photo shot-list PDF (what to shoot + what each photo must show) | ✅ DONE (code) 06-26 |
| ~~WS-CR15~~ | [WS-CR15_per-row-fix-ai-fixable.md](WS-CR15_per-row-fix-ai-fixable.md) | Per-row "Fix" button on AI-fixable remediation rows (reuse listing-refine) — live-test finding | ✅ DONE (code) 06-26 |
| ~~WS-CR16~~ | [WS-CR16_rubric-honors-publish-defaults.md](WS-CR16_rubric-honors-publish-defaults.md) | Rubric must honor publish defaults (who_made/when_made) — stops false nag (C7 sibling) | ✅ DONE (code) 06-26 |
| ~~WS-CR17~~ | [WS-CR17_pending-photo-row-copy-and-ux.md](WS-CR17_pending-photo-row-copy-and-ux.md) | "Per-photo AI pending" row: stale "WS-G3" copy + misleading Fix link — live-test finding | ✅ DONE (code) 06-26 |
| ~~WS-CR18~~ | [WS-CR18_photo-vision-empty-economy-model.md](WS-CR18_photo-vision-empty-economy-model.md) | Per-photo AI vision empty → provisional — DIAGNOSED (reasoning-budget disproven) + retry/reason fix | ✅ DONE (code) 06-26 |
| ~~WS-CR19~~ | [WS-CR19_remove-per-field-fix-buttons.md](WS-CR19_remove-per-field-fix-buttons.md) | Remove redundant per-field "Fix" buttons (keep cycle + per-row + global refine) — owner request | ✅ DONE (code) 06-26 |
| ~~WS-CR14~~ | [WS-CR14_economy-lane-reasoning-token-budget.md](WS-CR14_economy-lane-reasoning-token-budget.md) | Economy-lane AI (shot-list/photo-vision/measure) fails on gpt-5.x — token budget + temperature (CR7 gap) — live-test finding | ✅ DONE (verified) |
| **WS-061** | [WS-061_mobile-responsive-layout.md](WS-061_mobile-responsive-layout.md) | Mobile layout (ADR-061) | **ON HOLD — last; not started until owner signs off on all other work** |
| **WS-CR20** | [WS-CR20_ai-generated-scale-and-lifestyle-photos.md](WS-CR20_ai-generated-scale-and-lifestyle-photos.md) | AI-generated in-hand scale + styled lifestyle photos — design ADR + build | **ON HOLD — future / tech-gated (fidelity + Etsy authenticity)** |

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
  user adds the photos. _Optional remaining: drive the UI buttons (Stop/Cycle/Advance) in-browser and
  an "Advance AI" premium-tier pass._

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
