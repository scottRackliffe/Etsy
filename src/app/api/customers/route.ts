import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { parseOptionalIntFlag, parseOptionalString, parsePagination } from "@/lib/api-utils";
import { createCustomer, listCustomers } from "@/lib/records";
import { logActivity } from "@/lib/activity-log";

export async function GET(request: NextRequest) {
  try {
    requireEtsyAccessToken(await cookies());
    const params = request.nextUrl.searchParams;
    const { limit, offset } = parsePagination(params);
    const { items, total } = listCustomers({
      limit,
      offset,
      search: parseOptionalString(params, "search"),
      is_active: parseOptionalIntFlag(params, "is_active"),
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
    logActivity({
      action: "customer.created",
      entityType: "customer",
      entityId: (customer as { id: number }).id,
      entityLabel: `${(customer as { first_name?: string }).first_name ?? ""} ${(customer as { last_name?: string }).last_name ?? ""}`.trim(),
    });
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
