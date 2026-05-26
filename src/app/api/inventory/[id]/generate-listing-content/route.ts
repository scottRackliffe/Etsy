/**
 * POST /api/inventory/[id]/generate-listing-content
 * Generates Etsy listing content from item context + all item pictures.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateListingFromAi } from "@/lib/listing-generator";
import {
  getAllPictureReferences,
  getInventoryById,
  updateListingContent,
  validateItemForListingRequest,
} from "@/lib/inventory";
import { loadListingGuidance } from "@/lib/listing-guidance";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { logger } from "@/lib/logging";
import { requireEtsyAccessToken } from "@/lib/auth-session";

function parseInventoryId(idParam: string): number | null {
  const parsed = Number(idParam);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const cookieStore = await cookies();
    requireEtsyAccessToken(cookieStore);

    const params = await context.params;
    const inventoryId = parseInventoryId(params.id);
    if (!inventoryId) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid inventory id",
        userMessage: "The selected item id is invalid.",
        actions: [
          "Refresh and select the item again.",
          "If this continues, reopen the item from inventory list.",
        ],
        fields: { id: ["Must be a positive integer"] },
        canRetry: false,
      });
    }

    const item = getInventoryById(inventoryId);
    if (!item) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Inventory item not found",
        userMessage: "The selected item was not found.",
        actions: [
          "Refresh inventory and select an existing item.",
          "If deleted, recreate the item before retrying.",
        ],
        canRetry: false,
      });
    }

    const validation = validateItemForListingRequest(item);
    if (!validation.ok) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Listing request blocked: required item data is incomplete",
        userMessage: "This item is missing required listing data.",
        actions: [
          "Open the item and complete all missing fields.",
          "Add at least one picture, set condition, and set price.",
        ],
        fields: validation.fields,
        canRetry: false,
      });
    }

    const pictureReferences = getAllPictureReferences(item);
    const guidance = await loadListingGuidance();
    const generated = await generateListingFromAi({
      item,
      pictureReferences,
      guidance,
    });

    const updatedItem = updateListingContent(inventoryId, {
      ...generated,
      listing_draft_source: "integrated_ai",
    });

    return NextResponse.json(
      {
        item_id: inventoryId,
        used_picture_count: pictureReferences.length,
        listing_title: generated.listing_title,
        listing_description: generated.listing_description,
        listing_tags: generated.listing_tags,
        listing_category_path: generated.listing_category_path ?? null,
        updated_at: updatedItem?.updated_at ?? null,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error("Generate listing content error", { error });
    return errorResponse(
      fromUnknownError(error, {
        code: "LISTING_GENERATION_FAILED",
        message: "Failed to generate listing content",
        userMessage: "We could not generate listing content right now.",
        actions: [
          "Try again in a moment.",
          "If this keeps failing, verify AI configuration and image paths.",
        ],
      })
    );
  }
}
