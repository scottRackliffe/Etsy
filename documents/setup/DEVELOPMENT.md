# Development Setup Guide

This guide is for contributors implementing features locally with minimal back-and-forth.

## 1) Prerequisites

- Node.js 18+ (Node 20 LTS recommended).
- npm (comes with Node).
- Git (if using clone workflow).

Quick checks:

```bash
node -v
npm -v
git --version
```

## 2) Clone and open

```bash
git clone <repository-url> etsy
cd etsy
```

Open the project in your IDE from this root.

## 3) Environment setup

Create local env file:

```bash
cp system/.env.example .env.local
```

Populate required variables:

- `ETSY_CLIENT_ID`
- `ETSY_CLIENT_SECRET`
- `ETSY_REDIRECT_URI` (local default: `http://localhost:3000/api/auth/etsy/callback`)

Optional troubleshooting variable:

- `ETSY_API_KEY_HEADER=keystring:sharedsecret`

Listing generation variables:

- `OPENAI_API_KEY` (required only for AI listing generation)
- `OPENAI_MODEL` (optional, default `gpt-4.1-mini`)
- `SQLITE_PATH` (optional, default `./data/app.sqlite`)

See `documents/setup/ENV_MATRIX.md` for environment-specific guidance.

## 4) Windows symlink note

If running on Windows and root symlinks are missing, follow `documents/installation.md` section "Windows only: ensure config files at root".

## 5) Install and run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## 6) Current quality commands

Available scripts today:

```bash
npm run lint
npm run build
```

Planned test/typecheck scripts are listed in `documents/testing/TEST_PLAN.md` and `documents/no-developer-questions-build.md`.

## 7) Developer workflow (recommended)

1. Update relevant ADR/doc if behavior changes.
2. Implement code changes.
3. Run lint/build locally.
4. Run/expand tests for touched behavior.
5. Validate user-visible flows manually (especially OAuth/sync/report flows).

## 8) Troubleshooting shortcuts

- OAuth redirect mismatch: confirm Etsy app redirect URI exactly matches `ETSY_REDIRECT_URI`.
- API failures after OAuth: try setting `ETSY_API_KEY_HEADER`.
- Config/path errors on Windows: complete the root-copy step from `documents/installation.md`.

## Related docs

- `documents/installation.md`
- `documents/setup/ENV_MATRIX.md`
- `documents/testing/TEST_PLAN.md`
- `documents/adr/0018-api-surface-endpoints.md`
