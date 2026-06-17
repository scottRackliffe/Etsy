import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getDb } from "@/lib/sqlite";
import { getPurchase, patchPurchase, deletePurchase } from "@/lib/records";

async function getPurchaseId(context: { params: Promise<{ id: string }> }): Promise<number> {
  const id = parsePositiveInt((await context.params).id);
  if (!id) {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid purchase id",
      userMessage: "The purchase id must be a positive integer.",
      actions: ["Check the URL and retry."],
      fields: { id: ["Must be a positive integer"] },
      canRetry: false,
    });
  }
  return id;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const id = await getPurchaseId(context);
    const purchase = getPurchase(id);
    if (!purchase) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Purchase not found",
        userMessage: "The requested purchase was not found.",
        actions: ["Refresh and retry."],
        canRetry: false,
      });
    }
    return NextResponse.json({ ok: true, purchase });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load purchase",
        userMessage: "We could not load the purchase.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const id = await getPurchaseId(context);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const purchase = patchPurchase(id, body);
    if (!purchase) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Purchase not found",
        userMessage: "The requested purchase was not found.",
        actions: ["Refresh and retry."],
        canRetry: false,
      });
    }
    return NextResponse.json({ ok: true, purchase });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to update purchase",
        userMessage: "We could not update the purchase.",
        actions: ["Retry in a moment.", "Check request data and retry."],
      })
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const id = await getPurchaseId(context);

    // Check if this purchase was created from a receipt link — if so, unlink the receipt item too
    const purchase = getPurchase(id) as { inventory_id?: number; notes?: string } | null;
    if (purchase?.inventory_id && purchase.notes) {
      const match = purchase.notes.match(/Linked from scanned receipt #(\d+)/);
      if (match) {
        const receiptId = Number(match[1]);
        const db = getDb();
        db.prepare(
          "UPDATE receipt_items SET inventory_id = NULL WHERE receipt_id = ? AND inventory_id = ?"
        ).run(receiptId, purchase.inventory_id);
      }
    }

    const deleted = deletePurchase(id);
    if (!deleted) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Purchase not found",
        userMessage: "The requested purchase was not found.",
        actions: ["Refresh and retry."],
        canRetry: false,
      });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to delete purchase",
        userMessage: "We could not delete the purchase.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
