import crypto from "node:crypto";
import { ApiRouteError } from "@/lib/api-error";
import { deleteSetting, getSetting, setSetting } from "@/lib/settings-store";
import { refreshAccessToken } from "@/lib/etsy";

export const SESSION_COOKIE = "etsy_session_id";
type CookieReader = { get(name: string): { value: string } | undefined };

const SETTINGS_KEYS = {
  oauthState: "etsy.oauth.state",
  oauthVerifier: "etsy.oauth.verifier",
  accessToken: "etsy.oauth.access_token",
  refreshToken: "etsy.oauth.refresh_token",
  accessTokenExpiresAt: "etsy.oauth.access_token_expires_at",
  sessionId: "app.session.current_id",
  activeShopId: "etsy.active_shop_id",
};

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
  const expiresAt = new Date(Date.now() + Math.max(tokens.expires_in, 60) * 1000).toISOString();
  setSetting(SETTINGS_KEYS.sessionId, sessionId);
  setSetting(SETTINGS_KEYS.accessToken, tokens.access_token);
  setSetting(SETTINGS_KEYS.accessTokenExpiresAt, expiresAt);
  if (tokens.refresh_token) {
    setSetting(SETTINGS_KEYS.refreshToken, tokens.refresh_token);
  }
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
}

export function requireEtsyAccessToken(cookieStore: CookieReader): string {
  const sessionCookie = cookieStore.get(SESSION_COOKIE)?.value;
  const currentSessionId = getSetting(SETTINGS_KEYS.sessionId);
  const token = getSetting(SETTINGS_KEYS.accessToken);
  const expiresAt = getSetting(SETTINGS_KEYS.accessTokenExpiresAt);

  if (!sessionCookie || !currentSessionId || sessionCookie !== currentSessionId || !token) {
    throw new ApiRouteError({
      status: 401,
      code: "UNAUTHORIZED",
      message: "Not connected to Etsy",
      userMessage: "You are not connected to Etsy.",
      actions: ["Click Connect Etsy to sign in.", "Retry once the Etsy connection is active."],
      canRetry: false,
    });
  }

  if (expiresAt && Date.now() > new Date(expiresAt).getTime()) {
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

export async function resolveEtsyAccessToken(cookieStore: CookieReader): Promise<string> {
  const sessionCookie = cookieStore.get(SESSION_COOKIE)?.value;
  const currentSessionId = getSetting(SETTINGS_KEYS.sessionId);
  const token = getSetting(SETTINGS_KEYS.accessToken);
  const expiresAt = getSetting(SETTINGS_KEYS.accessTokenExpiresAt);

  if (!sessionCookie || !currentSessionId || sessionCookie !== currentSessionId || !token) {
    throw new ApiRouteError({
      status: 401,
      code: "UNAUTHORIZED",
      message: "Not connected to Etsy",
      userMessage: "You are not connected to Etsy.",
      actions: ["Click Connect Etsy to sign in.", "Retry once the Etsy connection is active."],
      canRetry: false,
    });
  }

  if (!expiresAt || Date.now() <= new Date(expiresAt).getTime()) {
    return token;
  }

  const refreshToken = getSetting(SETTINGS_KEYS.refreshToken);
  if (!refreshToken) {
    throw new ApiRouteError({
      status: 401,
      code: "UNAUTHORIZED",
      message: "Etsy session expired",
      userMessage: "Your Etsy session expired and could not be refreshed.",
      actions: ["Reconnect Etsy to continue."],
      canRetry: false,
    });
  }

  const refreshed = await refreshAccessToken(refreshToken);
  setSetting(SETTINGS_KEYS.accessToken, refreshed.access_token);
  setSetting(
    SETTINGS_KEYS.accessTokenExpiresAt,
    new Date(Date.now() + Math.max(60, refreshed.expires_in) * 1000).toISOString()
  );
  if (refreshed.refresh_token) {
    setSetting(SETTINGS_KEYS.refreshToken, refreshed.refresh_token);
  }
  return refreshed.access_token;
}
