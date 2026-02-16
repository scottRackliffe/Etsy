import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getOrder, patchOrder } from "@/lib/records";

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

export async function GET(_request: Request, context: { params: Promise<{ order_id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const id = await getOrderId(context);
    const order = getOrder(id);
    if (!order) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Order not found",
        userMessage: "The requested order was not found.",
        actions: ["Refresh and retry."],
        canRetry: false,
      });
    }
    return NextResponse.json({ ok: true, order });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load order",
        userMessage: "We could not load the order.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ order_id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const id = await getOrderId(context);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const order = patchOrder(id, body);
    if (!order) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Order not found",
        userMessage: "The requested order was not found.",
        actions: ["Refresh and retry."],
        canRetry: false,
      });
    }
    return NextResponse.json({ ok: true, order });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to update order",
        userMessage: "We could not update the order.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
