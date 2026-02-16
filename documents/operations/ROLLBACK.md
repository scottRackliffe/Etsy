# Rollback Runbook

## Trigger Conditions

- Health endpoint stays unhealthy after deployment.
- Core flows fail (auth, inventory, receipts, listing generation).
- High-severity defect with no safe hotfix.

## Rollback Procedure

1. Stop traffic to current deployment.
2. Re-deploy previous known-good build artifact.
3. Restore previous DB snapshot only if schema/data corruption occurred.
4. Run post-rollback checks:
   - `GET /api/health`
   - login flow
   - inventory read/write
   - receipts list
5. Communicate status and root-cause follow-up timeline.

## Evidence to Capture

- failing commit SHA
- error logs
- first detected timestamp
- impacted user actions
