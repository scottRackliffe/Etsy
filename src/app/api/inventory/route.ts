import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePagination } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { createInventory, listInventory } from "@/lib/records";

export async function GET(request: NextRequest) {
  try {
    requireEtsyAccessToken(await cookies());
    const { limit, offset } = parsePagination(request.nextUrl.searchParams);
    const { items, total } = listInventory(limit, offset);
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
        message: "Failed to load inventory",
        userMessage: "We could not load inventory.",
        actions: ["Retry in a moment.", "Reconnect Etsy if your session expired."],
      })
    );
  }
}

export async function POST(request: Request) {
  try {
    requireEtsyAccessToken(await cookies());
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const itemNumber = typeof body.item_number === "string" ? body.item_number.trim() : "";
    if (!itemNumber) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid inventory payload",
        userMessage: "Item number is required.",
        actions: ["Provide item_number and retry."],
        fields: { item_number: ["Required"] },
        canRetry: false,
      });
    }

    const created = createInventory(body);
    return NextResponse.json({ ok: true, item: created }, { status: 201 });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to create inventory item",
        userMessage: "We could not create the inventory item.",
        actions: ["Retry in a moment.", "Check duplicate item number and retry."],
      })
    );
  }
}
