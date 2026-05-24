/**
 * PATCH /api/inventory/[id]/pictures/reorder
 *
 * Reorders pictures across slots, renames files on disk,
 * and regenerates thumbnail (ADR-026 §6).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getDb } from "@/lib/sqlite";
import { reorderPictures } from "@/lib/picture-storage";

async function getInventoryId(context: { params: Promise<{ id: string }> }): Promise<number> {
  const id = parsePositiveInt((await context.params).id);
  if (!id) {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid inventory id",
      userMessage: "Inventory id must be a positive integer.",
      actions: ["Check the URL and retry."],
      fields: { id: ["Must be a positive integer"] },
      canRetry: false,
    });
  }
  return id;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const inventoryId = await getInventoryId(context);
    const body = (await request.json().catch(() => ({}))) as { pictures?: unknown[] };
    const pictures = Array.isArray(body.pictures) ? body.pictures : null;
    if (!pictures) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid reorder payload",
        userMessage: "pictures must be an array of paths.",
        actions: ['Send {"pictures":[...]} and retry.'],
        fields: { pictures: ["Must be an array"] },
        canRetry: false,
      });
    }

    const newOrder: (string | null)[] = [];
    for (let i = 0; i < 10; i++) {
      const val = pictures[i];
      newOrder.push(typeof val === "string" && val.trim() ? val.trim() : null);
    }

    await reorderPictures(inventoryId, newOrder);

    const item = getDb().prepare("SELECT * FROM inventory WHERE id = ?").get(inventoryId);
    if (!item) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Inventory item not found",
        userMessage: "The selected inventory item was not found.",
        actions: ["Refresh and retry."],
        canRetry: false,
      });
    }
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to reorder pictures",
        userMessage: "We could not reorder item pictures.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
