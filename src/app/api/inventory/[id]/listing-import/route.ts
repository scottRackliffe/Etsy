import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { recordListingImport, validateAndNormalizeListingImport } from "@/lib/listing-handoff";
import { logActivity } from "@/lib/activity-log";
import { getInventoryById, updateListingContent } from "@/lib/inventory";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
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

    const body = await request.json().catch(() => ({}));
    const normalized = validateAndNormalizeListingImport(id, body);
    recordListingImport({
      inventoryId: id,
      exportId: normalized.exportId,
      payload: body,
      sourceLabel: normalized.sourceLabel,
    });

    const updated = updateListingContent(id, {
      listing_title: normalized.listingTitle,
      listing_description: normalized.listingDescription,
      listing_tags: normalized.listingTags,
      listing_category_path: normalized.listingCategoryPath,
      listing_draft_source: "portable_import",
      listing_export_id: normalized.exportId,
    });

    logActivity({
      action: "listing.imported",
      entityType: "inventory",
      entityId: id,
      entityLabel: item.item_number || item.description || `Item ${id}`,
      detail: { export_id: body.export_id, source_label: body.source_label },
      source: "user",
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    return errorResponse(
      fromUnknownError(error, {
        code: "VALIDATION_ERROR",
        message: "Failed to import listing package",
        userMessage: detail || "We could not import the AI draft package.",
        actions: ["Make sure the AI response includes listing_title, listing_description, and listing_tags as JSON."],
        canRetry: true,
      })
    );
  }
}
