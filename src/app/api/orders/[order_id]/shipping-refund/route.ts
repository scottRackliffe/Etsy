import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getDb } from "@/lib/sqlite";
import { logActivity } from "@/lib/activity-log";
import { refundShipment } from "@/lib/easypost";

export async function POST(
  _request: Request,
  context: { params: Promise<{ order_id: string }> }
) {
  try {
    requireEtsyAccessToken(await cookies());

    const orderId = parsePositiveInt((await context.params).order_id);
    if (!orderId) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid order id",
        userMessage: "The order id must be a positive integer.",
        actions: ["Check the URL and retry."],
        canRetry: false,
      });
    }

    const order = getDb()
      .prepare("SELECT * FROM orders WHERE id = ?")
      .get(orderId) as Record<string, unknown> | undefined;

    if (!order) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Order not found",
        userMessage: "We could not find that order.",
        actions: ["Refresh the Sales tab and try again."],
        canRetry: false,
      });
    }

    const shipmentId = order.easypost_shipment_id as string | null;
    if (!shipmentId) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "No EasyPost shipment found for this order",
        userMessage:
          "This order does not have an EasyPost shipment to refund.",
        actions: ["Only orders with purchased labels can be refunded."],
        canRetry: false,
      });
    }

    const refundStatus = await refundShipment(shipmentId);

    getDb()
      .prepare(
        `UPDATE orders
         SET label_url = NULL,
             label_format = NULL,
             easypost_shipment_id = NULL,
             shipping_rate_cents = NULL,
             shipping_carrier_service = NULL,
             updated_at = ?
         WHERE id = ?`
      )
      .run(new Date().toISOString(), orderId);

    logActivity({
      action: "shipping.label_voided",
      entityType: "order",
      entityId: orderId,
      entityLabel: String(order.order_number ?? orderId),
      detail: { refund_status: refundStatus, shipment_id: shipmentId },
      source: "user",
    });

    return NextResponse.json({ ok: true, refund_status: refundStatus });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to refund shipping label",
        userMessage: "We could not process the label refund.",
        actions: ["Try again in a moment."],
      })
    );
  }
}
