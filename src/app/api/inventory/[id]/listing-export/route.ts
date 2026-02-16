import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { buildListingExportPackage } from "@/lib/listing-handoff";
import { getInventoryById, validateItemForListingRequest } from "@/lib/inventory";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const id = parsePositiveInt((await context.params).id);
    if (!id) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid inventory id",
        userMessage: "Inventory id must be a positive integer.",
        actions: ["Check the URL and retry."],
        fields: { id: ["Must be a positive integer"] },
        canRetry: false,
      });
    }

    const item = getInventoryById(id);
    if (!item) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Inventory item not found",
        userMessage: "The selected inventory item was not found.",
        actions: ["Refresh and retry."],
        canRetry: false,
      });
    }
    const readiness = validateItemForListingRequest(item);
    if (!readiness.ok) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Listing export blocked by readiness rules",
        userMessage: "Complete required item fields before exporting for AI.",
        actions: ["Complete missing fields and retry export."],
        fields: readiness.fields,
        canRetry: false,
      });
    }

    const pkg = buildListingExportPackage(item);
    return NextResponse.json({ ok: true, package: pkg });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to export listing package",
        userMessage: "We could not export the listing package.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
