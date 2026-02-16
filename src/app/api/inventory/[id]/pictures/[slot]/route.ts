import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getDb } from "@/lib/sqlite";

async function parseParams(context: {
  params: Promise<{ id: string; slot: string }>;
}): Promise<{ inventoryId: number; slot: number }> {
  const params = await context.params;
  const inventoryId = parsePositiveInt(params.id);
  const slot = parsePositiveInt(params.slot);
  if (!inventoryId) {
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
  if (!slot || slot < 1 || slot > 10) {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid picture slot",
      userMessage: "Picture slot must be between 1 and 10.",
      actions: ["Check the URL and retry."],
      fields: { slot: ["Must be between 1 and 10"] },
      canRetry: false,
    });
  }
  return { inventoryId, slot };
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; slot: string }> }
) {
  try {
    requireEtsyAccessToken(await cookies());
    const { inventoryId, slot } = await parseParams(context);
    const column = `picture_${slot}`;
    getDb()
      .prepare(`UPDATE inventory SET ${column} = NULL, updated_at = @updated_at WHERE id = @id`)
      .run({ updated_at: new Date().toISOString(), id: inventoryId });
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
        message: "Failed to delete picture",
        userMessage: "We could not delete the picture from this item.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
