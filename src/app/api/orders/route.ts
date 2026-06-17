import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parseOptionalString, parsePagination } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { OrderValidationError, prepareOrderPayload } from "@/lib/order-validation";
import { createOrder, listOrders } from "@/lib/records";
import { logActivity } from "@/lib/activity-log";
import { getDb } from "@/lib/sqlite";

export async function GET(request: NextRequest) {
  try {
    requireEtsyAccessToken(await cookies());
    const params = request.nextUrl.searchParams;
    const { limit, offset } = parsePagination(params);
    const shipRaw = parseOptionalString(params, "shipping_status");
    const shipping_status =
      shipRaw === "shipped" || shipRaw === "not_shipped" ? shipRaw : undefined;
    const customerIdRaw = parseOptionalString(params, "customer_id");
    const customer_id = customerIdRaw ? parseInt(customerIdRaw, 10) : undefined;
    const { items, total } = listOrders({
      limit,
      offset,
      search: parseOptionalString(params, "search"),
      order_status: parseOptionalString(params, "order_status"),
      payment_status: parseOptionalString(params, "payment_status"),
      shipping_status,
      source_channel: parseOptionalString(params, "source_channel"),
      customer_id: customer_id && Number.isFinite(customer_id) ? customer_id : undefined,
      from_date: parseOptionalString(params, "from_date"),
      to_date: parseOptionalString(params, "to_date"),
      sortBy: parseOptionalString(params, "sort_by"),
      sortDir: (parseOptionalString(params, "sort_dir") as "asc" | "desc" | undefined) ?? undefined,
    });
    return NextResponse.json({
      ok: true,
      items,
      pagination: {
        limit,
        offset,
        total,
        has_more: offset + items.length < total,
      },
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load orders",
        userMessage: "We could not load orders.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export async function POST(request: Request) {
  try {
    requireEtsyAccessToken(await cookies());
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const orderNumber = typeof body.order_number === "string" ? body.order_number.trim() : "";
    if (!orderNumber) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid order payload",
        userMessage: "Order number is required.",
        actions: ["Provide order_number and retry."],
        fields: { order_number: ["Required"] },
        canRetry: false,
      });
    }
    let payload: Record<string, unknown>;
    try {
      payload = prepareOrderPayload(body, { forCreate: true });
    } catch (err) {
      if (err instanceof OrderValidationError) {
        throw new ApiRouteError({
          status: 400,
          code: "VALIDATION_ERROR",
          message: "Invalid order payload",
          userMessage: "Please correct the order fields.",
          actions: ["Fix the highlighted fields and retry."],
          fields: err.fields,
          canRetry: false,
        });
      }
      throw err;
    }
    // Auto-fill ship-to from customer if not provided
    const customerId = typeof payload.customer_id === "number" ? payload.customer_id : null;
    const shipToAddressId = typeof body.ship_to_address_id === "number" ? body.ship_to_address_id : null;
    delete payload.ship_to_address_id;

    if (customerId && !payload.ship_to_first_name) {
      const db = getDb();
      const cust = db.prepare(
        `SELECT first_name, last_name, address_1, address_2, city, state, postal_code, country
         FROM customers WHERE id = ?`
      ).get(customerId) as Record<string, string | null> | undefined;

      let shipTo: Record<string, string | null> | undefined;
      if (shipToAddressId) {
        // User picked a specific ship-to address
        shipTo = db.prepare(
          `SELECT first_line, second_line, city, state, postal_code, country
           FROM addresses WHERE id = ? AND customer_id = ?`
        ).get(shipToAddressId, customerId) as Record<string, string | null> | undefined;
      }

      if (shipTo) {
        payload.ship_to_first_name = cust?.first_name ?? null;
        payload.ship_to_last_name = cust?.last_name ?? null;
        payload.ship_to_address_line_1 = shipTo.first_line ?? null;
        payload.ship_to_address_line_2 = shipTo.second_line ?? null;
        payload.ship_to_city = shipTo.city ?? null;
        payload.ship_to_state_province = shipTo.state ?? null;
        payload.ship_to_postal_code = shipTo.postal_code ?? null;
        payload.ship_to_country = shipTo.country ?? null;
      } else if (cust) {
        // Fall back to customer's main billing address
        payload.ship_to_first_name = cust.first_name ?? null;
        payload.ship_to_last_name = cust.last_name ?? null;
        payload.ship_to_address_line_1 = cust.address_1 ?? null;
        payload.ship_to_address_line_2 = cust.address_2 ?? null;
        payload.ship_to_city = cust.city ?? null;
        payload.ship_to_state_province = cust.state ?? null;
        payload.ship_to_postal_code = cust.postal_code ?? null;
        payload.ship_to_country = cust.country ?? null;
      }
    }

    const order = createOrder(payload);
    logActivity({
      action: "order.created",
      entityType: "order",
      entityId: (order as { id: number }).id,
      entityLabel: (order as { order_number?: string }).order_number ?? orderNumber,
    });
    return NextResponse.json({ ok: true, order }, { status: 201 });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to create order",
        userMessage: "We could not create the order.",
        actions: ["Retry in a moment.", "Check request data and retry."],
      })
    );
  }
}
