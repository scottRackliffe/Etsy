/**
 * GET /api/receipts?shop_id=&limit=&offset=
 * Returns paginated shop receipts (orders) for the given shop_id (requires valid token cookie).
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getShopReceipts } from "@/lib/etsy";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { resolveEtsyAccessToken } from "@/lib/auth-session";

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = await resolveEtsyAccessToken(cookieStore);

    const searchParams = request.nextUrl.searchParams;
    const shopId = searchParams.get("shop_id");
    if (!shopId) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "shop_id required",
        userMessage: "A shop must be selected before orders can be loaded.",
        actions: ["Choose a shop from the shop selector.", "Retry once a valid shop is selected."],
        fields: { shop_id: ["shop_id is required"] },
        canRetry: false,
      });
    }

    const limit = searchParams.get("limit");
    const offset = searchParams.get("offset");
    const data = await getShopReceipts(token, Number(shopId), {
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : undefined,
    });
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    console.error("Receipts error:", e);
    return errorResponse(
      fromUnknownError(e, {
        code: "ETSY_API_FAILED",
        message: "Failed to load receipts",
        userMessage: "We could not load receipts for this shop.",
        actions: ["Refresh and try again.", "If this continues, reconnect Etsy and retry."],
      })
    );
  }
}
