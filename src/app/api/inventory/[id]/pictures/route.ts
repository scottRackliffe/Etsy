import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getDb } from "@/lib/sqlite";

function getPictureColumn(slot: number): string {
  if (slot < 1 || slot > 10) {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid picture slot",
      userMessage: "Picture slot must be between 1 and 10.",
      actions: ["Choose a slot from 1 to 10 and retry."],
      fields: { slot: ["Must be between 1 and 10"] },
      canRetry: false,
    });
  }
  return `picture_${slot}`;
}

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

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const inventoryId = await getInventoryId(context);
    const body = (await request.json().catch(() => ({}))) as { slot?: unknown; path?: unknown };
    const slot = Number(body.slot);
    const picturePath = typeof body.path === "string" ? body.path.trim() : "";
    if (!Number.isInteger(slot)) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid slot",
        userMessage: "Picture slot is required.",
        actions: ["Provide a slot from 1 to 10 and retry."],
        fields: { slot: ["Must be an integer"] },
        canRetry: false,
      });
    }
    if (!picturePath) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid picture path",
        userMessage: "Picture path is required.",
        actions: ["Provide picture path and retry."],
        fields: { path: ["Required"] },
        canRetry: false,
      });
    }
    const column = getPictureColumn(slot);
    const db = getDb();
    db.prepare(
      `UPDATE inventory SET ${column} = @path, updated_at = @updated_at WHERE id = @id`
    ).run({
      path: picturePath,
      updated_at: new Date().toISOString(),
      id: inventoryId,
    });
    const item = db.prepare("SELECT * FROM inventory WHERE id = ?").get(inventoryId);
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
        message: "Failed to add picture",
        userMessage: "We could not attach the picture to this item.",
        actions: ["Retry in a moment.", "Check picture path and retry."],
      })
    );
  }
}
