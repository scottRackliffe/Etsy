import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { addOrderItem } from "@/lib/order-items";
import { getOrder } from "@/lib/records";

async function getOrderId(context: { params: Promise<{ order_id: string }> }): Promise<number> {
  const id = parsePositiveInt((await context.params).order_id);
  if (!id) {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid order id",
      userMessage: "The order id must be a positive integer.",
      actions: ["Check the URL and retry."],
      fields: { order_id: ["Must be a positive integer"] },
      canRetry: false,
    });
  }
  return id;
}

export async function POST(request: Request, context: { params: Promise<{ order_id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const orderId = await getOrderId(context);
    if (!getOrder(orderId)) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Order not found",
        userMessage: "The requested order was not found.",
        actions: ["Refresh and retry."],
        canRetry: false,
      });
    }

    const body = (await request.json().catch(() => ({}))) as {
      inventory_id?: number;
      quantity?: number;
      unit_price?: number | null;
    };
    const inventoryId =
      typeof body.inventory_id === "number" &&
      Number.isInteger(body.inventory_id) &&
      body.inventory_id > 0
        ? body.inventory_id
        : null;
    if (!inventoryId) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "inventory_id required",
        userMessage: "Select an inventory item to add.",
        actions: ["Provide inventory_id and retry."],
        fields: { inventory_id: ["Required positive integer"] },
        canRetry: false,
      });
    }

    const quantity =
      typeof body.quantity === "number" && Number.isFinite(body.quantity) ? body.quantity : 1;
    const unitPrice =
      body.unit_price === null
        ? null
        : typeof body.unit_price === "number" && Number.isFinite(body.unit_price)
          ? body.unit_price
          : undefined;

    const order = addOrderItem(orderId, inventoryId, quantity, unitPrice);
    if (!order) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Could not add line item",
        userMessage:
          "We could not add that line item. The order may be void or the inventory item was not found.",
        actions: ["Check the order status and inventory item, then retry."],
        canRetry: false,
      });
    }

    return NextResponse.json({ ok: true, order }, { status: 201 });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to add order line item",
        userMessage: "We could not add the line item.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
