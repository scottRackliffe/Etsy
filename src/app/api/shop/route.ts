/**
 * GET /api/shop
 * Returns the list of shops for the currently connected user (requires valid token cookie).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getShops } from "@/lib/etsy";

const TOKEN_COOKIE = "etsy_access_token";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Not connected to Etsy" }, { status: 401 });
  }
  try {
    const shops = await getShops(token);
    return NextResponse.json({ shops });
  } catch (e) {
    console.error("Shops error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load shops" },
      { status: 500 }
    );
  }
}
