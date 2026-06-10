import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { enrichInventoryItem } from "@/lib/inventory-profit";
import { assertRecordNotStale, getIfMatchHeader } from "@/lib/if-match";
import { deleteInventory, getInventory, patchInventory } from "@/lib/records";
import { getDb } from "@/lib/sqlite";
import { logActivity } from "@/lib/activity-log";

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
    assertRecordNotStale("inventory", id, getIfMatchHeader(request));
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
    logActivity({
      action: "inventory.updated",
      entityType: "inventory",
      entityId: id,
      entityLabel: (item as { item_number?: string }).item_number ?? undefined,
    });
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
    const existing = getInventory(id);

    const orderItemCount = getDb()
      .prepare("SELECT COUNT(*) as count FROM order_items WHERE inventory_id = ?")
      .get(id) as { count: number };
    if (orderItemCount.count > 0) {
      throw new ApiRouteError({
        status: 409,
        code: "REFERENTIAL_INTEGRITY",
        message: "Cannot delete inventory item with order references",
        userMessage: "This item is referenced by orders and cannot be deleted. You can retire it instead.",
        actions: ["Change the status to Retired instead of deleting.", "Remove the item from orders first."],
        canRetry: false,
      });
    }

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
    logActivity({
      action: "inventory.deleted",
      entityType: "inventory",
      entityId: id,
      entityLabel: (existing as { item_number?: string } | undefined)?.item_number ?? undefined,
    });
    return new NextResponse(null, { status: 204 });
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
