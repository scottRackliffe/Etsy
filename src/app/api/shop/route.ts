/**
 * GET /api/shop
 * Returns the list of shops for the currently connected user (requires valid token cookie).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getShops } from "@/lib/etsy";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { resolveEtsyAccessToken } from "@/lib/auth-session";
import { getSetting } from "@/lib/settings-store";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = await resolveEtsyAccessToken(cookieStore);
    const shops = await getShops(token);
    const activeShopIdRaw = getSetting("etsy.active_shop_id");
    const activeShopId = activeShopIdRaw ? Number(activeShopIdRaw) : null;
    return NextResponse.json({ ok: true, shops, active_shop_id: activeShopId });
  } catch (e) {
    console.error("Shops error:", e);
    return errorResponse(
      fromUnknownError(e, {
        code: "ETSY_API_FAILED",
        message: "Failed to load shops",
        userMessage: "We could not load your Etsy shops right now.",
        actions: [
          "Refresh the page and try again.",
          "If the problem continues, disconnect and reconnect Etsy.",
        ],
      })
    );
  }
}
