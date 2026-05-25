# ADR-025: Token refresh middleware — deterministic behavior (no ambiguity)

## Status

Accepted

## Date

2026-05-24

## Context

ADR-007 specifies that token refresh is required for production and describes the high-level behavior (refresh on 401, proactive refresh, single in-flight). The no-developer-questions checklist flagged missing details: single in-flight behavior, retry limits, timeout behavior, and revoked refresh-token handling. This ADR closes those gaps with exact implementation rules.

## Decision

### 1. Token storage

Tokens are stored in the SQLite `settings` table (ADR-017):

| Key                            | Purpose                                   |
| ------------------------------ | ----------------------------------------- |
| `etsy_access_token_encrypted`  | Current access token (encrypted at rest)  |
| `etsy_refresh_token_encrypted` | Current refresh token (encrypted at rest) |
| `etsy_token_expires_at`        | Access token expiry (ISO 8601 UTC)        |

Encryption: use Node.js `crypto.createCipheriv` with AES-256-GCM. The encryption key is derived from a server-side secret (environment variable `TOKEN_ENCRYPTION_KEY` or fallback to a deterministic key derived from `ETSY_CLIENT_SECRET`). The IV is stored alongside the ciphertext (prepended). This is defense-in-depth for the SQLite file at rest; it is not a substitute for filesystem-level encryption in production.

### 2. Middleware location

Token refresh logic lives in a single function: `src/lib/auth-session.ts` → `getValidAccessToken(): Promise<string>`. Every API route that calls the Etsy API must call this function instead of reading the token directly.

### 3. Refresh triggers

**Proactive (preferred path):**
Before any Etsy API call, `getValidAccessToken()` checks `etsy_token_expires_at`. If the token is expired or will expire within **5 minutes** (300 seconds), refresh first, then return the new token.

**Reactive (fallback):**
If an Etsy API call returns HTTP 401 despite a non-expired token (clock skew, early revocation), the caller invokes `refreshAndRetry()` which refreshes the token and retries the original request **once**.

### 4. Single in-flight constraint

Only one refresh request may be in flight per Node.js process at any time. Implementation:

```typescript
let refreshPromise: Promise<string> | null = null;

async function refreshToken(): Promise<string> {
  if (refreshPromise) {
    return refreshPromise;
  }
  refreshPromise = doRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}
```

If a second request needs a refresh while one is in progress, it awaits the existing promise. This prevents token endpoint flooding and avoids race conditions where two concurrent refreshes invalidate each other's tokens.

### 5. Retry limits

| Scenario                                                       | Behavior                                                                                                                                |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Refresh succeeds                                               | Update stored tokens; retry original Etsy API call **once** with new token                                                              |
| Refresh returns 400 (invalid grant)                            | Refresh token is revoked or invalid; see §6                                                                                             |
| Refresh returns 401                                            | Same as 400 — treat as revoked                                                                                                          |
| Refresh returns 429                                            | Wait `Retry-After` header value (or 60 seconds if absent); retry refresh **once**; if still 429, treat as temporary failure (§7)        |
| Refresh returns 5xx                                            | Retry refresh **once** after 5 seconds; if still 5xx, treat as temporary failure (§7)                                                   |
| Network timeout on refresh                                     | Retry **once** after 5 seconds; if still timeout, treat as temporary failure (§7)                                                       |
| Original Etsy API call fails with 401 after successful refresh | Do **not** refresh again; return 401 to the client (the access token is valid but the request itself is unauthorized, e.g. wrong scope) |

**Maximum refresh attempts per request chain: 2** (one proactive or reactive + one retry on 429/5xx). Never loop.

### 6. Revoked refresh token behavior

When the refresh token is rejected (HTTP 400 with `invalid_grant` or HTTP 401 from token endpoint):

1. Clear all stored tokens from SQLite (`etsy_access_token_encrypted`, `etsy_refresh_token_encrypted`, `etsy_token_expires_at`).
2. Clear the session cookie.
3. Set `isConnected = false` in application state.
4. Return an API response to the client with:
   - HTTP 401
   - `error.code`: `ETSY_TOKEN_REVOKED`
   - `error.user_message`: "Your Etsy connection has expired. Please reconnect your Etsy account."
   - `error.actions`: ["Click 'Connect Etsy' to reconnect"]
5. The UI handles this by showing the "not connected" state with a clear reconnect prompt.

This state is **not recoverable** without user action (re-OAuth).

### 7. Temporary failure behavior

When the refresh cannot be completed due to transient errors (429 after retry, 5xx after retry, network timeout after retry):

1. Do **not** clear stored tokens (they may still be valid).
2. Return an API response to the client with:
   - HTTP 503
   - `error.code`: `ETSY_TEMPORARILY_UNAVAILABLE`
   - `error.user_message`: "Etsy is temporarily unavailable. Your data is safe — please try again in a few minutes."
   - `error.can_retry`: true
3. The UI shows a dismissible banner. The user can retry manually.

### 8. Timeout configuration

| Operation                            | Timeout    |
| ------------------------------------ | ---------- |
| Token refresh HTTP request           | 15 seconds |
| Etsy API call (after token obtained) | 30 seconds |

Both are configurable via environment variables (`ETSY_TOKEN_TIMEOUT_MS`, `ETSY_API_TIMEOUT_MS`) with the above defaults.

### 9. Logging

All refresh events are logged via the structured logger (`src/lib/logging.ts`):

| Event                            | Level | Fields                                              |
| -------------------------------- | ----- | --------------------------------------------------- |
| Proactive refresh triggered      | info  | `reason: "token_expiring"`, `expires_in_seconds`    |
| Reactive refresh triggered (401) | warn  | `reason: "api_401"`, `endpoint`                     |
| Refresh succeeded                | info  | `new_expires_at`                                    |
| Refresh failed (revoked)         | error | `reason: "revoked"`, `http_status`                  |
| Refresh failed (transient)       | warn  | `reason: "transient"`, `http_status`, `retry_count` |

Access tokens and refresh tokens are **never logged**, even at debug level.

### 10. Startup behavior

On application startup (first API request after server start or page load):

1. Check if stored tokens exist.
2. If tokens exist and access token is expired, attempt proactive refresh.
3. If refresh succeeds, proceed normally. If revoked, set not-connected state.
4. If no tokens exist, set not-connected state (no error; user has not connected yet).

## Consequences

- **Positive:** Deterministic, documented behavior for every token lifecycle scenario; no ambiguity for implementers; graceful degradation on Etsy outages.
- **Negative:** Added complexity vs. simple "reconnect on failure"; encryption key management adds a deployment consideration.

## Notes

- This ADR supersedes the token refresh section in ADR-007 Notes. ADR-007 remains the SSOT for the overall OAuth flow; this ADR is the SSOT for refresh behavior specifically.
- The `getValidAccessToken()` function is the single entry point; no other code should read tokens from SQLite directly.
