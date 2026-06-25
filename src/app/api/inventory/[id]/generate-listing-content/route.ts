/**
 * POST /api/inventory/[id]/generate-listing-content
 * Runs the full research + compose AI engine (ADR-085 §3, WS-L1).
 * No sale_revenue gate — price is an output of generation, not an input.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateListingFromAi } from "@/lib/listing-generator";
import type { CoachPhotoFile } from "@/lib/listing-ai";
import {
  getAllPictureReferences,
  getInventoryById,
  updateListingContent,
  validateItemForListingRequest,
} from "@/lib/inventory";
import { markListingGenerated } from "@/lib/listing-phase";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { logger } from "@/lib/logging";
import { requireEtsyAccessToken } from "@/lib/auth-session";

function parseInventoryId(idParam: string): number | null {
  const parsed = Number(idParam);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
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
          "Add at least one picture, set condition code, and add a description.",
        ],
        fields: validation.fields,
        canRetry: false,
      });
    }

    // Extract optional Google context from multipart body (WS-L3)
    let googlePhotos: CoachPhotoFile[] = [];
    let googleText = "";
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      try {
        const formData = await request.formData();
        const googlePhotoFiles = formData.getAll("google_photos");
        for (const f of googlePhotoFiles) {
          if (f instanceof File) {
            const buffer = Buffer.from(await f.arrayBuffer());
            googlePhotos.push({ buffer, filename: f.name || "google.jpg" });
          }
        }
        const textField = formData.get("google_text");
        if (typeof textField === "string") googleText = textField;
      } catch {
        // multipart parse failure — proceed without Google context
      }
    }

    const generated = await generateListingFromAi({ item, googlePhotos, googleText });

    const saleRevenueSet =
      (item.sale_revenue == null || Number(item.sale_revenue) === 0) &&
      generated.suggested_sale_revenue != null &&
      generated.suggested_sale_revenue > 0;

    // AI call succeeded — persist the result. Failures here are reported distinctly
    // so the user knows the AI result was produced but not saved (WS-CR10).
    try {
      updateListingContent(inventoryId, {
        listing_title: generated.listing_title,
        listing_description: generated.listing_description,
        listing_tags: generated.listing_tags,
        listing_category_path: generated.listing_category_path,
        listing_title_strategy: generated.listing_title_strategy,
        listing_product_story: generated.listing_product_story,
        listing_condition_clarity: generated.listing_condition_clarity,
        listing_attributes: generated.listing_attributes,
        listing_pricing_shipping_notes: generated.listing_pricing_shipping_notes,
        listing_quality_checklist: generated.listing_quality_checklist,
        etsy_when_made: generated.suggested_etsy_when_made ?? undefined,
        etsy_taxonomy_id: generated.suggested_taxonomy_id ?? undefined,
        materials: generated.suggested_materials_json ?? undefined,
        picture_classifications: generated.picture_classifications_json ?? undefined,
        sale_revenue_if_unset:
          generated.suggested_sale_revenue != null && generated.suggested_sale_revenue > 0
            ? generated.suggested_sale_revenue
            : null,
      });
    } catch (saveError) {
      const detail = saveError instanceof Error ? saveError.message : String(saveError);
      logger.error("Generate: AI succeeded but save failed", { inventoryId, error: saveError });
      throw new ApiRouteError({
        status: 500,
        code: "LISTING_GENERATION_FAILED",
        message: `AI generated content but the save failed: ${detail}`,
        userMessage:
          "The AI generated your listing content, but we could not save it to the database. " +
          "Try again — you will not be re-billed for the AI call.",
        actions: [
          "Retry the Generate action — the AI call is not repeated until save succeeds.",
          "If this persists, check disk space and database access.",
        ],
        canRetry: true,
      });
    }

    const updatedItem = getInventoryById(inventoryId);
    const listingPhase = markListingGenerated(inventoryId);

    logActivity({
      action: "listing.ai_generated",
      entityType: "inventory",
      entityId: inventoryId,
      entityLabel: item.item_number || item.description || `Item ${inventoryId}`,
      detail: {
        price_confidence: generated.price.confidence,
        sale_revenue_set: saleRevenueSet,
      },
      source: "user",
    });

    const pictureCount = getAllPictureReferences(item).length;

    return NextResponse.json(
      {
        item_id: inventoryId,
        used_picture_count: pictureCount,
        listing_title: generated.listing_title,
        listing_description: generated.listing_description,
        listing_tags: generated.listing_tags,
        listing_category_path: generated.listing_category_path ?? null,
        price: generated.price,
        evidence: null,
        citations: generated.citations,
        compliance_check: generated.compliance_check,
        listing_phase: listingPhase,
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
          "If this keeps failing, verify AI configuration and photo paths.",
        ],
      })
    );
  }
}
