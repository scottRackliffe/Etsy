# Deployment Guide

## Environments

- Development
- Staging
- Production

## Standard Deployment Steps

1. Set environment variables per `documents/setup/ENV_MATRIX.md`.
2. Install dependencies with `npm ci`.
3. Run validation:
   - `npm run env:check`
   - `npm run db:migrate`
   - `npm run build`
4. Start service with `npm run start`.
5. Verify `GET /api/health` responds healthy.

## Required Runtime Values

- `ETSY_CLIENT_ID`
- `ETSY_CLIENT_SECRET`
- `ETSY_REDIRECT_URI`
- `OPENAI_API_KEY` (for listing generation)
- `SQLITE_PATH`

## Notes

- Run migrations before first request handling after deployment.
- Never overwrite production DB without a verified backup and rollback plan.
