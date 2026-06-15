import { logActivity } from "@/lib/activity-log";
import { ApiRouteError } from "@/lib/api-error";
import type { ComposeListingCoachResult } from "@/lib/listing-coach";
import type { CoachPhotoFile } from "@/lib/listing-coach-multipart";
import { prepareInventoryPayload } from "@/lib/inventory-validation";
import { generateThumbnail, processAndStorePicture } from "@/lib/picture-storage";
import { createInventory, createPurchase } from "@/lib/records";
import { getDb } from "@/lib/sqlite";

const CONDITION_CODES = new Set(["Mint/Near Mint", "Excellent", "Very Good", "Good", "Fair/As-Is"]);

export type CompleteListingCoachInput = {
  itemNumber: string;
  description?: string;
  status?: string;
  conditionCode?: string;
  quantity?: number;
  saleRevenue?: number | null;
  purchaseCost?: number | null;
  shippingCostInbound?: number | null;
  datePurchased?: string;
  storeCategory?: string;
  categoryTags?: string;
  conditionNotes?: string;
  internalNotes?: string;
  compose: ComposeListingCoachResult;
  itemPhotos: CoachPhotoFile[];
  conditionPhotos: CoachPhotoFile[];
  googlePhotosCount?: number;
  priceConfidence?: string;
  etsyWhenMade?: string;
  etsyTaxonomyId?: number;
  materials?: string;
  isSupply?: boolean;
  itemWeight?: number;
  itemWeightUnit?: string;
  itemLength?: number;
  itemWidth?: number;
  itemHeight?: number;
  itemDimensionsUnit?: string;
  pictureClassifications?: string;
  vendorName?: string;
  vendorShippingPrice?: number | null;
  vendorReferenceNumber?: string;
  vendorNotes?: string;
};

function isUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: string }).code;
  return code === "SQLITE_CONSTRAINT" || code === "SQLITE_CONSTRAINT_UNIQUE";
}

export async function completeListingCoach(
  input: CompleteListingCoachInput
): Promise<{ itemId: number; itemNumber: string; pictureCount: number }> {
  const itemNumber = input.itemNumber.trim();
  if (!itemNumber) {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "item_number is required",
      userMessage: "Item number is required to save.",
      actions: ["Enter an item number and retry."],
      fields: { item_number: ["Required"] },
      canRetry: false,
    });
  }

  const conditionCode =
    input.conditionCode && CONDITION_CODES.has(input.conditionCode) ? input.conditionCode : "Good";

  let payload: Record<string, unknown>;
  try {
    payload = prepareInventoryPayload(
      {
        item_number: itemNumber,
        description: input.description?.trim() || input.compose.listing_title.slice(0, 200),
        status: input.status ?? "In stock",
        condition_code: conditionCode,
        quantity: input.quantity ?? 1,
        sale_revenue: input.saleRevenue ?? null,
        purchase_cost: input.purchaseCost ?? null,
        shipping_cost: input.shippingCostInbound ?? null,
        date_purchased: input.datePurchased || null,
        store_category: input.storeCategory || null,
        category_tags: input.categoryTags || null,
        condition_notes: input.conditionNotes || null,
        has_condition_issue: input.conditionNotes ? 1 : 0,
        notes: input.internalNotes || null,
        listing_title: input.compose.listing_title,
        listing_description: input.compose.listing_description,
        listing_tags: input.compose.listing_tags,
        listing_category_path: input.compose.listing_category_path,
        listing_title_strategy: input.compose.listing_title_strategy,
        listing_product_story: input.compose.listing_product_story,
        listing_condition_clarity: input.compose.listing_condition_clarity,
        listing_attributes: input.compose.listing_attributes,
        listing_pricing_shipping_notes: input.compose.listing_pricing_shipping_notes,
        listing_quality_checklist: input.compose.listing_quality_checklist,
        listing_draft_state: "generated",
        listing_draft_source: "integrated_ai",
        is_listed: 0,
        ...(input.etsyWhenMade ? { etsy_when_made: input.etsyWhenMade } : {}),
        ...(input.etsyTaxonomyId ? { etsy_taxonomy_id: input.etsyTaxonomyId } : {}),
        ...(input.materials ? { materials: input.materials } : {}),
        is_supply: input.isSupply ? 1 : 0,
        ...(input.itemWeight != null ? { item_weight: input.itemWeight } : {}),
        ...(input.itemWeightUnit ? { item_weight_unit: input.itemWeightUnit } : {}),
        ...(input.itemLength != null ? { item_length: input.itemLength } : {}),
        ...(input.itemWidth != null ? { item_width: input.itemWidth } : {}),
        ...(input.itemHeight != null ? { item_height: input.itemHeight } : {}),
        ...(input.itemDimensionsUnit ? { item_dimensions_unit: input.itemDimensionsUnit } : {}),
        ...(input.pictureClassifications ? { picture_classifications: input.pictureClassifications } : {}),
      },
      { forCreate: true }
    );
  } catch {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid inventory payload",
      userMessage: "Please correct the save fields.",
      actions: ["Fix the highlighted fields and retry."],
      canRetry: false,
    });
  }

  let created: Record<string, unknown>;
  try {
    created = createInventory(payload) as Record<string, unknown>;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ApiRouteError({
        status: 409,
        code: "VALIDATION_ERROR",
        message: "Duplicate item number",
        userMessage: "That item number is already in use.",
        actions: ["Choose a different item number and retry."],
        fields: { item_number: ["Already exists"] },
        canRetry: false,
      });
    }
    throw error;
  }

  const itemId = Number(created.id);
  if (!Number.isFinite(itemId) || itemId <= 0) {
    throw new Error("Failed to create inventory item");
  }

  const db = getDb();
  const now = new Date().toISOString();

  for (let slot = 1; slot <= input.itemPhotos.length; slot++) {
    const photo = input.itemPhotos[slot - 1];
    if (!photo) continue;
    const result = await processAndStorePicture(itemId, slot, photo.buffer, "main");
    db.prepare(
      `UPDATE inventory SET picture_${slot} = @path, updated_at = @updated_at WHERE id = @id`
    ).run({
      path: result.relativePath,
      updated_at: now,
      id: itemId,
    });
  }

  for (let slot = 1; slot <= input.conditionPhotos.length; slot++) {
    const photo = input.conditionPhotos[slot - 1];
    if (!photo) continue;
    const result = await processAndStorePicture(itemId, slot, photo.buffer, "condition");
    db.prepare(
      `UPDATE inventory SET condition_picture_${slot} = @path, updated_at = @updated_at WHERE id = @id`
    ).run({
      path: result.relativePath,
      updated_at: now,
      id: itemId,
    });
  }

  await generateThumbnail(itemId);

  if (input.vendorName?.trim()) {
    createPurchase({
      inventory_id: itemId,
      vendor_name: input.vendorName.trim(),
      purchase_date: input.datePurchased || null,
      purchase_price: input.purchaseCost ?? null,
      shipping_price: input.vendorShippingPrice ?? null,
      reference_number: input.vendorReferenceNumber || null,
      notes: input.vendorNotes || null,
    });
  }

  logActivity({
    action: "listing.coach_complete",
    entityType: "inventory",
    entityId: itemId,
    entityLabel: itemNumber,
    detail: {
      picture_count: input.itemPhotos.length,
      condition_picture_count: input.conditionPhotos.length,
      google_photos_count: input.googlePhotosCount ?? 0,
      price_confidence: input.priceConfidence ?? null,
      sale_revenue_set: input.saleRevenue != null && input.saleRevenue > 0,
      quality_score: input.compose.quality_score.score,
      when_made: input.etsyWhenMade ?? null,
      taxonomy_id: input.etsyTaxonomyId ?? null,
      materials_count: input.materials ? JSON.parse(input.materials).length : 0,
    },
    source: "user",
  });

  return {
    itemId,
    itemNumber,
    pictureCount: input.itemPhotos.length,
  };
}
