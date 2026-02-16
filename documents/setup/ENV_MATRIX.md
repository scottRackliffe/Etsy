# Environment Variable Matrix

This file defines environment variables by environment and removes guesswork during setup/deploy.

## Rules

- `.env.local` is for local development only.
- Never commit real secrets.
- If a required variable is missing, the app must fail fast on startup with a clear error.

## Variable reference

| Variable              | Required (dev) | Required (staging) | Required (prod) | Example                                        | Notes                                                                                      |
| --------------------- | -------------- | ------------------ | --------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `ETSY_CLIENT_ID`      | Yes            | Yes                | Yes             | `abc123keystring`                              | OAuth client id (Etsy app keystring).                                                      |
| `ETSY_CLIENT_SECRET`  | Yes            | Yes                | Yes             | `super_secret_value`                           | OAuth client secret.                                                                       |
| `ETSY_REDIRECT_URI`   | Yes            | Yes                | Yes             | `http://localhost:3000/api/auth/etsy/callback` | Must exactly match Etsy app configuration.                                                 |
| `ETSY_API_KEY_HEADER` | No             | No                 | No              | `keystring:sharedsecret`                       | Optional override for `x-api-key` header format when required by Etsy/API behavior.        |
| `OPENAI_API_KEY`      | Optional\*     | Optional\*         | Optional\*      | `sk-...`                                       | Required for listing generation endpoint (`/api/inventory/[id]/generate-listing-content`). |
| `OPENAI_MODEL`        | No             | No                 | No              | `gpt-4.1-mini`                                 | Optional model override for listing generation.                                            |
| `SQLITE_PATH`         | No             | No                 | No              | `./data/app.sqlite`                            | Optional SQLite file path override.                                                        |
| `NODE_ENV`            | No             | Yes                | Yes             | `development` / `production`                   | Standard Node runtime mode.                                                                |
| `PORT`                | No             | No                 | No              | `3000`                                         | Optional local/server port.                                                                |

## Environment-specific defaults

### Development

- `NODE_ENV=development`
- `ETSY_REDIRECT_URI=http://localhost:3000/api/auth/etsy/callback`
- `ETSY_API_KEY_HEADER` unset unless troubleshooting requires it.

### Staging

- `NODE_ENV=production`
- `ETSY_REDIRECT_URI=https://<staging-domain>/api/auth/etsy/callback`
- Use staging Etsy app credentials when available.

### Production

- `NODE_ENV=production`
- `ETSY_REDIRECT_URI=https://<production-domain>/api/auth/etsy/callback`
- Store secrets in deployment secret manager; never in source-controlled files.

## Validation expectations

- On startup, validate required variables and render a single actionable error list.
- On OAuth callback failures caused by env mismatch, return a user-safe error code and log detailed diagnostics server-side.

## Related files

- `documents/installation.md`
- `documents/setup/DEVELOPMENT.md`
- `README.md`
- `system/.env.example`
- `.env.development.example`
- `.env.staging.example`
- `.env.production.example`
