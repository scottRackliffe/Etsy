import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePagination } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { createOrder, listOrders } from "@/lib/records";

export async function GET(request: NextRequest) {
  try {
    requireEtsyAccessToken(await cookies());
    const { limit, offset } = parsePagination(request.nextUrl.searchParams);
    const { items, total } = listOrders(limit, offset);
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
    const order = createOrder(body);
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
