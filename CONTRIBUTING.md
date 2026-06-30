# Contributing

## Local Setup

**First time?** Read [`documents/START_HERE.md`](documents/START_HERE.md) for the full map.

1. Install deps: `npm ci`
2. Validate env: `npm run env:check`
3. Migrate DB: `npm run db:migrate`
4. Seed DB: `npm run db:seed`
5. Start dev server: `npm run dev`

## Quality Gates Before PR

- `npm run format:check`
- `npm run lint`
- `npm run type-check`
- `npm run test`

## Pull Request Expectations

- Keep changes focused and documented.
- Include test updates for behavior changes.
- If touching docs, update `documents/README.md` index links as needed.
