import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { parsePagination } from "@/lib/api-utils";
import { createPurchase, listPurchases } from "@/lib/records";

export async function GET(request: NextRequest) {
  try {
    requireEtsyAccessToken(await cookies());
    const { limit, offset } = parsePagination(request.nextUrl.searchParams);
    const { items, total } = listPurchases(limit, offset);
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
        message: "Failed to load purchases",
        userMessage: "We could not load purchases.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export async function POST(request: Request) {
  try {
    requireEtsyAccessToken(await cookies());
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const inventoryId = Number(body.inventory_id);
    if (!Number.isInteger(inventoryId) || inventoryId <= 0) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid purchase payload",
        userMessage: "A valid inventory_id is required.",
        actions: ["Provide inventory_id and retry."],
        fields: { inventory_id: ["Must be a positive integer"] },
        canRetry: false,
      });
    }
    const purchase = createPurchase(body);
    return NextResponse.json({ ok: true, purchase }, { status: 201 });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to create purchase",
        userMessage: "We could not create the purchase.",
        actions: ["Retry in a moment.", "Check request data and retry."],
      })
    );
  }
}
