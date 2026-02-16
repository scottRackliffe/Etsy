import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { resolveEtsyAccessToken } from "@/lib/auth-session";
import { getAllPictureReferences, getInventoryById } from "@/lib/inventory";
import { getSetting } from "@/lib/settings-store";
import { computePreviewHash, savePublishPreview } from "@/lib/listing-review";

function parseNumberSetting(key: string): number | null {
  const raw = getSetting(key);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

function parseImageIdsFromSetting(key: string): number[] {
  const raw = getSetting(key);
  if (!raw) return [];
  return raw
    .split(/[,\s]+/g)
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v) && v > 0);
}

function parseBooleanSetting(key: string, fallback = false): boolean {
  const raw = (getSetting(key) ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function parseIntSetting(key: string, fallback: number): number {
  const raw = getSetting(key);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await resolveEtsyAccessToken(await cookies());
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

    const shopId = parseNumberSetting("etsy.active_shop_id");
    const taxonomyId = parseNumberSetting("etsy.publish.taxonomy_id");
    const shippingProfileId = parseNumberSetting("etsy.publish.shipping_profile_id");
    const readinessStateId = parseNumberSetting("etsy.publish.readiness_state_id");
    const imageIds = parseImageIdsFromSetting("etsy.publish.image_ids");
    const allowPartialImageUpload = parseBooleanSetting(
      "etsy.publish.allow_partial_image_upload",
      false
    );
    const maxImageUploadAttempts = parseIntSetting("etsy.publish.image_upload_attempts", 3);
    const imageMaxDimension = parseIntSetting("etsy.publish.image_max_dimension", 2000);
    const imageTargetDpi = parseIntSetting("etsy.publish.image_target_dpi", 300);
    const imageJpegQuality = parseIntSetting("etsy.publish.image_jpeg_quality", 82);
    const whoMade = (getSetting("etsy.publish.who_made") ?? "i_did").trim();
    const whenMade = (getSetting("etsy.publish.when_made") ?? "before_2000").trim();

    const tags = (item.listing_tags ?? "")
      .split(/[,\n]/g)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
      .slice(0, 13);

    const pictureReferences = getAllPictureReferences(item);

    const warnings: string[] = [];
    if (item.listing_draft_state !== "approved") {
      warnings.push("Draft is not approved. Publish is blocked.");
    }
    if (!item.listing_approved_at) {
      warnings.push("Draft has no approval timestamp.");
    }
    if (
      item.updated_at &&
      item.listing_approved_at &&
      new Date(item.updated_at).getTime() > new Date(item.listing_approved_at).getTime()
    ) {
      warnings.push("Draft changed after approval. Re-approval required.");
    }
    if (!shopId || !taxonomyId || !shippingProfileId || !readinessStateId) {
      warnings.push("Required publish settings are incomplete.");
    }
    if (!item.listing_title || !item.listing_description || tags.length === 0) {
      warnings.push("Listing title/description/tags are incomplete.");
    }
    if (pictureReferences.length === 0 && imageIds.length === 0) {
      warnings.push("No local images or configured image IDs are available.");
    }

    const payloadPreview = {
      create_draft: {
        shop_id: shopId,
        title: item.listing_title,
        description: item.listing_description,
        price: item.sale_revenue,
        quantity: item.quantity ?? 1,
        taxonomy_id: taxonomyId,
        who_made: whoMade,
        when_made: whenMade,
        shipping_profile_id: shippingProfileId,
        readiness_state_id: readinessStateId,
        image_ids: imageIds,
        tags,
      },
      image_upload: {
        local_picture_references: pictureReferences,
        attempts_per_image: maxImageUploadAttempts,
        allow_partial_image_upload: allowPartialImageUpload,
        transforms: {
          max_dimension: imageMaxDimension,
          target_dpi: imageTargetDpi,
          jpeg_quality: imageJpegQuality,
        },
      },
      update_listing_text: {
        title: item.listing_title,
        description: item.listing_description,
        price: item.sale_revenue,
        quantity: item.quantity ?? 1,
        taxonomy_id: taxonomyId,
        who_made: whoMade,
        when_made: whenMade,
        tags,
      },
      item_state_snapshot: {
        listing_draft_state: item.listing_draft_state,
        listing_approved_at: item.listing_approved_at,
        updated_at: item.updated_at,
      },
    };
    const previewHash = computePreviewHash(payloadPreview);
    const { created_at } = savePublishPreview({
      inventoryId: id,
      previewHash,
      payload: payloadPreview,
    });

    return NextResponse.json({
      ok: true,
      item_id: id,
      can_publish: warnings.length === 0,
      warnings,
      preview_hash: previewHash,
      preview_generated_at: created_at,
      staged_flow: [
        "create_draft_listing",
        "upload_images_one_by_one",
        "update_listing_text",
        "activate_listing",
        "set_local_is_listed_and_date",
      ],
      payload_preview: payloadPreview,
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "ETSY_API_FAILED",
        message: "Failed to build publish preview",
        userMessage: "We could not build a publish preview.",
        actions: ["Retry in a moment.", "Confirm Etsy connection is active."],
      })
    );
  }
}
