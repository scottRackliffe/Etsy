import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parseOptionalString, parsePagination } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { OrderValidationError, prepareOrderPayload } from "@/lib/order-validation";
import { createOrder, listOrders } from "@/lib/records";
import { logActivity } from "@/lib/activity-log";

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
      payment_status: parseOptionalString(params, "payment_status"),
      shipping_status,
      source_channel: parseOptionalString(params, "source_channel"),
      customer_id: customer_id && Number.isFinite(customer_id) ? customer_id : undefined,
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
