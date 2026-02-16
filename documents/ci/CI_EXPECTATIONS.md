# CI Expectations

The CI pipeline enforces baseline quality gates on every push and pull request.

## Required Gates

- `npm ci`
- `npm run env:check`
- `npm run format:check`
- `npm run lint`
- `npm run type-check`
- `npm run db:migrate`
- `npm run db:seed`
- `npm run test`

## Workflow Files

- `.github/workflows/ci.yml` - primary PR/push gate.
- `.github/workflows/test.yml` - nightly matrix test run.

## Failure Policy

- Any failed gate blocks merge.
- Fixes should be in a new commit on the same PR branch.
- Do not bypass checks except during incident response with explicit owner approval.
