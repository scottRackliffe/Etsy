/**
 * GET /api/auth/etsy/callback
 * Etsy OAuth callback: validates state, exchanges code + code_verifier for tokens,
 * stores token/session state in SQLite and sets an opaque session cookie.
 *
 * Uses an HTML response (not a 3xx redirect) to set the cookie reliably across
 * all browsers, then client-side redirects to the dashboard.
 */
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logging";
import { exchangeCodeForToken } from "@/lib/etsy";
import {
  SESSION_COOKIE,
  clearSession,
  completeOauthSession,
  consumeOauthVerifierIfValid,
} from "@/lib/auth-session";

function htmlRedirect(url: string, cookieName?: string, cookieValue?: string, maxAge?: number) {
  const html = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${url}"></head><body>Redirecting…</body></html>`;
  const headers: Record<string, string> = { "Content-Type": "text/html; charset=utf-8" };

  if (cookieName && cookieValue) {
    const parts = [
      `${cookieName}=${cookieValue}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
    ];
    if (maxAge) parts.push(`Max-Age=${maxAge}`);
    if (process.env.NODE_ENV === "production") parts.push("Secure");
    headers["Set-Cookie"] = parts.join("; ");
  }

  return new NextResponse(html, { status: 200, headers });
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    clearSession();
    return htmlRedirect(`/?error=oauth_denied&detail=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return htmlRedirect("/?error=invalid_callback");
  }

  try {
    const codeVerifier = consumeOauthVerifierIfValid(state);
    if (!codeVerifier) {
      return htmlRedirect("/?error=invalid_callback");
    }

    const tokens = await exchangeCodeForToken(code, codeVerifier);
    const baseUrl =
      process.env.ETSY_REDIRECT_URI?.replace(/\/api\/auth\/etsy\/callback.*/, "") ??
      request.nextUrl.origin;

    const sessionId = completeOauthSession(tokens);

    return htmlRedirect(
      new URL("/", baseUrl).toString(),
      SESSION_COOKIE,
      sessionId,
      90 * 24 * 60 * 60
    );
  } catch (e) {
    logger.error("Etsy callback error", { error: e });
    clearSession();
    return htmlRedirect("/?error=token_exchange_failed");
  }
}
