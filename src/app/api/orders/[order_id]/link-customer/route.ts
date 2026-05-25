import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { linkOrderCustomer } from "@/lib/records";

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
    const body = (await request.json().catch(() => ({}))) as { customer_id?: number };
    const customerId =
      typeof body.customer_id === "number" &&
      Number.isInteger(body.customer_id) &&
      body.customer_id > 0
        ? body.customer_id
        : null;
    if (!customerId) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "customer_id required",
        userMessage: "Please select a customer to link.",
        actions: ["Provide customer_id and retry."],
        fields: { customer_id: ["Required positive integer"] },
        canRetry: false,
      });
    }

    const order = linkOrderCustomer(orderId, customerId);
    if (!order) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Order or customer not found",
        userMessage: "The order or customer could not be found.",
        actions: ["Refresh and retry."],
        canRetry: false,
      });
    }

    return NextResponse.json({ ok: true, order });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to link customer",
        userMessage: "We could not link the customer to this order.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
