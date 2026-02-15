/**
 * GET /api/auth/etsy
 * Starts Etsy OAuth: generates PKCE code_verifier and state, stores them in cookies,
 * then redirects the user to Etsy's authorization page.
 */
import { NextResponse } from "next/server";
import { getEtsyAuthUrl } from "@/lib/etsy";
import { cookies } from "next/headers";

const STATE_COOKIE = "etsy_oauth_state";
const VERIFIER_COOKIE = "etsy_oauth_verifier";

function randomState(): string {
  const nodeCrypto = require("crypto") as typeof import("crypto");
  return nodeCrypto.randomBytes(24).toString("base64url");
}

export async function GET() {
  try {
    const state = randomState();
    const { url, codeVerifier } = await getEtsyAuthUrl(state);
    const cookieStore = await cookies();
    cookieStore.set(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
    cookieStore.set(VERIFIER_COOKIE, codeVerifier, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
    return NextResponse.redirect(url);
  } catch (e) {
    console.error("Etsy auth error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Etsy auth failed" },
      { status: 500 }
    );
  }
}
