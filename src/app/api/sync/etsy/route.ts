/**
 * POST /api/sync/etsy
 *
 * Full Etsy receipt sync per ADR-019: fetches receipts from Etsy, creates/matches
 * customers, addresses, orders, and order_items in the local database.
 * Idempotent by etsy_receipt_id. Concurrent sync protection via settings lock.
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { syncEtsyReceipts } from "@/lib/etsy-sync";
import { getSetting } from "@/lib/settings-store";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const body = (await request.json().catch(() => ({}))) as {
      shop_id?: number | string;
    };

    const shopId = parsePositiveInt(body.shop_id != null ? String(body.shop_id) : null)
      ?? parsePositiveInt(getSetting("etsy.active_shop_id"));

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

    const result = await syncEtsyReceipts(cookieStore, shopId);

    if (result.synced === 0 && result.skipped_already_imported === 0 && result.skipped_errors.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "ETSY_API_FAILED",
            message: "All receipts failed to import",
            user_message: "We could not import any receipts. Check that your Etsy shop has orders.",
            actions: ["Review the skipped receipts below.", "Retry in a moment."],
            can_retry: true,
          },
          sync_result: result,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      ...result,
      last_synced_at: getSetting("last_etsy_sync_at"),
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
