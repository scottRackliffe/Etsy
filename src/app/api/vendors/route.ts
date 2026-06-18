import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { parseOptionalIntFlag, parseOptionalString, parsePagination } from "@/lib/api-utils";
import { createVendor, listVendors } from "@/lib/records";
import { logActivity } from "@/lib/activity-log";

export async function GET(request: NextRequest) {
  try {
    requireEtsyAccessToken(await cookies());
    const params = request.nextUrl.searchParams;
    const { limit, offset } = parsePagination(params);
    const { items, total } = listVendors({
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
        message: "Failed to load vendors",
        userMessage: "We could not load vendors.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export async function POST(request: Request) {
  try {
    requireEtsyAccessToken(await cookies());
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid vendor payload",
        userMessage: "Vendor name is required.",
        actions: ["Provide a name and retry."],
        fields: { name: ["Required"] },
        canRetry: false,
      });
    }
    const vendor = createVendor({ ...body, name });
    logActivity({
      action: "vendor.created",
      entityType: "vendor",
      entityId: (vendor as { id: number }).id,
      entityLabel: name,
    });
    return NextResponse.json({ ok: true, vendor }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed: vendors.name")
    ) {
      return errorResponse(
        new ApiRouteError({
          status: 409,
          code: "DUPLICATE",
          message: "Vendor name already exists",
          userMessage: "A vendor with this name already exists.",
          actions: ["Use a different name or edit the existing vendor."],
          canRetry: false,
        })
      );
    }
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to create vendor",
        userMessage: "We could not create the vendor.",
        actions: ["Retry in a moment.", "Check request fields and retry."],
      })
    );
  }
}
