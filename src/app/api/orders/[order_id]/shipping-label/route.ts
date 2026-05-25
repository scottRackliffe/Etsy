import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getOrder } from "@/lib/records";
import {
  getShippingInfoForCarrier,
  isOrderShipToComplete,
  isShippingInfoComplete,
  missingShipToFields,
} from "@/lib/shipping-info";
import { buildShippingLabelHtml } from "@/lib/shipping-label";

export async function GET(
  request: NextRequest,
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

    const order = getOrder(orderId) as Record<string, unknown> | null;
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

    const snapshot = order as {
      id: number;
      shipper?: string | null;
      order_number?: string | null;
      tracking_number?: string | null;
      ship_to_first_name?: string | null;
      ship_to_last_name?: string | null;
      ship_to_address_line_1?: string | null;
      ship_to_address_line_2?: string | null;
      ship_to_city?: string | null;
      ship_to_state_province?: string | null;
      ship_to_country?: string | null;
      ship_to_postal_code?: string | null;
    };

    if (!isOrderShipToComplete(snapshot)) {
      const missing = missingShipToFields(snapshot);
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Incomplete ship-to address",
        userMessage:
          "Complete the ship-to address and carrier on this order before printing a label.",
        actions: [
          `Missing: ${missing.join(", ")}.`,
          "Edit the order on the Sales tab and try again.",
        ],
        canRetry: false,
      });
    }

    const shipper = snapshot.shipper!.trim();
    const shippingInfo = getShippingInfoForCarrier(shipper);
    if (!isShippingInfoComplete(shipper, shippingInfo)) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Shipping Info missing",
        userMessage: `Shipping Info is needed for ${shipper} labels. Go to Config → Shipping Info to add it.`,
        actions: [
          "Open Config → Shipping Info",
          "Add return address and any required account number.",
        ],
        canRetry: false,
      });
    }

    const html = buildShippingLabelHtml(snapshot, shipper, shippingInfo);
    const format = request.nextUrl.searchParams.get("format")?.toLowerCase() ?? "html";
    if (format !== "html") {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Unsupported label format",
        userMessage: "Shipping labels support format=html only.",
        actions: ["Use format=html and retry."],
        canRetry: true,
      });
    }

    return new NextResponse(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to generate shipping label",
        userMessage: "We could not generate the shipping label.",
        actions: ["Check ship-to address and Shipping Info in Config.", "Try again."],
      })
    );
  }
}
