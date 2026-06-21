import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import fs from "node:fs";
import path from "node:path";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getDb } from "@/lib/sqlite";
import { getSetting } from "@/lib/settings-store";
import { logActivity } from "@/lib/activity-log";
import {
  isEasyPostConfigured,
  createShipmentAndGetRates,
  buyLabel,
  getTrackingUrl,
} from "@/lib/easypost";
import type { ShippingRate } from "@/lib/easypost";

type BatchOrderResult = {
  order_id: number;
  success: boolean;
  tracking_number?: string;
  tracking_url?: string;
  carrier?: string;
  service?: string;
  rate_cents?: number;
  error?: string;
};

function pickRate(
  rates: ShippingRate[],
  preference: "cheapest" | "fastest"
): ShippingRate | null {
  if (rates.length === 0) return null;
  if (preference === "fastest") {
    const sorted = [...rates].sort((a, b) => {
      const aDays = a.delivery_days ?? 999;
      const bDays = b.delivery_days ?? 999;
      return aDays - bDays;
    });
    return sorted[0];
  }
  const sorted = [...rates].sort(
    (a, b) => parseFloat(a.rate) - parseFloat(b.rate)
  );
  return sorted[0];
}

export async function POST(request: Request) {
  try {
    requireEtsyAccessToken(await cookies());

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
      order_ids?: number[];
      rate_preference?: "cheapest" | "fastest";
      weight_oz?: number;
      length_in?: number;
      width_in?: number;
      height_in?: number;
    };

    const orderIds = body.order_ids;
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "order_ids is required and must be a non-empty array",
        userMessage: "Select at least one order for batch label purchase.",
        actions: ["Select orders and try again."],
        fields: { order_ids: ["Required, must be a non-empty array of order IDs"] },
        canRetry: false,
      });
    }

    if (orderIds.length > 50) {
      throw new ApiRouteError({
        status: 400,
        code: "BATCH_TOO_LARGE",
        message: "Too many orders in batch",
        userMessage: "Batch label purchases are limited to 50 orders at a time.",
        actions: ["Reduce the selection to 50 or fewer orders."],
        canRetry: false,
      });
    }

    const ratePreference = body.rate_preference === "fastest" ? "fastest" : "cheapest";

    const bizName = getSetting("business_name");
    const bizStreet = getSetting("business_address_line_1");
    const bizCity = getSetting("business_city");
    const bizState = getSetting("business_state_province");
    const bizZip = getSetting("business_postal_code");
    const bizCountry = getSetting("business_country");

    if (!bizStreet || !bizCity || !bizState || !bizZip || !bizCountry) {
      throw new ApiRouteError({
        status: 400,
        code: "SHIPPING_NOT_CONFIGURED",
        message: "Business address is incomplete",
        userMessage:
          "Your business address is incomplete. Fill it in under Config → Business Info before purchasing labels.",
        actions: ["Go to Settings → Business Info and complete your address."],
        canRetry: false,
      });
    }

    const fromAddress = {
      name: bizName ?? "",
      street1: bizStreet,
      city: bizCity,
      state: bizState,
      zip: bizZip,
      country: bizCountry,
    };

    const weightOz =
      typeof body.weight_oz === "number"
        ? body.weight_oz
        : parseFloat(getSetting("easypost.default_weight_oz") ?? "16");
    const lengthIn =
      typeof body.length_in === "number"
        ? body.length_in
        : parseFloat(getSetting("easypost.default_length_in") ?? "0") || undefined;
    const widthIn =
      typeof body.width_in === "number"
        ? body.width_in
        : parseFloat(getSetting("easypost.default_width_in") ?? "0") || undefined;
    const heightIn =
      typeof body.height_in === "number"
        ? body.height_in
        : parseFloat(getSetting("easypost.default_height_in") ?? "0") || undefined;

    const db = getDb();
    const results: BatchOrderResult[] = [];
    let succeeded = 0;
    let failed = 0;

    for (const oid of orderIds) {
      try {
        const order = db
          .prepare("SELECT * FROM orders WHERE id = ?")
          .get(oid) as Record<string, unknown> | undefined;

        if (!order) {
          results.push({ order_id: oid, success: false, error: "Order not found" });
          failed++;
          continue;
        }

        if (order.label_url) {
          results.push({
            order_id: oid,
            success: false,
            error: "Label already purchased",
          });
          failed++;
          continue;
        }

        const shipToFields = [
          "ship_to_first_name",
          "ship_to_last_name",
          "ship_to_address_line_1",
          "ship_to_city",
          "ship_to_state_province",
          "ship_to_postal_code",
          "ship_to_country",
        ] as const;

        const missingFields = shipToFields.filter(
          (f) => !order[f] || String(order[f]).trim() === ""
        );
        if (missingFields.length > 0) {
          results.push({
            order_id: oid,
            success: false,
            error: `Incomplete ship-to address: ${missingFields.join(", ")}`,
          });
          failed++;
          continue;
        }

        const toAddress = {
          name: `${String(order.ship_to_first_name ?? "")} ${String(order.ship_to_last_name ?? "")}`.trim(),
          street1: String(order.ship_to_address_line_1 ?? ""),
          street2: order.ship_to_address_line_2
            ? String(order.ship_to_address_line_2)
            : undefined,
          city: String(order.ship_to_city ?? ""),
          state: String(order.ship_to_state_province ?? ""),
          zip: String(order.ship_to_postal_code ?? ""),
          country: String(order.ship_to_country ?? ""),
        };

        const shipmentResult = await createShipmentAndGetRates({
          fromAddress,
          toAddress,
          parcel: {
            weight: weightOz,
            length: lengthIn,
            width: widthIn,
            height: heightIn,
          },
        });

        const selectedRate = pickRate(shipmentResult.rates, ratePreference);
        if (!selectedRate) {
          results.push({
            order_id: oid,
            success: false,
            error: "No rates available",
          });
          failed++;
          continue;
        }

        const labelResult = await buyLabel(shipmentResult.shipment_id, selectedRate.id);

        const labelDir = path.join(process.cwd(), "data", "labels", String(oid));
        fs.mkdirSync(labelDir, { recursive: true });
        const labelFilePath = path.join(labelDir, "label.pdf");
        const labelResp = await fetch(labelResult.label_url);
        const labelBuffer = Buffer.from(await labelResp.arrayBuffer());
        fs.writeFileSync(labelFilePath, labelBuffer);
        const localLabelPath = `data/labels/${oid}/label.pdf`;

        const carrierService = `${labelResult.carrier} ${labelResult.service}`;
        const now = new Date().toISOString();

        db.prepare(
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
        ).run(
          labelResult.tracking_number,
          shipmentResult.shipment_id,
          localLabelPath,
          labelResult.rate_cents,
          carrierService,
          now,
          now,
          oid
        );

        logActivity({
          action: "shipping.label_purchased",
          entityType: "order",
          entityId: oid,
          entityLabel: String(order.order_number ?? oid),
          detail: {
            carrier: labelResult.carrier,
            service: labelResult.service,
            tracking_number: labelResult.tracking_number,
            rate_cents: labelResult.rate_cents,
            batch: true,
          },
          source: "user",
        });

        results.push({
          order_id: oid,
          success: true,
          tracking_number: labelResult.tracking_number,
          tracking_url: getTrackingUrl(labelResult.carrier, labelResult.tracking_number),
          carrier: labelResult.carrier,
          service: labelResult.service,
          rate_cents: labelResult.rate_cents,
        });
        succeeded++;
      } catch (err) {
        results.push({
          order_id: oid,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
        failed++;
      }
    }

    logActivity({
      action: "shipping.batch_completed",
      entityType: "order",
      detail: {
        total: orderIds.length,
        succeeded,
        failed,
        rate_preference: ratePreference,
      },
      source: "user",
    });

    return NextResponse.json({
      ok: true,
      total: orderIds.length,
      succeeded,
      failed,
      results,
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to process batch label purchase",
        userMessage: "We could not complete the batch label purchase.",
        actions: ["Check your EasyPost balance and try again."],
      })
    );
  }
}
