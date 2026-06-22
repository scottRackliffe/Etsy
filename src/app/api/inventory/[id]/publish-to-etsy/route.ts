import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { getValidAccessToken } from "@/lib/auth-session";
import { logActivity } from "@/lib/activity-log";
import { getAllPictureReferences, getInventoryById } from "@/lib/inventory";
import { validatePublishReadiness } from "@/lib/inventory-validation";
import { computeListingPhase } from "@/lib/listing-phase";
import { getDb } from "@/lib/sqlite";
import { getSetting } from "@/lib/settings-store";
import {
  createDraftListing,
  updateListingDetails,
  updateListingProperty,
  updateListingState,
  uploadListingImageFromReference,
} from "@/lib/etsy";
import { getTaxonomyProperties } from "@/lib/etsy-taxonomy";

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
  // Hoisted for failure-activity logging in the catch (ADR-085 §5 / ADR-037).
  let activityId: number | null = null;
  let activityLabel = "";
  try {
    const token = await getValidAccessToken(await cookies());
    const body = (await _request.json().catch(() => ({}))) as { mode?: unknown };
    const requestedMode: "create" | "update" | null =
      body.mode === "create" || body.mode === "update" ? body.mode : null;
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
    activityId = id;
    activityLabel = item.item_number || item.description || `Item ${id}`;

    const publishSettings: Record<string, string> = {};
    const returnPolicySetting = getSetting("etsy.publish.return_policy_id");
    if (returnPolicySetting) publishSettings["etsy.publish.return_policy_id"] = returnPolicySetting;
    const shippingProfileSetting = getSetting("etsy.publish.shipping_profile_id");
    if (shippingProfileSetting) publishSettings["etsy.publish.shipping_profile_id"] = shippingProfileSetting;

    const publishCheck = validatePublishReadiness(item, publishSettings);
    if (!publishCheck.ready) {
      throw new ApiRouteError({
        status: 400,
        code: "PUBLISH_NOT_READY",
        message: "Item not ready for Etsy publish",
        userMessage: publishCheck.errors.join(" "),
        actions: ["Fix the listed issues and retry."],
        canRetry: false,
      });
    }

    // Publish gate (ADR-085 §5): listing must have passed the quality rubric.
    const currentPhase = computeListingPhase(item);
    if (currentPhase !== "listing_ready") {
      throw new ApiRouteError({
        status: 409,
        code: "PUBLISH_NOT_READY",
        message: "Listing is not quality-ready for publish",
        userMessage:
          "This listing must pass the quality review before publishing. Run Evaluate Listing Quality and resolve any remediation items.",
        actions: ["Run Evaluate Listing Quality.", "Fix remediation items, then retry publish."],
        canRetry: false,
      });
    }

    // Re-publish guard (ADR-085 §5): never silently duplicate a live listing.
    const existingListingId = (item.etsy_listing_id ?? "").trim();
    if (existingListingId && !requestedMode) {
      throw new ApiRouteError({
        status: 409,
        code: "ALREADY_PUBLISHED",
        message: "Item already has an Etsy listing",
        userMessage: `This item is already on Etsy as listing #${existingListingId}. Choose whether to update that listing or create a new one.`,
        actions: [
          "Update the existing Etsy listing, or",
          "Create a new (separate) Etsy listing.",
        ],
        fields: {
          etsy_listing_id: [existingListingId],
          available_modes: ["update", "create"],
        },
        canRetry: false,
      });
    }
    // First publish (no existing id) is always a create; re-publish uses the chosen mode.
    const mode: "create" | "update" = existingListingId ? (requestedMode as "create" | "update") : "create";

    const shopId = parseNumberSetting("etsy.active_shop_id");
    const globalTaxonomyId = parseNumberSetting("etsy.publish.default_taxonomy_id");
    const globalShippingProfileId = parseNumberSetting("etsy.publish.shipping_profile_id");
    const globalReturnPolicyId = parseNumberSetting("etsy.publish.return_policy_id");
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
    const globalWhoMade = (getSetting("etsy.publish.default_who_made") ?? "someone_else").trim();
    const globalWhenMade = (getSetting("etsy.publish.default_when_made") ?? "2010_2019").trim();

    // Per-item field resolution: item-level overrides global settings (ADR-017 §1c)
    const whoMade = (item.etsy_who_made ?? "").trim() || globalWhoMade;
    const whenMade = (item.etsy_when_made ?? "").trim() || globalWhenMade;
    const taxonomyId = (item.etsy_taxonomy_id ? Number(item.etsy_taxonomy_id) : null) || globalTaxonomyId;
    const shippingProfileId =
      (item.etsy_shipping_profile_id ? Number(item.etsy_shipping_profile_id) : null) ||
      globalShippingProfileId;
    const returnPolicyId =
      (item.etsy_return_policy_id ? Number(item.etsy_return_policy_id) : null) ||
      globalReturnPolicyId;

    const fields: Record<string, string[]> = {};
    if (!shopId) fields.shop_id = ["Set etsy.active_shop_id by selecting a shop on dashboard."];
    if (!taxonomyId) fields.taxonomy_id = ["Set taxonomy ID in publish defaults or on the item."];
    if (!shippingProfileId)
      fields.shipping_profile_id = ["Set shipping profile ID in publish defaults or on the item."];
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
    const resolvedReturnPolicyId = returnPolicyId ?? undefined;
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

    // Parse materials from JSON array or comma-separated string
    let materials: string[] | undefined;
    if (item.materials) {
      try {
        const parsed = JSON.parse(item.materials);
        if (Array.isArray(parsed)) materials = parsed.filter((m: unknown) => typeof m === "string" && m.length > 0);
      } catch {
        materials = item.materials.split(",").map((m: string) => m.trim()).filter((m: string) => m.length > 0);
      }
    }

    let etsyListingId: number;
    let etsyState: string | null = null;
    let uploadedImageCount = 0;
    const failedUploads: string[] = [];

    if (mode === "create") {
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
        returnPolicyId: resolvedReturnPolicyId,
        readinessStateId: resolvedReadinessStateId,
        imageIds: imageIds.length > 0 ? imageIds : undefined,
        tags,
        materials,
        itemWeight: item.item_weight ? Number(item.item_weight) : undefined,
        itemWeightUnit: item.item_weight_unit || undefined,
        itemLength: item.item_length ? Number(item.item_length) : undefined,
        itemWidth: item.item_width ? Number(item.item_width) : undefined,
        itemHeight: item.item_height ? Number(item.item_height) : undefined,
        itemDimensionsUnit: item.item_dimensions_unit || undefined,
        isSupply: item.is_supply != null ? Boolean(item.is_supply) : undefined,
      });
      etsyListingId = etsyListing.listing_id;
      etsyState = etsyListing.state ?? null;

      for (const reference of pictureReferences) {
        let uploaded = false;
        let lastError: unknown = null;
        for (let attempt = 1; attempt <= maxImageUploadAttempts; attempt += 1) {
          try {
            await uploadListingImageFromReference(token, {
              shopId: resolvedShopId,
              listingId: etsyListingId,
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
    } else {
      // Update an existing Etsy listing (ADR-085 §5). Re-uses the stored listing id;
      // text/details/attributes are refreshed below. Images are left as-is to avoid
      // appending duplicates (image replace is a separate follow-on).
      etsyListingId = Number(existingListingId);
      if (!Number.isInteger(etsyListingId) || etsyListingId <= 0) {
        throw new ApiRouteError({
          status: 409,
          code: "VALIDATION_ERROR",
          message: "Stored Etsy listing id is invalid",
          userMessage:
            "This item's stored Etsy listing reference is invalid. Choose 'Create new listing' to publish a fresh listing.",
          actions: ["Re-publish and choose Create new listing."],
          canRetry: false,
        });
      }
    }
    // Push structured taxonomy attributes to Etsy
    let attributesPushed = 0;
    const attributeErrors: string[] = [];
    if (item.etsy_attributes_json) {
      try {
        const attrs = JSON.parse(item.etsy_attributes_json) as Record<string, string>;
        const cachedProps = getTaxonomyProperties(resolvedTaxonomyId);

        for (const [propIdStr, valueName] of Object.entries(attrs)) {
          if (!valueName || !valueName.trim()) continue;
          const propertyId = Number(propIdStr);
          if (!Number.isFinite(propertyId)) continue;

          const cachedProp = cachedProps.find((p) => p.property_id === propertyId);
          let valueIds: number[] = [];
          if (cachedProp) {
            try {
              const possibleValues = JSON.parse(cachedProp.possible_values_json || "[]") as Array<{
                value_id: number | null;
                name: string;
              }>;
              const match = possibleValues.find(
                (pv) => pv.name.toLowerCase() === valueName.trim().toLowerCase()
              );
              if (match?.value_id != null) {
                valueIds = [match.value_id];
              }
            } catch {
              // Fall through — empty value_ids will let Etsy auto-assign
            }
          }

          try {
            await updateListingProperty(token, {
              shopId: resolvedShopId,
              listingId: etsyListingId,
              propertyId,
              valueIds,
              values: [valueName.trim()],
            });
            attributesPushed++;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            attributeErrors.push(`Property ${propertyId}: ${msg}`);
          }
        }
      } catch {
        attributeErrors.push("Could not parse etsy_attributes_json");
      }
    }

    const isDeveloperMode = parseBooleanSetting("etsy.developer_mode", false);
    // Create: only update details/activate once images are attached. Update: always refresh.
    const shouldApplyDetails =
      mode === "update" || uploadedImageCount > 0 || imageIds.length > 0;
    // Developer mode only suppresses activation on a fresh create; an update to an
    // already-live listing stays live.
    const treatAsDraft = mode === "create" && isDeveloperMode;
    if (shouldApplyDetails) {
      await updateListingDetails(token, {
        shopId: resolvedShopId,
        listingId: etsyListingId,
        title: item.listing_title,
        description: item.listing_description,
        price: Number(item.sale_revenue ?? 0),
        quantity: Math.max(1, Number(item.quantity ?? 1)),
        taxonomyId: resolvedTaxonomyId,
        whoMade,
        whenMade,
        tags,
        returnPolicyId: resolvedReturnPolicyId,
        materials,
        itemWeight: item.item_weight ? Number(item.item_weight) : undefined,
        itemWeightUnit: item.item_weight_unit || undefined,
        itemLength: item.item_length ? Number(item.item_length) : undefined,
        itemWidth: item.item_width ? Number(item.item_width) : undefined,
        itemHeight: item.item_height ? Number(item.item_height) : undefined,
        itemDimensionsUnit: item.item_dimensions_unit || undefined,
        isSupply: item.is_supply != null ? Boolean(item.is_supply) : undefined,
      });
      if (!treatAsDraft) {
        await updateListingState(token, {
          shopId: resolvedShopId,
          listingId: etsyListingId,
          state: "active",
        });
      }
    }

    const now = new Date().toISOString();
    const listingId = String(etsyListingId);
    const finalStatus = treatAsDraft ? "Draft" : "Listed";
    const finalDraftState = treatAsDraft ? "approved" : "published";
    getDb()
      .prepare(
        `
      UPDATE inventory
      SET listing_draft_state = @draft_state,
          listing_published_at = @published_at,
          status = @status,
          is_listed = @is_listed,
          date_listed = COALESCE(date_listed, @date_listed),
          etsy_listing_id = @etsy_listing_id,
          updated_at = @updated_at
      WHERE id = @id
    `
      )
      .run({
        id,
        draft_state: finalDraftState,
        published_at: treatAsDraft ? null : now,
        status: finalStatus,
        is_listed: treatAsDraft ? 0 : 1,
        date_listed: treatAsDraft ? null : now.slice(0, 10),
        etsy_listing_id: listingId,
        updated_at: now,
      });
    const updated = getInventoryById(id);

    logActivity({
      action: treatAsDraft ? "listing.published_draft" : "listing.published",
      entityType: "inventory",
      entityId: id,
      entityLabel: item.item_number || item.description || `Item ${id}`,
      detail: { etsy_listing_id: listingId, mode, developer_mode: isDeveloperMode },
      source: "user",
    });

    return NextResponse.json({
      ok: true,
      item: updated,
      publish_result: {
        success: true,
        status: treatAsDraft ? "draft_on_etsy" : mode === "update" ? "updated" : "published",
        mode,
        listing_id: listingId,
        etsy_state: treatAsDraft ? "draft" : etsyState ?? (mode === "update" ? "active" : null),
        developer_mode: isDeveloperMode,
        uploaded_image_count: uploadedImageCount,
        failed_upload_count: failedUploads.length,
        failed_uploads: failedUploads,
        attributes_pushed: attributesPushed,
        attribute_errors: attributeErrors,
        staged_steps: {
          draft_create: mode === "create",
          image_uploads: failedUploads.length === 0,
          attributes_set: attributeErrors.length === 0,
          listing_text_update: shouldApplyDetails,
          listing_activate: shouldApplyDetails && !treatAsDraft,
        },
      },
    });
  } catch (error) {
    // Log only genuine failures. Intentional control-flow guards (not-ready,
    // ALREADY_PUBLISHED, missing config, etc.) are thrown as ApiRouteError and are not failures.
    if (activityId != null && !(error instanceof ApiRouteError)) {
      try {
        logActivity({
          action: "listing.publish_failed",
          entityType: "inventory",
          entityId: activityId,
          entityLabel: activityLabel,
          detail: { error: error instanceof Error ? error.message : String(error) },
          source: "user",
        });
      } catch {
        // never let activity logging mask the original error
      }
    }
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
