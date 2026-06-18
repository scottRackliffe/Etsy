import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt, parsePagination } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { listVendorPurchases } from "@/lib/records";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    requireEtsyAccessToken(await cookies());
    const id = parsePositiveInt((await context.params).id);
    if (!id) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid vendor id",
        userMessage: "The vendor id must be a positive integer.",
        actions: ["Check the URL and retry."],
        canRetry: false,
      });
    }
    const { limit, offset } = parsePagination(request.nextUrl.searchParams);
    const { items, total } = listVendorPurchases(id, limit, offset);
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
        message: "Failed to load vendor purchases",
        userMessage: "We could not load this vendor's purchase history.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
