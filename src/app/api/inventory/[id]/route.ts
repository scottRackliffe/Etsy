import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { enrichInventoryItem } from "@/lib/inventory-profit";
import { deleteInventory, getInventory, patchInventory } from "@/lib/records";

async function getInventoryId(context: { params: Promise<{ id: string }> }): Promise<number> {
  const id = parsePositiveInt((await context.params).id);
  if (!id) {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid inventory id",
      userMessage: "The inventory id must be a positive integer.",
      actions: ["Check the item URL and retry."],
      fields: { id: ["Must be a positive integer"] },
      canRetry: false,
    });
  }
  return id;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const id = await getInventoryId(context);
    const item = getInventory(id);
    if (!item) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Inventory item not found",
        userMessage: "The requested inventory item was not found.",
        actions: ["Refresh inventory and select another item."],
        canRetry: false,
      });
    }
    return NextResponse.json({
      ok: true,
      item: enrichInventoryItem(item as Record<string, unknown>),
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load inventory item",
        userMessage: "We could not load the inventory item.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const id = await getInventoryId(context);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const item = patchInventory(id, body);
    if (!item) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Inventory item not found",
        userMessage: "The requested inventory item was not found.",
        actions: ["Refresh inventory and retry."],
        canRetry: false,
      });
    }
    return NextResponse.json({
      ok: true,
      item: enrichInventoryItem(item as Record<string, unknown>),
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to update inventory item",
        userMessage: "We could not update the inventory item.",
        actions: ["Retry in a moment.", "Check the request data and retry."],
      })
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const id = await getInventoryId(context);
    const deleted = deleteInventory(id);
    if (!deleted) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Inventory item not found",
        userMessage: "The requested inventory item was not found.",
        actions: ["Refresh inventory and retry."],
        canRetry: false,
      });
    }
    return NextResponse.json({ ok: true, deleted: true });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to delete inventory item",
        userMessage: "We could not delete the inventory item.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
