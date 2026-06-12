import crypto from "node:crypto";
import { ApiRouteError } from "@/lib/api-error";
import { deleteSetting, getSetting, setSetting } from "@/lib/settings-store";
import { refreshAccessToken, EtsyRefreshError } from "@/lib/etsy";
import { logger } from "@/lib/logging";

export const SESSION_COOKIE = "etsy_session_id";
type CookieReader = { get(name: string): { value: string } | undefined };

const SETTINGS_KEYS = {
  oauthState: "etsy.oauth.state",
  oauthVerifier: "etsy.oauth.verifier",
  accessToken: "etsy_access_token_encrypted",
  refreshToken: "etsy_refresh_token_encrypted",
  accessTokenExpiresAt: "etsy_token_expires_at",
  sessionId: "app.session.current_id",
  activeShopId: "etsy.active_shop_id",
  // Legacy keys for migration
  legacyAccessToken: "etsy.oauth.access_token",
  legacyRefreshToken: "etsy.oauth.refresh_token",
  legacyExpiresAt: "etsy.oauth.access_token_expires_at",
};

const PROACTIVE_REFRESH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Token encryption (AES-256-GCM)
// ---------------------------------------------------------------------------

function getEncryptionKey(): Buffer {
  const envKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (envKey) {
    return crypto.createHash("sha256").update(envKey).digest();
  }
  const clientSecret = process.env.ETSY_CLIENT_SECRET;
  if (clientSecret) {
    return crypto.createHash("sha256").update(`etsy-token-key:${clientSecret}`).digest();
  }
  return crypto.createHash("sha256").update("sales-manager-dev-key").digest();
}

function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

function decryptToken(ciphertext: string): string {
  const key = getEncryptionKey();
  const data = Buffer.from(ciphertext, "base64");
  const iv = data.subarray(0, 12);
  const authTag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

// ---------------------------------------------------------------------------
// Token storage helpers (encrypted)
// ---------------------------------------------------------------------------

function storeTokens(tokens: {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}): void {
  const expiresAt = new Date(Date.now() + Math.max(tokens.expires_in, 60) * 1000).toISOString();
  setSetting(SETTINGS_KEYS.accessToken, encryptToken(tokens.access_token));
  setSetting(SETTINGS_KEYS.accessTokenExpiresAt, expiresAt);
  if (tokens.refresh_token) {
    setSetting(SETTINGS_KEYS.refreshToken, encryptToken(tokens.refresh_token));
  }
}

function readAccessToken(): string | null {
  const encrypted = getSetting(SETTINGS_KEYS.accessToken);
  if (!encrypted) return null;
  try {
    return decryptToken(encrypted);
  } catch {
    // Fall back to reading as plaintext (legacy/migration)
    return encrypted;
  }
}

function readRefreshToken(): string | null {
  const encrypted = getSetting(SETTINGS_KEYS.refreshToken);
  if (!encrypted) return null;
  try {
    return decryptToken(encrypted);
  } catch {
    return encrypted;
  }
}

function readExpiresAt(): Date | null {
  const raw = getSetting(SETTINGS_KEYS.accessTokenExpiresAt);
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// OAuth flow helpers
// ---------------------------------------------------------------------------

export function randomState(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function beginOauth(state: string, verifier: string): void {
  setSetting(SETTINGS_KEYS.oauthState, state);
  setSetting(SETTINGS_KEYS.oauthVerifier, verifier);
}

export function consumeOauthVerifierIfValid(state: string): string | null {
  const savedState = getSetting(SETTINGS_KEYS.oauthState);
  const verifier = getSetting(SETTINGS_KEYS.oauthVerifier);
  if (!savedState || !verifier || savedState !== state) {
    return null;
  }
  deleteSetting(SETTINGS_KEYS.oauthState);
  deleteSetting(SETTINGS_KEYS.oauthVerifier);
  return verifier;
}

export function completeOauthSession(tokens: {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}): string {
  const sessionId = crypto.randomUUID();
  setSetting(SETTINGS_KEYS.sessionId, sessionId);
  storeTokens(tokens);
  return sessionId;
}

export function clearSession(): void {
  deleteSetting(SETTINGS_KEYS.oauthState);
  deleteSetting(SETTINGS_KEYS.oauthVerifier);
  deleteSetting(SETTINGS_KEYS.sessionId);
  deleteSetting(SETTINGS_KEYS.accessToken);
  deleteSetting(SETTINGS_KEYS.refreshToken);
  deleteSetting(SETTINGS_KEYS.accessTokenExpiresAt);
  deleteSetting(SETTINGS_KEYS.activeShopId);
  // Clean up legacy keys if they exist
  deleteSetting(SETTINGS_KEYS.legacyAccessToken);
  deleteSetting(SETTINGS_KEYS.legacyRefreshToken);
  deleteSetting(SETTINGS_KEYS.legacyExpiresAt);
}

// ---------------------------------------------------------------------------
// Single in-flight refresh constraint (ADR-025 §4)
// ---------------------------------------------------------------------------

let refreshPromise: Promise<string> | null = null;

async function doRefreshWithRetry(): Promise<string> {
  const refreshToken = readRefreshToken();
  if (!refreshToken) {
    throw new ApiRouteError({
      status: 401,
      code: "ETSY_TOKEN_REVOKED",
      message: "No refresh token available",
      userMessage: "Your Etsy connection has expired. Please reconnect your Etsy account.",
      actions: ["Click 'Connect Etsy' to reconnect"],
      canRetry: false,
    });
  }

  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await refreshAccessToken(refreshToken);
      storeTokens(result);
      logger.info("etsy.token.refresh_succeeded", {
        new_expires_at: getSetting(SETTINGS_KEYS.accessTokenExpiresAt),
      });
      return result.access_token;
    } catch (err) {
      lastError = err;

      if (err instanceof EtsyRefreshError) {
        if (err.isRevoked) {
          logger.error("etsy.token.refresh_revoked", {
            reason: "revoked",
            http_status: err.status,
          });
          clearSession();
          throw new ApiRouteError({
            status: 401,
            code: "ETSY_TOKEN_REVOKED",
            message: "Etsy refresh token revoked",
            userMessage: "Your Etsy connection has expired. Please reconnect your Etsy account.",
            actions: ["Click 'Connect Etsy' to reconnect"],
            canRetry: false,
          });
        }

        if (err.isRateLimited && attempt === 0) {
          const waitMs = (err.retryAfter ?? 60) * 1000;
          logger.warn("etsy.token.refresh_rate_limited", {
            reason: "transient",
            http_status: 429,
            retry_count: attempt + 1,
            wait_ms: waitMs,
          });
          await sleep(Math.min(waitMs, 60_000));
          continue;
        }

        if (err.isServerError && attempt === 0) {
          logger.warn("etsy.token.refresh_server_error", {
            reason: "transient",
            http_status: err.status,
            retry_count: attempt + 1,
          });
          await sleep(5_000);
          continue;
        }
      }

      // Network timeout / abort
      if (isAbortError(err) && attempt === 0) {
        logger.warn("etsy.token.refresh_timeout", {
          reason: "transient",
          retry_count: attempt + 1,
        });
        await sleep(5_000);
        continue;
      }

      break;
    }
  }

  // Exhausted retries — temporary failure
  logger.warn("etsy.token.refresh_transient_failure", {
    reason: "transient",
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });
  throw new ApiRouteError({
    status: 503,
    code: "ETSY_TEMPORARILY_UNAVAILABLE",
    message: "Etsy token refresh temporarily unavailable",
    userMessage:
      "Etsy is temporarily unavailable. Your data is safe — please try again in a few minutes.",
    actions: ["Try again in a few minutes."],
    canRetry: true,
  });
}

function performRefresh(): Promise<string> {
  if (refreshPromise) {
    return refreshPromise;
  }
  refreshPromise = doRefreshWithRetry().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

// ---------------------------------------------------------------------------
// Main entry point: getValidAccessToken (ADR-025 §2-3)
// ---------------------------------------------------------------------------

export async function getValidAccessToken(cookieStore: CookieReader): Promise<string> {
  const sessionCookie = cookieStore.get(SESSION_COOKIE)?.value;
  const currentSessionId = getSetting(SETTINGS_KEYS.sessionId);
  const token = readAccessToken();

  // Single-user local app: if tokens exist in SQLite, accept even without cookie
  const cookieValid = sessionCookie && currentSessionId && sessionCookie === currentSessionId;
  const hasStoredSession = currentSessionId && token;

  if (!(cookieValid || hasStoredSession) || !token) {
    throw new ApiRouteError({
      status: 401,
      code: "UNAUTHORIZED",
      message: "Not connected to Etsy",
      userMessage: "You are not connected to Etsy.",
      actions: ["Click Connect Etsy to sign in.", "Retry once the Etsy connection is active."],
      canRetry: false,
    });
  }

  const expiresAt = readExpiresAt();
  if (expiresAt && expiresAt.getTime() - Date.now() < PROACTIVE_REFRESH_WINDOW_MS) {
    const secondsUntilExpiry = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    logger.info("etsy.token.proactive_refresh", {
      reason: "token_expiring",
      expires_in_seconds: secondsUntilExpiry,
    });
    return performRefresh();
  }

  return token;
}

// ---------------------------------------------------------------------------
// Reactive refresh: call when Etsy API returns 401 (ADR-025 §3, §5)
// ---------------------------------------------------------------------------

export async function refreshAndRetry<T>(
  cookieStore: CookieReader,
  endpoint: string,
  apiFn: (accessToken: string) => Promise<T>
): Promise<T> {
  logger.warn("etsy.token.reactive_refresh", {
    reason: "api_401",
    endpoint,
  });

  const newToken = await performRefresh();

  // Retry the original call once with the fresh token
  return apiFn(newToken);
}

// ---------------------------------------------------------------------------
// Legacy sync function (kept for routes that use requireEtsyAccessToken)
// ---------------------------------------------------------------------------

/** True when local SQLite/API use is allowed without Etsy OAuth (pending key, demo, etc.). */
export function allowLocalWithoutEtsy(): boolean {
  if (process.env.ALLOW_LOCAL_WITHOUT_ETSY === "false") return false;
  return process.env.ALLOW_LOCAL_WITHOUT_ETSY === "true" || process.env.NODE_ENV === "development";
}

export function requireEtsyAccessToken(cookieStore: CookieReader): string {
  const sessionCookie = cookieStore.get(SESSION_COOKIE)?.value;
  const currentSessionId = getSetting(SETTINGS_KEYS.sessionId);
  const token = readAccessToken();
  const expiresAt = readExpiresAt();

  // Single-user local app: if tokens exist in SQLite, accept even without cookie
  const cookieValid = sessionCookie && currentSessionId && sessionCookie === currentSessionId;
  const hasStoredSession = currentSessionId && token;

  if (!(cookieValid || hasStoredSession) || !token) {
    if (allowLocalWithoutEtsy()) {
      return "";
    }
    throw new ApiRouteError({
      status: 401,
      code: "UNAUTHORIZED",
      message: "Not connected to Etsy",
      userMessage: "You are not connected to Etsy.",
      actions: ["Click Connect Etsy to sign in.", "Retry once the Etsy connection is active."],
      canRetry: false,
    });
  }

  if (expiresAt && Date.now() > expiresAt.getTime()) {
    if (allowLocalWithoutEtsy()) {
      return "";
    }
    throw new ApiRouteError({
      status: 401,
      code: "UNAUTHORIZED",
      message: "Etsy session expired",
      userMessage: "Your Etsy session expired.",
      actions: ["Reconnect Etsy to continue.", "Retry after reconnection."],
      canRetry: false,
    });
  }

  return token;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}
