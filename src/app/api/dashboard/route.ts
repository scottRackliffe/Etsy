import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { getDashboardSummary } from "@/lib/dashboard";
import { getSetting } from "@/lib/settings-store";
import { requireEtsyAccessToken } from "@/lib/auth-session";

export async function GET() {
  try {
    const cookieStore = await cookies();
    let connected = false;
    let shop: { shop_id: string; shop_name: string | null } | undefined;
    try {
      requireEtsyAccessToken(cookieStore);
      connected = true;
      const shopId = getSetting("etsy.active_shop_id");
      if (shopId) {
        shop = { shop_id: shopId, shop_name: null };
      }
    } catch {
      connected = false;
    }

    const summary = getDashboardSummary({ connected, shop });
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load dashboard",
        userMessage: "We could not load the dashboard.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
