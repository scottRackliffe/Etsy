/**
 * GET /api/auth/etsy/callback
 * Etsy OAuth callback: validates state, exchanges code + code_verifier for tokens,
 * stores token/session state in SQLite and sets an opaque session cookie.
 */
import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken } from "@/lib/etsy";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  clearSession,
  completeOauthSession,
  consumeOauthVerifierIfValid,
} from "@/lib/auth-session";
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const cookieStore = await cookies();

  if (error) {
    clearSession();
    return NextResponse.redirect(
      new URL(`/?error=oauth_denied&detail=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/?error=invalid_callback", request.url));
  }

  try {
    const codeVerifier = consumeOauthVerifierIfValid(state);
    if (!codeVerifier) {
      return NextResponse.redirect(new URL("/?error=invalid_callback", request.url));
    }

    const tokens = await exchangeCodeForToken(code, codeVerifier);
    const baseUrl =
      process.env.ETSY_REDIRECT_URI?.replace(/\/api\/auth\/etsy\/callback.*/, "") ??
      request.nextUrl.origin;

    const sessionId = completeOauthSession(tokens);
    cookieStore.set(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: tokens.expires_in,
      path: "/",
    });

    return NextResponse.redirect(new URL("/", baseUrl));
  } catch (e) {
    console.error("Etsy callback error:", e);
    clearSession();
    return NextResponse.redirect(new URL("/?error=token_exchange_failed", request.url));
  }
}
