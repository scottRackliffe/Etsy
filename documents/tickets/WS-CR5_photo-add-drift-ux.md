# Ticket WS-CR5 — Photo-add → drift → regenerate UX (confusing reset)

> **Status: DONE + VERIFIED 2026-06-26** — commit c4ad014. Readiness API returns a `drifted` flag; panel shows a plain-language hint + relabels button "Regenerate listing" when a generated listing drifts. Drift rule unchanged. Live-verified (simulated drift on item 1).

| Field | Value |
|-------|-------|
| Status | **OPEN** — Tier 2 (UX) |
| Workstream | **Conformance Remediation** — live smoke-test finding 2026-06-24. |
| Source ADR | ADR-081 (drift), ADR-089 (remediation cycle), ADR-083 (shot-list). |
| Recommended model | Sonnet — UI/UX copy + small logic. |
| Complexity | Small–Medium. |
| Risk | Low. |
| Priority | Medium — confusing, not blocking (regenerate path works). |
| Depends on | WP5 (ADR-089) shipped. |

## Problem

Observed live: the remediation cycle correctly tells the user to **add photos** (shot-list /
user-action items). When the user adds the photos, `computeListingPhase` detects **drift** (pictures
are part of `listing_source_hash`), reverts the live phase to `ready_to_generate`, **hides the
RemediationCyclePanel**, and the lifecycle button collapses to a bare **"Generate listing"** — with
**no explanation**. The user did exactly what the cycle asked and the controls vanished, which reads
as "something broke."

This is *correct* drift behavior (the listing must be regenerated to incorporate the new photos), but
the **presentation is jarring**.

## Goal

Make the photo-add → regenerate transition legible:
- When the phase reverts to `ready_to_generate` **because pictures/inputs changed** (not because the
  listing was never generated), show a short explanation, e.g. *"Photos added — regenerate to include
  them in the listing."*
- Optionally distinguish "first generation" from "regenerate after changes" in the button/label.

## Approach (doc-first)

1. Read ADR-081 (drift) + ADR-089. Decide the messaging + whether to surface a "drifted" sub-state in
   the readiness response (e.g. a `drift_reason`).
2. Implement the UI hint; keep the drift rule itself unchanged.

## Out of scope

- Changing the drift model (pictures stay part of the hash).
- Auto-regenerating without the user (the user should choose).

## Acceptance criteria

- [ ] After adding photos, the UI explains *why* it wants a regenerate (no silent reset).
- [ ] Regenerate → Evaluate Quality → cycle buttons return; flow is clear.
- [ ] `npm run type-check` + `npm run build` pass.

## Kickoff prompt

> Implement `documents/tickets/WS-CR5_photo-add-drift-ux.md`. Read ADR-081 (drift) + ADR-089. Add a
> clear "photos/inputs changed — regenerate" explanation when a generated listing drifts back to
> `ready_to_generate`; do not change the drift rule itself.
