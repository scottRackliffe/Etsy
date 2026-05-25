import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { deleteOrderItem, getOrderItem, patchOrderItem } from "@/lib/order-items";

async function getItemId(context: { params: Promise<{ id: string }> }): Promise<number> {
  const id = parsePositiveInt((await context.params).id);
  if (!id) {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid line item id",
      userMessage: "The line item id must be a positive integer.",
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
    const itemId = await getItemId(context);
    if (!getOrderItem(itemId)) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Line item not found",
        userMessage: "That line item was not found.",
        actions: ["Refresh and retry."],
        canRetry: false,
      });
    }

    const body = (await request.json().catch(() => ({}))) as {
      quantity?: number;
      unit_price?: number | null;
    };
    const updates: { quantity?: number; unit_price?: number | null } = {};
    if (body.quantity !== undefined) {
      if (typeof body.quantity !== "number" || !Number.isFinite(body.quantity) || body.quantity < 1) {
        throw new ApiRouteError({
          status: 400,
          code: "VALIDATION_ERROR",
          message: "Invalid quantity",
          userMessage: "Quantity must be at least 1.",
          actions: ["Enter a valid quantity and retry."],
          fields: { quantity: ["Must be a number >= 1"] },
          canRetry: false,
        });
      }
      updates.quantity = body.quantity;
    }
    if (body.unit_price !== undefined) {
      if (
        body.unit_price !== null &&
        (typeof body.unit_price !== "number" || !Number.isFinite(body.unit_price))
      ) {
        throw new ApiRouteError({
          status: 400,
          code: "VALIDATION_ERROR",
          message: "Invalid unit_price",
          userMessage: "Unit price must be a number or null.",
          actions: ["Enter a valid unit price and retry."],
          fields: { unit_price: ["Must be a number or null"] },
          canRetry: false,
        });
      }
      updates.unit_price = body.unit_price;
    }

    const order = patchOrderItem(itemId, updates);
    if (!order) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Line item not found",
        userMessage: "That line item was not found.",
        actions: ["Refresh and retry."],
        canRetry: false,
      });
    }

    return NextResponse.json({ ok: true, order });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to update line item",
        userMessage: "We could not update the line item.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const itemId = await getItemId(context);
    const order = deleteOrderItem(itemId);
    if (!order) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Line item not found",
        userMessage: "That line item was not found.",
        actions: ["Refresh and retry."],
        canRetry: false,
      });
    }
    return NextResponse.json({ ok: true, order });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to delete line item",
        userMessage: "We could not remove the line item.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
