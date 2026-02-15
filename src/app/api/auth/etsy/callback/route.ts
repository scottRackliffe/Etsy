/**
 * GET /api/auth/etsy/callback
 * Etsy OAuth callback: validates state, exchanges code + code_verifier for tokens,
 * sets access_token (and refresh_token) in HTTP-only cookies, redirects to home.
 */
import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken } from "@/lib/etsy";
import { cookies } from "next/headers";

const STATE_COOKIE = "etsy_oauth_state";
const VERIFIER_COOKIE = "etsy_oauth_verifier";
const TOKEN_COOKIE = "etsy_access_token";
const REFRESH_COOKIE = "etsy_refresh_token";
const SHOP_ID_COOKIE = "etsy_shop_id";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const cookieStore = await cookies();
  const savedState = cookieStore.get(STATE_COOKIE)?.value;
  const codeVerifier = cookieStore.get(VERIFIER_COOKIE)?.value;

  if (error) {
    cookieStore.delete(STATE_COOKIE);
    cookieStore.delete(VERIFIER_COOKIE);
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error)}`, request.url));
  }

  if (!code || !state || state !== savedState || !codeVerifier) {
    cookieStore.delete(STATE_COOKIE);
    cookieStore.delete(VERIFIER_COOKIE);
    return NextResponse.redirect(new URL("/?error=invalid_callback", request.url));
  }

  try {
    const tokens = await exchangeCodeForToken(code, codeVerifier);
    const baseUrl = process.env.ETSY_REDIRECT_URI?.replace(/\/api\/auth\/etsy\/callback.*/, "") ?? request.nextUrl.origin;

    cookieStore.delete(STATE_COOKIE);
    cookieStore.delete(VERIFIER_COOKIE);
    cookieStore.set(TOKEN_COOKIE, tokens.access_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: tokens.expires_in,
      path: "/",
    });
    if (tokens.refresh_token) {
      cookieStore.set(REFRESH_COOKIE, tokens.refresh_token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 90,
        path: "/",
      });
    }

    return NextResponse.redirect(new URL("/", baseUrl));
  } catch (e) {
    console.error("Etsy callback error:", e);
    cookieStore.delete(STATE_COOKIE);
    cookieStore.delete(VERIFIER_COOKIE);
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(e instanceof Error ? e.message : "token_exchange_failed")}`, request.url)
    );
  }
}
