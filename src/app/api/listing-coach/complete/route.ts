import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import type { ComposeListingCoachResult } from "@/lib/listing-coach";
import { completeListingCoach } from "@/lib/listing-coach-complete";
import { parseCoachJsonField, parseCoachMultipartPhotos } from "@/lib/listing-coach-multipart";

function parseComposePayload(raw: unknown): ComposeListingCoachResult {
  if (!raw || typeof raw !== "object") {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "compose payload is required",
      userMessage: "Listing content was missing. Go back and compose again.",
      actions: ["Return to the preview step and retry."],
      fields: { compose: ["Required"] },
      canRetry: false,
    });
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.listing_title !== "string" || !obj.listing_title.trim()) {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "compose.listing_title is required",
      userMessage: "Listing title was missing.",
      actions: ["Return to the preview step and retry."],
      canRetry: false,
    });
  }
  if (typeof obj.listing_description !== "string" || !obj.listing_description.trim()) {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "compose.listing_description is required",
      userMessage: "Listing description was missing.",
      actions: ["Return to the preview step and retry."],
      canRetry: false,
    });
  }
  const qualityScore =
    obj.quality_score && typeof obj.quality_score === "object"
      ? (obj.quality_score as Record<string, unknown>)
      : {};
  return {
    listing_title: obj.listing_title.trim(),
    listing_description: obj.listing_description.trim(),
    listing_tags: typeof obj.listing_tags === "string" ? obj.listing_tags.trim() : "",
    listing_category_path:
      typeof obj.listing_category_path === "string" ? obj.listing_category_path.trim() : null,
    listing_title_strategy:
      typeof obj.listing_title_strategy === "string" ? obj.listing_title_strategy.trim() : "",
    listing_product_story:
      typeof obj.listing_product_story === "string" ? obj.listing_product_story.trim() : "",
    listing_condition_clarity:
      typeof obj.listing_condition_clarity === "string" ? obj.listing_condition_clarity.trim() : "",
    listing_attributes:
      typeof obj.listing_attributes === "string" ? obj.listing_attributes.trim() : "",
    listing_pricing_shipping_notes:
      typeof obj.listing_pricing_shipping_notes === "string"
        ? obj.listing_pricing_shipping_notes.trim()
        : "",
    listing_quality_checklist:
      typeof obj.listing_quality_checklist === "string" ? obj.listing_quality_checklist.trim() : "",
    quality_score: {
      score: Number(qualityScore.score) || 0,
      hints: Array.isArray(qualityScore.hints)
        ? qualityScore.hints.map(String).filter(Boolean)
        : [],
    },
  };
}

export async function POST(request: Request) {
  try {
    requireEtsyAccessToken(await cookies());

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Expected multipart form data",
        userMessage: "Save request format was invalid.",
        actions: ["Retry saving from Listing Coach."],
        canRetry: false,
      });
    }

    const formData = await request.formData();
    const photos = await parseCoachMultipartPhotos(formData);
    const compose = parseComposePayload(
      parseCoachJsonField(formData, "compose", "Listing content")
    );

    const itemNumberRaw = formData.get("item_number");
    const itemNumber = typeof itemNumberRaw === "string" ? itemNumberRaw.trim() : "";
    const descriptionRaw = formData.get("description");
    const description = typeof descriptionRaw === "string" ? descriptionRaw.trim() : undefined;
    const statusRaw = formData.get("status");
    const status = typeof statusRaw === "string" ? statusRaw.trim() : undefined;
    const conditionRaw = formData.get("condition_code");
    const conditionCode = typeof conditionRaw === "string" ? conditionRaw.trim() : undefined;
    const saleRevenueRaw = formData.get("sale_revenue");
    let saleRevenue: number | null | undefined;
    if (saleRevenueRaw === "" || saleRevenueRaw == null) {
      saleRevenue = null;
    } else {
      const parsed = Number(saleRevenueRaw);
      saleRevenue = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
    const priceConfidenceRaw = formData.get("price_confidence");
    const priceConfidence =
      typeof priceConfidenceRaw === "string" && priceConfidenceRaw.trim()
        ? priceConfidenceRaw.trim()
        : undefined;

    const etsyWhenMadeRaw = formData.get("etsy_when_made");
    const etsyWhenMade =
      typeof etsyWhenMadeRaw === "string" && etsyWhenMadeRaw.trim()
        ? etsyWhenMadeRaw.trim()
        : undefined;
    const etsyTaxonomyIdRaw = formData.get("etsy_taxonomy_id");
    const etsyTaxonomyId =
      etsyTaxonomyIdRaw != null && etsyTaxonomyIdRaw !== ""
        ? Number(etsyTaxonomyIdRaw)
        : undefined;
    const materialsRaw = formData.get("materials");
    const materials =
      typeof materialsRaw === "string" && materialsRaw.trim()
        ? materialsRaw.trim()
        : undefined;
    const itemWeightRaw = formData.get("item_weight");
    const itemWeight =
      itemWeightRaw != null && itemWeightRaw !== "" ? Number(itemWeightRaw) : undefined;
    const itemWeightUnitRaw = formData.get("item_weight_unit");
    const itemWeightUnit =
      typeof itemWeightUnitRaw === "string" && itemWeightUnitRaw.trim()
        ? itemWeightUnitRaw.trim()
        : undefined;
    const itemLengthRaw = formData.get("item_length");
    const itemLength =
      itemLengthRaw != null && itemLengthRaw !== "" ? Number(itemLengthRaw) : undefined;
    const itemWidthRaw = formData.get("item_width");
    const itemWidth =
      itemWidthRaw != null && itemWidthRaw !== "" ? Number(itemWidthRaw) : undefined;
    const itemHeightRaw = formData.get("item_height");
    const itemHeight =
      itemHeightRaw != null && itemHeightRaw !== "" ? Number(itemHeightRaw) : undefined;
    const itemDimensionsUnitRaw = formData.get("item_dimensions_unit");
    const itemDimensionsUnit =
      typeof itemDimensionsUnitRaw === "string" && itemDimensionsUnitRaw.trim()
        ? itemDimensionsUnitRaw.trim()
        : undefined;
    const pictureClassificationsRaw = formData.get("picture_classifications");
    const pictureClassifications =
      typeof pictureClassificationsRaw === "string" && pictureClassificationsRaw.trim()
        ? pictureClassificationsRaw.trim()
        : undefined;

    const result = await completeListingCoach({
      itemNumber,
      description,
      status,
      conditionCode,
      saleRevenue,
      compose,
      itemPhotos: photos.itemPhotos,
      conditionPhotos: photos.conditionPhotos,
      googlePhotosCount: photos.googlePhotos.length,
      priceConfidence,
      etsyWhenMade,
      etsyTaxonomyId: etsyTaxonomyId != null && Number.isFinite(etsyTaxonomyId) ? etsyTaxonomyId : undefined,
      materials,
      itemWeight: itemWeight != null && Number.isFinite(itemWeight) ? itemWeight : undefined,
      itemWeightUnit,
      itemLength: itemLength != null && Number.isFinite(itemLength) ? itemLength : undefined,
      itemWidth: itemWidth != null && Number.isFinite(itemWidth) ? itemWidth : undefined,
      itemHeight: itemHeight != null && Number.isFinite(itemHeight) ? itemHeight : undefined,
      itemDimensionsUnit,
      pictureClassifications,
    });

    return NextResponse.json(
      {
        ok: true,
        item_id: result.itemId,
        item_number: result.itemNumber,
        picture_count: result.pictureCount,
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "LISTING_COACH_COMPLETE_FAILED",
        message: "Failed to complete listing coach save",
        userMessage: "We could not save your listing to inventory.",
        actions: ["Check the item number and retry.", "If photos failed, try again in a moment."],
      })
    );
  }
}
