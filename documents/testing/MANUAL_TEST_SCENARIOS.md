# Manual Test Scenarios

This file defines the minimum manual checks required before a staging or production release.

## Test Session Metadata

- Tester name
- Date/time
- Commit SHA
- Environment (`development` / `staging` / `production`)
- SQLite path used

## Scenario 1: Startup + Auth

- Start app with `npm run dev`.
- Load dashboard and confirm no crash screen appears.
- Run Etsy connect flow and confirm callback returns to dashboard.
- Verify authenticated state persists after a refresh.
- Log out and confirm authenticated-only actions are disabled.

## Scenario 2: Inventory Basics

- Create an inventory item with minimum required fields.
- Edit the same item and save updates.
- Confirm listing-readiness API returns expected readiness details.
- Verify invalid edits return structured API errors with actions.

## Scenario 3: Listing Generation

- For a ready item, call listing generation endpoint.
- Confirm title/description/tags/category fields are saved.
- For an incomplete item, verify request is blocked with validation errors.
- Confirm user-facing error copy is actionable and non-technical.

## Scenario 4: Etsy Data Pull

- Load shop list and select active shop.
- Load receipts and verify pagination controls.
- Confirm API errors are rendered with retry guidance.

## Scenario 5: Reporting + Recovery

- Run at least two report flows (for example `sales` and `ar-aging`) using both `?format=pdf` and `?format=csv`.
- Confirm file responses return valid download headers and non-empty content.
- Confirm report artifact metadata is saved in SQLite.
- Restart app and verify prior data is still available.
- Run backup instructions from `documents/operations/BACKUP.md` and validate restore on a fresh DB file.

## Scenario 6: Health + Observability

- Call `GET /api/health` and confirm `ok: true`.
- Intentionally break DB path and confirm `503` with `HEALTHCHECK_FAILED`.
- Confirm logs include timestamp, level, and message.

## Exit Criteria

- All scenarios pass, or failures are logged with owner + due date.
- No blocker defects remain open for release candidate.
