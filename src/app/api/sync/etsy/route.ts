import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getShopReceipts } from "@/lib/etsy";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { resolveEtsyAccessToken } from "@/lib/auth-session";
import { upsertEtsyReceipt } from "@/lib/records";

export async function POST(request: NextRequest) {
  try {
    const token = await resolveEtsyAccessToken(await cookies());
    const body = (await request.json().catch(() => ({}))) as {
      shop_id?: number | string;
      limit?: number;
      offset?: number;
    };

    const shopId = parsePositiveInt(body.shop_id != null ? String(body.shop_id) : null);
    if (!shopId) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "shop_id required",
        userMessage: "A valid shop_id is required for sync.",
        actions: ["Select a shop and retry sync."],
        fields: { shop_id: ["Must be a positive integer"] },
        canRetry: false,
      });
    }

    const limit = Number.isFinite(body.limit) ? Math.max(1, Math.min(200, Number(body.limit))) : 50;
    const offset = Number.isFinite(body.offset) ? Math.max(0, Number(body.offset)) : 0;
    const data = await getShopReceipts(token, shopId, { limit, offset });

    for (const receipt of data.results ?? []) {
      upsertEtsyReceipt({
        receipt_id: String(receipt.receipt_id),
        shop_id: String(shopId),
        receipt_json: JSON.stringify(receipt),
      });
    }

    return NextResponse.json({
      ok: true,
      imported: data.results?.length ?? 0,
      total_from_etsy: data.count ?? 0,
      shop_id: shopId,
      limit,
      offset,
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "ETSY_API_FAILED",
        message: "Failed to sync Etsy receipts",
        userMessage: "We could not sync Etsy receipts right now.",
        actions: ["Retry in a moment.", "Reconnect Etsy if your session expired."],
      })
    );
  }
}
