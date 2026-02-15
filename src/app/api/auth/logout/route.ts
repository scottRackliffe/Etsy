/**
 * POST /api/auth/logout
 * Clears Etsy access_token, refresh_token, and shop_id cookies (disconnect).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const TOKEN_COOKIE = "etsy_access_token";
const REFRESH_COOKIE = "etsy_refresh_token";
const SHOP_ID_COOKIE = "etsy_shop_id";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(TOKEN_COOKIE);
  cookieStore.delete(REFRESH_COOKIE);
  cookieStore.delete(SHOP_ID_COOKIE);
  return NextResponse.json({ ok: true });
}
