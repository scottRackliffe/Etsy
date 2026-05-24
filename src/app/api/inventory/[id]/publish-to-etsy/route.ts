import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { getValidAccessToken } from "@/lib/auth-session";
import { getAllPictureReferences, getInventoryById } from "@/lib/inventory";
import { getDb } from "@/lib/sqlite";
import { getSetting } from "@/lib/settings-store";
import { getLatestPublishPreview } from "@/lib/listing-review";
import {
  createDraftListing,
  updateListingDetails,
  updateListingState,
  uploadListingImageFromReference,
} from "@/lib/etsy";

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

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const token = await getValidAccessToken(await cookies());
    const body = (await _request.json().catch(() => ({}))) as { preview_hash?: unknown };
    const providedPreviewHash =
      typeof body.preview_hash === "string" ? body.preview_hash.trim() : "";
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
    if (item.listing_draft_state !== "approved") {
      throw new ApiRouteError({
        status: 409,
        code: "VALIDATION_ERROR",
        message: "Only approved drafts can be published",
        userMessage: "Approve the listing draft before publishing to Etsy.",
        actions: ["Approve draft and retry publish."],
        canRetry: false,
      });
    }
    if (!item.listing_approved_at) {
      throw new ApiRouteError({
        status: 409,
        code: "VALIDATION_ERROR",
        message: "Listing draft has no approval timestamp",
        userMessage: "Approve the listing draft before publishing to Etsy.",
        actions: ["Approve draft and retry publish."],
        canRetry: false,
      });
    }
    if (
      item.updated_at &&
      new Date(item.updated_at).getTime() > new Date(item.listing_approved_at).getTime()
    ) {
      throw new ApiRouteError({
        status: 409,
        code: "VALIDATION_ERROR",
        message: "Listing changed after approval",
        userMessage: "Listing content changed after approval. Re-approve before publishing.",
        actions: ["Review listing changes.", "Approve draft again, then retry publish."],
        canRetry: false,
      });
    }
    const latestPreview = getLatestPublishPreview(id);
    if (!latestPreview || !providedPreviewHash) {
      throw new ApiRouteError({
        status: 409,
        code: "VALIDATION_ERROR",
        message: "Publish review is required before push",
        userMessage: "Review the exact publish payload before pushing to Etsy.",
        actions: ["Click Review and then retry publish."],
        canRetry: false,
      });
    }
    if (latestPreview.preview_hash !== providedPreviewHash) {
      throw new ApiRouteError({
        status: 409,
        code: "VALIDATION_ERROR",
        message: "Provided preview hash does not match latest review",
        userMessage: "The publish preview is stale. Review again before publishing.",
        actions: ["Click Review to generate a fresh preview, then publish."],
        canRetry: false,
      });
    }
    const previewPayload = JSON.parse(latestPreview.payload_json) as {
      item_state_snapshot?: { updated_at?: string | null };
    };
    const previewUpdatedAt = previewPayload.item_state_snapshot?.updated_at ?? null;
    if ((item.updated_at ?? null) !== (previewUpdatedAt ?? null)) {
      throw new ApiRouteError({
        status: 409,
        code: "VALIDATION_ERROR",
        message: "Item changed after review",
        userMessage: "Item data changed after review. Generate a new review before publishing.",
        actions: ["Click Review again and confirm the payload."],
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

    const fields: Record<string, string[]> = {};
    if (!shopId) fields.shop_id = ["Set etsy.active_shop_id by selecting a shop on dashboard."];
    if (!taxonomyId) fields.taxonomy_id = ["Set etsy.publish.taxonomy_id in settings."];
    if (!shippingProfileId)
      fields.shipping_profile_id = ["Set etsy.publish.shipping_profile_id in settings."];
    if (!readinessStateId)
      fields.readiness_state_id = ["Set etsy.publish.readiness_state_id in settings."];
    if (Object.keys(fields).length > 0) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Missing Etsy publish configuration",
        userMessage:
          "Publish configuration is incomplete. Add required Etsy publish settings and retry.",
        actions: [
          "Open settings and provide taxonomy/shipping/readiness/image values.",
          "Retry publish after settings are complete.",
        ],
        fields,
        canRetry: false,
      });
    }
    const resolvedShopId = shopId as number;
    const resolvedTaxonomyId = taxonomyId as number;
    const resolvedShippingProfileId = shippingProfileId as number;
    const resolvedReadinessStateId = readinessStateId as number;
    if (!item.listing_title || !item.listing_description || !item.listing_tags) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Missing listing fields for publish",
        userMessage: "Listing title, description, and tags are required before publish.",
        actions: ["Complete listing draft fields and retry."],
        canRetry: false,
      });
    }

    const tags = item.listing_tags
      .split(/[,\n]/g)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
      .slice(0, 13);
    const pictureReferences = getAllPictureReferences(item);

    const etsyListing = await createDraftListing(token, {
      shopId: resolvedShopId,
      title: item.listing_title,
      description: item.listing_description,
      price: Number(item.sale_revenue ?? 0),
      quantity: Math.max(1, Number(item.quantity ?? 1)),
      taxonomyId: resolvedTaxonomyId,
      whoMade,
      whenMade,
      shippingProfileId: resolvedShippingProfileId,
      readinessStateId: resolvedReadinessStateId,
      imageIds: imageIds.length > 0 ? imageIds : undefined,
      tags,
    });

    let uploadedImageCount = 0;
    const failedUploads: string[] = [];
    for (const reference of pictureReferences) {
      let uploaded = false;
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= maxImageUploadAttempts; attempt += 1) {
        try {
          await uploadListingImageFromReference(token, {
            shopId: resolvedShopId,
            listingId: etsyListing.listing_id,
            reference,
            transform: {
              maxDimension: imageMaxDimension,
              targetDensityDpi: imageTargetDpi,
              jpegQuality: imageJpegQuality,
            },
          });
          uploadedImageCount += 1;
          uploaded = true;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < maxImageUploadAttempts) {
            await sleep(attempt * 300);
          }
        }
      }
      if (!uploaded) {
        const errorMessage =
          lastError instanceof Error ? lastError.message : "unknown upload error";
        failedUploads.push(`${reference}: ${errorMessage}`);
      }
    }
    if (!allowPartialImageUpload && failedUploads.length > 0) {
      throw new ApiRouteError({
        status: 409,
        code: "ETSY_API_FAILED",
        message: "One or more listing images failed to upload",
        userMessage:
          "Some listing images failed to upload. Publish is paused to protect listing quality.",
        actions: [
          "Fix missing/unreadable image paths and retry publish.",
          "Optionally allow partial image upload via etsy.publish.allow_partial_image_upload.",
        ],
        fields: {
          failed_images: failedUploads,
        },
        canRetry: false,
      });
    }
    if (uploadedImageCount === 0 && imageIds.length === 0) {
      throw new ApiRouteError({
        status: 409,
        code: "VALIDATION_ERROR",
        message: "Listing created in draft state without images",
        userMessage:
          "Etsy requires at least one listing image to activate a listing. No images were uploaded.",
        actions: [
          "Confirm item picture file paths are valid and retry publish.",
          "Or configure etsy.publish.image_ids with existing Etsy image ids.",
        ],
        canRetry: false,
      });
    }
    if (uploadedImageCount > 0 || imageIds.length > 0) {
      await updateListingDetails(token, {
        shopId: resolvedShopId,
        listingId: etsyListing.listing_id,
        title: item.listing_title,
        description: item.listing_description,
        price: Number(item.sale_revenue ?? 0),
        quantity: Math.max(1, Number(item.quantity ?? 1)),
        taxonomyId: resolvedTaxonomyId,
        whoMade,
        whenMade,
        tags,
      });
      await updateListingState(token, {
        shopId: resolvedShopId,
        listingId: etsyListing.listing_id,
        state: "active",
      });
    }

    const now = new Date().toISOString();
    const listingId = String(etsyListing.listing_id);
    getDb()
      .prepare(
        `
      UPDATE inventory
      SET listing_draft_state = 'published',
          listing_published_at = @published_at,
          status = 'listed',
          is_listed = 1,
          date_listed = COALESCE(date_listed, @date_listed),
          etsy_listing_id = @etsy_listing_id,
          updated_at = @updated_at
      WHERE id = @id
    `
      )
      .run({
        id,
        published_at: now,
        date_listed: now.slice(0, 10),
        etsy_listing_id: listingId,
        updated_at: now,
      });
    const updated = getInventoryById(id);
    return NextResponse.json({
      ok: true,
      item: updated,
      publish_result: {
        success: true,
        status: "published",
        listing_id: listingId,
        etsy_state: etsyListing.state ?? null,
        uploaded_image_count: uploadedImageCount,
        failed_upload_count: failedUploads.length,
        failed_uploads: failedUploads,
        staged_steps: {
          draft_create: true,
          image_uploads: failedUploads.length === 0,
          listing_text_update: true,
          listing_activate: true,
        },
      },
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "ETSY_API_FAILED",
        message: "Failed to publish listing",
        userMessage: "We could not publish this listing to Etsy.",
        actions: ["Retry in a moment.", "Confirm Etsy connection is active."],
      })
    );
  }
}
