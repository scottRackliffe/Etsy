# Ticket WS-CR11 — Error dialogs: add a "Details" button revealing what actually happened

| Field | Value |
|-------|-------|
| Status | **OPEN** — Tier 2 |
| Workstream | **Conformance Remediation** — owner request 2026-06-24. |
| Source ADR | ADR-032 (dialogs), ADR-071 (UI consistency). |
| Recommended model | Sonnet — shared component + error-state plumbing. |
| Complexity | Small–Medium. |
| Risk | Low–Medium — must not leak secrets. |
| Priority | Tier 2 — pairs with WS-CR10. |
| Depends on | Complements **WS-CR10** (which supplies the real `error.message`). |

## Problem

The app's error dialogs show only a friendly one-liner (e.g. "We could not run the remediation
cycle"), with **no way to see *what actually happened***. During live testing this hid the real
cause every time and made self-diagnosis impossible.

WS-CR10 makes the real cause *available*; this ticket adds the **UI affordance** to view it on
demand, applied to the **shared** error dialog so every error (AI or not) benefits.

## Goal

Add a **"Details"** button/disclosure to the shared error dialog/modal:
- Default view = the friendly message + actions (unchanged).
- Clicking **Details** expands a technical panel showing the underlying error: **code, message,
  timestamp**, and (where available) the failing endpoint. Include a **Copy** button so the user can
  paste it into a bug report.
- Collapsed by default; non-intrusive.

Plumb a `detail`/`technical` field through the error state used by the dialog (the `setError(...)` /
`onError(...)` pattern and the `ApiRouteError`/`errorResponse` envelope already carry `code` +
`message`).

## Out of scope

- Producing the messages themselves (WS-CR10).

## Acceptance criteria

- [ ] Every error dialog has a **Details** toggle; expanded view shows code + message + timestamp.
- [ ] A **Copy** affordance copies the technical detail.
- [ ] **No API keys/secrets** ever appear in the details.
- [ ] Applied via the shared dialog component (consistent everywhere), not one-off.
- [ ] `npm run type-check` + `npm run build` pass.

## Kickoff prompt

> Implement `documents/tickets/WS-CR11_error-dialog-details-button.md`. Add a collapsible "Details"
> section (code + message + timestamp + Copy button) to the shared error dialog, plumbing a technical
> `detail` field through the error state (setError/onError + ApiRouteError envelope). Collapsed by
> default; never show secrets. Pairs with WS-CR10.
