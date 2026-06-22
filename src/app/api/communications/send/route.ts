import { NextResponse } from "next/server";
import { errorResponse, fromUnknownError, ApiRouteError } from "@/lib/api-error";
import {
  MESSAGE_TYPES,
  sendCommunications,
  loadOrderForComm,
  type MessageType,
  type Channel,
} from "@/lib/communications";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      type?: unknown;
      channel?: unknown;
      order_ids?: unknown;
    };

    const type = body.type as MessageType | undefined;
    const channel = body.channel as Channel | undefined;
    const orderIds = body.order_ids;

    if (!type || !MESSAGE_TYPES[type]) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid message type",
        userMessage: "Specify a valid message type: payment_reminder or thank_you.",
        canRetry: false,
      });
    }

    const allowedChannels = MESSAGE_TYPES[type].allowedChannels;
    if (!channel || !allowedChannels.includes(channel)) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid channel",
        userMessage: `Channel must be one of: ${allowedChannels.join(", ")}.`,
        canRetry: false,
      });
    }

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "order_ids must be a non-empty array",
        userMessage: "Select at least one order to send.",
        canRetry: false,
      });
    }

    const parsedIds: number[] = orderIds
      .map((id: unknown) => (typeof id === "number" ? id : parseInt(String(id), 10)))
      .filter((id: number) => Number.isFinite(id) && id > 0);

    if (parsedIds.length === 0) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "No valid order IDs provided",
        userMessage: "No valid order IDs were included in the request.",
        canRetry: false,
      });
    }

    // Server-side compliance gate: payment reminders only for manual-channel orders.
    if (type === "payment_reminder") {
      for (const orderId of parsedIds) {
        const loaded = loadOrderForComm(orderId);
        if (loaded && loaded.order.source_channel !== "manual") {
          throw new ApiRouteError({
            status: 400,
            code: "VALIDATION_ERROR",
            message: "Payment reminder compliance violation",
            userMessage:
              "Payment reminders are only available for manually-entered orders.",
            actions: ["Remove Etsy-channel orders from the selection."],
            canRetry: false,
          });
        }
      }
    }

    const results = await sendCommunications({ type, channel, orderIds: parsedIds });

    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to send communications",
        userMessage: "We could not send the messages. Please try again.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
