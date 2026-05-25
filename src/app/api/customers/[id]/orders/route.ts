import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePagination, parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { listCustomerOrders } from "@/lib/customer-orders";
import { getCustomer } from "@/lib/records";

async function getCustomerId(context: { params: Promise<{ id: string }> }): Promise<number> {
  const id = parsePositiveInt((await context.params).id);
  if (!id) {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid customer id",
      userMessage: "The customer id must be a positive integer.",
      actions: ["Check the URL and retry."],
      canRetry: false,
    });
  }
  return id;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const customerId = await getCustomerId(context);
    if (!getCustomer(customerId)) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Customer not found",
        userMessage: "The requested customer was not found.",
        actions: ["Refresh and select another customer."],
        canRetry: false,
      });
    }
    const { limit, offset } = parsePagination(request.nextUrl.searchParams);
    const { items, total, summary } = listCustomerOrders(customerId, limit, offset);
    return NextResponse.json({
      ok: true,
      summary,
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
        message: "Failed to load customer orders",
        userMessage: "We could not load order history for this customer.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
