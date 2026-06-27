# Ticket WS-CR4 — User-facing help for the remediation cycle

> **Status: DONE 2026-06-26** — Sonnet; commit 57735b6. Tutorial article "Improving a listing with the remediation cycle" added to BUILTIN_ARTICLES (the rendered source) + tutorial.md; stale tab names fixed; no ADR/tier leakage.

| Field | Value |
|-------|-------|
| Status | **OPEN** — Tier 3 / optional |
| Workstream | **Conformance Remediation** — user-doc follow-up. |
| Source ADR | ADR-089 (internal); user docs are `tutorial.md` / knowledge-base. |
| Recommended model | Sonnet — content writing. |
| Complexity | Small. |
| Risk | Low. |
| Priority | **Low / optional.** |
| Depends on | WP5 shipped (ADR-089). |

## Problem

ADRs are internal-only (`adr/README.md`). The new remediation-cycle feature (Stop / Cycle again /
Advance AI, the score-delta view, the photo shot-list hand-off) has **no end-user documentation** in
`tutorial.md` or the knowledge base.

## Goal

- Add a short user-facing section explaining: the minimal inputs to start a listing, that the score
  drives the loop, what the three buttons do, and that some items (photos/data) are the user's to add.

## Out of scope

- Exposing ADR content or internal model-tier details to users.

## Acceptance criteria

- [ ] `tutorial.md` (and/or KB) describes the cycle in user terms; no ADR leakage.
- [ ] Wording matches the canonical taxonomy (AiCE; Orders/Settings).

## Kickoff prompt

> Implement `documents/tickets/WS-CR4_user-docs-remediation-cycle.md`. Write user-facing help for the
> listing remediation cycle in tutorial.md/KB. Source: ADR-089 (do not expose ADRs to users).
