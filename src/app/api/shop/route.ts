/**
 * GET /api/shop
 * Returns the list of shops for the currently connected user (requires valid token cookie).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getShops } from "@/lib/etsy";
import { logger } from "@/lib/logging";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { getValidAccessToken, refreshAndRetry } from "@/lib/auth-session";
import { EtsyApiError } from "@/lib/etsy";
import { getSetting } from "@/lib/settings-store";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = await getValidAccessToken(cookieStore);
    let shops: { shop_id: number; shop_name: string }[];
    try {
      shops = await getShops(token);
    } catch (err) {
      if (err instanceof EtsyApiError && err.status === 401) {
        shops = await refreshAndRetry(cookieStore, "/users/me/shops", (t) => getShops(t));
      } else {
        throw err;
      }
    }
    const activeShopIdRaw = getSetting("etsy.active_shop_id");
    const activeShopId = activeShopIdRaw ? Number(activeShopIdRaw) : null;
    const shop = shops.find((s) => s.shop_id === activeShopId) ?? shops[0] ?? null;
    return NextResponse.json({ ok: true, shop, shops, active_shop_id: activeShopId });
  } catch (e) {
    if (e instanceof ApiRouteError && e.code === "UNAUTHORIZED") {
      return errorResponse(e);
    }
    logger.error("Shops error", { error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined });
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
