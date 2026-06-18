import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getVendor, patchVendor, softDeleteVendor } from "@/lib/records";
import { logActivity } from "@/lib/activity-log";

async function getVendorId(context: { params: Promise<{ id: string }> }): Promise<number> {
  const id = parsePositiveInt((await context.params).id);
  if (!id) {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid vendor id",
      userMessage: "The vendor id must be a positive integer.",
      actions: ["Check the URL and retry."],
      fields: { id: ["Must be a positive integer"] },
      canRetry: false,
    });
  }
  return id;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const id = await getVendorId(context);
    const vendor = getVendor(id);
    if (!vendor) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Vendor not found",
        userMessage: "The requested vendor was not found.",
        actions: ["Refresh and select another vendor."],
        canRetry: false,
      });
    }
    return NextResponse.json({ ok: true, vendor });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load vendor",
        userMessage: "We could not load the vendor.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const id = await getVendorId(context);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const vendor = patchVendor(id, body);
    if (!vendor) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Vendor not found",
        userMessage: "The requested vendor was not found.",
        actions: ["Refresh and retry."],
        canRetry: false,
      });
    }
    logActivity({
      action: "vendor.updated",
      entityType: "vendor",
      entityId: id,
      entityLabel: (vendor as { name?: string }).name,
    });
    return NextResponse.json({ ok: true, vendor });
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
          actions: ["Use a different name."],
          canRetry: false,
        })
      );
    }
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to update vendor",
        userMessage: "We could not update the vendor.",
        actions: ["Retry in a moment.", "Check request data and retry."],
      })
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const id = await getVendorId(context);
    const existing = getVendor(id);
    if (!existing) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Vendor not found",
        userMessage: "The requested vendor was not found.",
        actions: ["Refresh and retry."],
        canRetry: false,
      });
    }
    const deleted = softDeleteVendor(id);
    if (!deleted) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Vendor not found",
        userMessage: "The requested vendor was not found.",
        actions: ["Refresh and retry."],
        canRetry: false,
      });
    }
    logActivity({
      action: "vendor.deactivated",
      entityType: "vendor",
      entityId: id,
      entityLabel: (existing as { name?: string }).name,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to deactivate vendor",
        userMessage: "We could not deactivate the vendor.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
