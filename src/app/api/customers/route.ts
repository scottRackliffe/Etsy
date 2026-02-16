import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { parsePagination } from "@/lib/api-utils";
import { createCustomer, listCustomers } from "@/lib/records";

export async function GET(request: NextRequest) {
  try {
    requireEtsyAccessToken(await cookies());
    const { limit, offset } = parsePagination(request.nextUrl.searchParams);
    const { items, total } = listCustomers(limit, offset);
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
        message: "Failed to load customers",
        userMessage: "We could not load customers.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export async function POST(request: Request) {
  try {
    requireEtsyAccessToken(await cookies());
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!email) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid customer payload",
        userMessage: "Customer email is required.",
        actions: ["Provide email and retry."],
        fields: { email: ["Required"] },
        canRetry: false,
      });
    }
    const customer = createCustomer(body);
    return NextResponse.json({ ok: true, customer }, { status: 201 });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to create customer",
        userMessage: "We could not create the customer.",
        actions: ["Retry in a moment.", "Check request fields and retry."],
      })
    );
  }
}
