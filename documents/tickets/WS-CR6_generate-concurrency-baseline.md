# Ticket WS-CR6 — "Record was modified since you loaded it" on Generate (concurrency baseline)

| Field | Value |
|-------|-------|
| Status | **OPEN — CONFIRMED Tier 1.** Dev-server log shows repeated `PATCH /api/inventory/1 409` (concurrency conflicts on save, firing after generates) independent of any assistant API calls. |
| Workstream | **Conformance Remediation** — live smoke-test finding 2026-06-24. |
| Source ADR | **ADR-046** (concurrent-edit detection), ADR-079 (SEMS guard). |
| Recommended model | Strong model — concurrency/optimistic-lock logic. |
| Complexity | Small–Medium (diagnosis first). |
| Risk | Medium — touches the optimistic-lock baseline used by save/generate. |
| Priority | **Tier 1 if it reproduces** (blocks Generate after edits); else close as not-a-bug. |
| Depends on | — |

## Problem

Observed live: after the operator **saved item 1, reopened it, edited + saved again, reopened, then
clicked Generate listing**, the app returned the ADR-046 guard:

> "Could not generate listing — This record was modified since you loaded it. Please reload and try
> again." (Reload)

The optimistic-concurrency guard is **working as designed** (it blocks a write against a stale
`updated_at`). **The open question is whether the trigger is legitimate or a baseline-refresh bug.**

Known confound for the live instance: an assistant was concurrently hitting the **same** item via API
(generate + cycles + quality), churning `updated_at`. So that specific occurrence may be benign.

## Repro to settle it (do FIRST)

With **nothing else touching the item**: open item → **Reload** (clear the dialog) → **Generate**.
- **If Generate succeeds** → the live instance was just external churn; **close as not-a-bug**
  (optionally keep a note).
- **If Generate still false-conflicts** on a clean reopen → **real bug**: the
  `InventoryDetailPanel` is not refreshing its concurrency baseline (the `updatedAt` / `If-Match`
  value passed to the generate + save calls) after a save+reopen. Fix that so a freshly-loaded record
  carries the current `updated_at`.

## Goal (if confirmed)

- A freshly opened/reloaded record always Generates without a false "record modified" conflict.
- The baseline `updated_at` is refreshed on every (re)load and after each successful save (sub-action
  refresh already advances it per `onReloadItem`; verify Generate uses the refreshed value).

## Acceptance criteria

- [ ] Clean open → Generate works with no false conflict.
- [ ] Save → reopen → Generate works.
- [ ] Genuine concurrent edits still correctly blocked (ADR-046 preserved).
- [ ] `npm run type-check` + `npm run build` pass.

## Kickoff prompt

> Implement `documents/tickets/WS-CR6_generate-concurrency-baseline.md`. FIRST reproduce per the
> "Repro" section. If a clean reopen→Generate still false-conflicts, fix the InventoryDetailPanel
> concurrency baseline (the `updatedAt`/If-Match value used by generate + save) so a freshly loaded
> record carries the current `updated_at`. Preserve ADR-046 for genuine concurrent edits.
