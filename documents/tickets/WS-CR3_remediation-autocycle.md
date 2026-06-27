# Ticket WS-CR3 — Remediation auto-cycle (stall→escalate, no human) (D1)

| Field | Value |
|-------|-------|
| Status | **OPEN** — Tier 3 / backlog (evidence-gated) |
| Workstream | **Conformance Remediation** — WP5 future step. |
| Source ADR | **ADR-089** + **ADR-086 §1a**. |
| Recommended model | Strong model — escalation policy + cost control. |
| Complexity | Medium. |
| Risk | Medium — automated AI spend; needs caps. |
| Priority | **Backlog** — do AFTER the user-observed cycle (WS-CR shipped) gathers evidence. |
| Depends on | WP5 user-observed cycle (done, ADR-089). |

## Problem

The shipped remediation cycle is **user-observed** (Stop / Cycle again / Advance AI) by design — it
exists to *gather evidence* for where the standard model becomes inadequate. Once that evidence
exists, an **automated** mode can run the loop without a human: cheapest-first, escalate to
`ai.premium_model` on a stall, stop at the gate or a cap.

## Goal

- Auto-run the cycle: score → AI-fix → re-score, escalating tier when a pass **stalls** (no score
  improvement) and stopping at ≥85, a **configurable pass cap**, or no-progress.
- Thresholds (pass cap, stall definition, tier order) configurable; defaults informed by the
  evidence the user-observed cycle recorded — **do not guess them** until that evidence exists.

## Out of scope

- Changing the deterministic rubric or the publish gate.

## Acceptance criteria

- [ ] Auto mode reaches ≥85 or stops at the cap, never loops unbounded.
- [ ] Escalation events + per-pass deltas are recorded (auditable cost, ADR-075).
- [ ] Thresholds are settings, not hardcoded literals.

## Escalation triggers (STOP and ask)

- The evidence for thresholds isn't available yet → keep it user-observed; do not invent caps.

## Kickoff prompt

> Implement `documents/tickets/WS-CR3_remediation-autocycle.md` — ONLY after the user-observed cycle
> (ADR-089) has produced real evidence for escalation thresholds. Read ADR-089 + ADR-086 §1a.
