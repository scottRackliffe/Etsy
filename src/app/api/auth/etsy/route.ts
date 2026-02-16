/**
 * GET /api/auth/etsy
 * Starts Etsy OAuth: generates PKCE code_verifier and state, stores them in SQLite,
 * then redirects the user to Etsy's authorization page.
 */
import { NextResponse } from "next/server";
import { getEtsyAuthUrl } from "@/lib/etsy";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { beginOauth, randomState } from "@/lib/auth-session";

export async function GET() {
  try {
    const state = randomState();
    const { url, codeVerifier } = await getEtsyAuthUrl(state);
    beginOauth(state, codeVerifier);
    return NextResponse.redirect(url);
  } catch (e) {
    console.error("Etsy auth error:", e);
    return errorResponse(
      fromUnknownError(e, {
        code: "ETSY_AUTH_FAILED",
        message: "Etsy auth failed",
        userMessage: "We could not start Etsy sign-in.",
        actions: [
          "Refresh the page and try Connect Etsy again.",
          "Verify ETSY_CLIENT_ID/ETSY_REDIRECT_URI configuration.",
        ],
      })
    );
  }
}
