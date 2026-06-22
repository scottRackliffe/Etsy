import { NextResponse } from "next/server";
import { errorResponse, fromUnknownError, ApiRouteError } from "@/lib/api-error";
import {
  MESSAGE_TYPES,
  renderTemplate,
  loadOrderForComm,
  type MessageType,
} from "@/lib/communications";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      type?: unknown;
      order_id?: unknown;
    };

    const type = body.type as MessageType | undefined;
    const orderId = typeof body.order_id === "number" ? body.order_id : parseInt(String(body.order_id ?? ""), 10);

    if (!type || !MESSAGE_TYPES[type]) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid message type",
        userMessage: "Specify a valid message type: payment_reminder or thank_you.",
        canRetry: false,
      });
    }
    if (!orderId || !Number.isFinite(orderId) || orderId <= 0) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid order_id",
        userMessage: "A valid order ID is required for preview.",
        canRetry: false,
      });
    }

    const loaded = loadOrderForComm(orderId);
    if (!loaded) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Order not found",
        userMessage: "That order was not found or is not active.",
        canRetry: false,
      });
    }

    const { subject, body: bodyText, unknown_tokens } = renderTemplate(
      type,
      loaded.order,
      loaded.customer
    );

    const catalogEntry = MESSAGE_TYPES[type];
    const channelDefault =
      loaded.order.source_channel === "etsy" && type === "thank_you"
        ? "print"
        : catalogEntry.defaultChannel;

    return NextResponse.json({
      ok: true,
      subject,
      body: bodyText,
      channel_default: channelDefault,
      unknown_tokens,
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to render preview",
        userMessage: "We could not render the message preview. Please try again.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
