import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { markOrderShipped } from "@/lib/records";

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
    const id = await getOrderId(context);

    const body = (await request.json().catch(() => ({}))) as {
      shipper?: string;
      shipping_date?: string;
      seller_shipping_cost?: number;
      force_unpaid?: boolean;
    };

    const order = markOrderShipped(id, {
      shipper: typeof body.shipper === "string" ? body.shipper : undefined,
      shipping_date: typeof body.shipping_date === "string" ? body.shipping_date : undefined,
      seller_shipping_cost:
        typeof body.seller_shipping_cost === "number" ? body.seller_shipping_cost : undefined,
      force_unpaid: body.force_unpaid === true,
    });

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
        message: "Failed to mark order shipped",
        userMessage: "We could not mark the order as shipped.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export const PATCH = POST;
