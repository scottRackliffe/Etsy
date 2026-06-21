import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import fs from "node:fs";
import path from "node:path";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getDb } from "@/lib/sqlite";
import { logActivity } from "@/lib/activity-log";
import { isEasyPostConfigured, buyLabel, getTrackingUrl } from "@/lib/easypost";

export async function POST(
  request: Request,
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

    if (!isEasyPostConfigured()) {
      throw new ApiRouteError({
        status: 400,
        code: "SHIPPING_NOT_CONFIGURED",
        message: "EasyPost is not configured",
        userMessage:
          "Shipping integration is not set up. Add your EasyPost API key in Settings → Shipping.",
        actions: ["Go to Settings → Shipping and enter your EasyPost API key."],
        canRetry: false,
      });
    }

    const body = (await request.json().catch(() => ({}))) as {
      shipment_id?: string;
      rate_id?: string;
    };

    if (!body.shipment_id || !body.rate_id) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Missing shipment_id or rate_id",
        userMessage: "Both shipment_id and rate_id are required to purchase a label.",
        actions: ["Get rates first, then select a rate to purchase."],
        fields: {
          ...(body.shipment_id ? {} : { shipment_id: ["Required"] }),
          ...(body.rate_id ? {} : { rate_id: ["Required"] }),
        },
        canRetry: false,
      });
    }

    if (order.label_url) {
      throw new ApiRouteError({
        status: 409,
        code: "LABEL_ALREADY_PURCHASED",
        message: "A label has already been purchased for this order",
        userMessage:
          "A shipping label has already been purchased for this order. Void the existing label first if you need a new one.",
        actions: ["Void the existing label before purchasing a new one."],
        canRetry: false,
      });
    }

    const result = await buyLabel(body.shipment_id, body.rate_id);

    const labelDir = path.join(process.cwd(), "data", "labels", String(orderId));
    fs.mkdirSync(labelDir, { recursive: true });
    const labelPath = path.join(labelDir, "label.pdf");
    const labelResp = await fetch(result.label_url);
    const labelBuffer = Buffer.from(await labelResp.arrayBuffer());
    fs.writeFileSync(labelPath, labelBuffer);
    const localLabelPath = `data/labels/${orderId}/label.pdf`;

    const carrierService = `${result.carrier} ${result.service}`;
    const now = new Date().toISOString();

    getDb()
      .prepare(
        `UPDATE orders
         SET tracking_number = ?,
             easypost_shipment_id = ?,
             label_url = ?,
             label_format = 'pdf',
             shipping_rate_cents = ?,
             shipping_carrier_service = ?,
             shipping_date = COALESCE(shipping_date, ?),
             updated_at = ?
         WHERE id = ?`
      )
      .run(
        result.tracking_number,
        body.shipment_id,
        localLabelPath,
        result.rate_cents,
        carrierService,
        now,
        now,
        orderId
      );

    logActivity({
      action: "shipping.label_purchased",
      entityType: "order",
      entityId: orderId,
      entityLabel: String(order.order_number ?? orderId),
      detail: {
        carrier: result.carrier,
        service: result.service,
        tracking_number: result.tracking_number,
        rate_cents: result.rate_cents,
      },
      source: "user",
    });

    const trackingUrl = getTrackingUrl(result.carrier, result.tracking_number);

    return NextResponse.json({
      ok: true,
      tracking_number: result.tracking_number,
      tracking_url: trackingUrl,
      label_url: `/api/orders/${orderId}/shipping-label`,
      carrier: result.carrier,
      service: result.service,
      rate_cents: result.rate_cents,
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to purchase shipping label",
        userMessage: "We could not purchase the shipping label.",
        actions: ["Check your EasyPost balance and try again."],
      })
    );
  }
}
