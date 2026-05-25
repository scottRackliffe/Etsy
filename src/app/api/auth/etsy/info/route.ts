/**
 * GET /api/auth/etsy/info
 * Read-only Etsy connection metadata for the Config page (ADR-034 §2).
 */
import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings-store";

export async function GET() {
  return NextResponse.json({
    ok: true,
    redirect_uri: process.env.ETSY_REDIRECT_URI ?? null,
    token_expires_at: getSetting("etsy_token_expires_at") ?? null,
    last_etsy_sync_at: getSetting("last_etsy_sync_at") ?? null,
  });
}
