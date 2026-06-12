import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getDb } from "@/lib/sqlite";
import { getSetting } from "@/lib/settings-store";
import { isEasyPostConfigured, createShipmentAndGetRates } from "@/lib/easypost";

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
          "Shipping integration is not set up. Add your EasyPost API key in Config → Shipping.",
        actions: ["Go to Config → Shipping and enter your EasyPost API key."],
        canRetry: false,
      });
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

    const missing = shipToFields.filter(
      (f) => !order[f] || String(order[f]).trim() === ""
    );
    if (missing.length > 0) {
      throw new ApiRouteError({
        status: 400,
        code: "ADDRESS_INVALID",
        message: "Incomplete ship-to address",
        userMessage:
          "The ship-to address on this order is incomplete. Fill in the missing fields and try again.",
        actions: [
          `Missing: ${missing.map((f) => f.replace(/^ship_to_/, "").replace(/_/g, " ")).join(", ")}.`,
          "Edit the order on the Sales tab and try again.",
        ],
        canRetry: false,
      });
    }

    const bizName = getSetting("business_name");
    const bizStreet = getSetting("business_address_line_1");
    const bizCity = getSetting("business_address_city");
    const bizState = getSetting("business_address_state");
    const bizZip = getSetting("business_address_postal_code");
    const bizCountry = getSetting("business_address_country");

    if (!bizStreet || !bizCity || !bizState || !bizZip || !bizCountry) {
      throw new ApiRouteError({
        status: 400,
        code: "SHIPPING_NOT_CONFIGURED",
        message: "Business address is incomplete",
        userMessage:
          "Your business address is incomplete. Fill it in under Config → Business Info before purchasing labels.",
        actions: ["Go to Config → Business Info and complete your address."],
        canRetry: false,
      });
    }

    const body = (await request.json().catch(() => ({}))) as {
      weight_oz?: number;
      length_in?: number;
      width_in?: number;
      height_in?: number;
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

    const result = await createShipmentAndGetRates({
      fromAddress: {
        name: bizName ?? "",
        street1: bizStreet,
        city: bizCity,
        state: bizState,
        zip: bizZip,
        country: bizCountry,
      },
      toAddress: {
        name: `${String(order.ship_to_first_name ?? "")} ${String(order.ship_to_last_name ?? "")}`.trim(),
        street1: String(order.ship_to_address_line_1 ?? ""),
        street2: order.ship_to_address_line_2
          ? String(order.ship_to_address_line_2)
          : undefined,
        city: String(order.ship_to_city ?? ""),
        state: String(order.ship_to_state_province ?? ""),
        zip: String(order.ship_to_postal_code ?? ""),
        country: String(order.ship_to_country ?? ""),
      },
      parcel: {
        weight: weightOz,
        length: lengthIn,
        width: widthIn,
        height: heightIn,
      },
    });

    return NextResponse.json({
      ok: true,
      shipment_id: result.shipment_id,
      rates: result.rates,
      address_verified: result.address_verified,
      address_corrections: result.address_corrections,
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to get shipping rates",
        userMessage: "We could not retrieve shipping rates for this order.",
        actions: ["Check the ship-to address and try again."],
      })
    );
  }
}
