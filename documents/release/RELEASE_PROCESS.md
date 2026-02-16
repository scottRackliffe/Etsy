# Release Process

## Scope

This runbook defines the standard release checklist for staging and production.

## Pre-Release Checklist

- Branch is up to date with `main`.
- CI is green for latest commit.
- Manual scenarios in `documents/testing/MANUAL_TEST_SCENARIOS.md` are completed.
- Release notes drafted.
- Backup created (see `documents/operations/BACKUP.md`).

## Release Steps

1. Tag release candidate (for example `v1.2.0-rc1`).
2. Deploy to staging and verify smoke checks.
3. Promote to production during approved window.
4. Run post-deploy checks:
   - `GET /api/health`
   - dashboard load
   - auth flow
   - receipts endpoint

## Post-Release

- Publish final release notes.
- Track defects for 24-hour stabilization window.
- If severe issue occurs, follow `documents/operations/ROLLBACK.md`.
