/**
 * Upgraded listing generator — calls the full research + compose AI engine
 * (ADR-085 §3, WS-L1). Returns the complete field set including price
 * recommendation and all strategy/evidence fields.
 */
import type { InventoryRecord } from "@/lib/inventory";
import { getAllPictureReferences } from "@/lib/inventory";
import { researchAndCompose, type CoachPhotoFile, type PriceSuggestion, type Citation, type ComplianceCheck, type PhotoClassification } from "@/lib/listing-ai";
import { loadPhotosFromPaths } from "@/lib/listing-ai-multipart";

export type GeneratedListing = {
  listing_title: string;
  listing_description: string;
  listing_tags: string;
  listing_category_path: string | null;
  listing_title_strategy: string;
  listing_product_story: string;
  listing_condition_clarity: string;
  listing_attributes: string;
  listing_pricing_shipping_notes: string;
  listing_quality_checklist: string;
  suggested_etsy_when_made?: string;
  suggested_taxonomy_id?: number;
  suggested_taxonomy_path?: string;
  suggested_materials_json?: string;
  picture_classifications_json?: string;
  price: PriceSuggestion;
  citations: Citation[];
  compliance_check: ComplianceCheck;
  suggested_sale_revenue: number | null;
};

/**
 * Generate a full Etsy listing from the item using the research + compose AI engine.
 * Sends all non-empty pictures (item + condition) to the AI.
 * No `sale_revenue` gate — price is an output, not an input (ADR-085 §2).
 * Optional googlePhotos/googleText provide web-search context for price research.
 */
export async function generateListingFromAi(params: {
  item: InventoryRecord;
  googlePhotos?: CoachPhotoFile[];
  googleText?: string;
}): Promise<GeneratedListing> {
  const item = params.item;

  const allPicturePaths = getAllPictureReferences(item);
  // Condition photos are stored in the condition_picture_* columns
  const conditionPicturePaths: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const val = (item as unknown as Record<string, unknown>)[`condition_picture_${i}`];
    if (typeof val === "string" && val.trim()) conditionPicturePaths.push(val.trim());
  }
  // Non-condition picture paths = all picture_1..20
  const itemPicturePaths = allPicturePaths.filter(
    (p) => !conditionPicturePaths.includes(p)
  );

  const [itemPhotos, conditionPhotos] = await Promise.all([
    loadPhotosFromPaths(itemPicturePaths),
    loadPhotosFromPaths(conditionPicturePaths),
  ]);

  const result = await researchAndCompose({
    itemPhotos,
    conditionPhotos,
    googlePhotos: params.googlePhotos ?? [],
    googleText: params.googleText ?? "",
    conditionCode: item.condition_code ?? undefined,
    conditionNotes: item.condition_notes ?? undefined,
    description: item.description ?? undefined,
    storeCategory: item.category_tags ?? undefined,
  });

  const suggestedWhenMade =
    result.suggested_when_made?.value?.trim() || undefined;
  const suggestedTaxonomyId = result.suggested_taxonomy_id;
  const suggestedTaxonomyPath = result.suggested_taxonomy_path;

  let suggestedMaterialsJson: string | undefined;
  if (result.suggested_materials && result.suggested_materials.length > 0) {
    const materialStrings = result.suggested_materials
      .filter((m) => m.value.trim().length > 0)
      .map((m) => m.value.trim());
    if (materialStrings.length > 0) {
      suggestedMaterialsJson = JSON.stringify(materialStrings);
    }
  }

  let pictureClassificationsJson: string | undefined;
  if (result.photo_review.classifications && result.photo_review.classifications.length > 0) {
    pictureClassificationsJson = JSON.stringify(result.photo_review.classifications);
  }

  const suggestedSaleRevenue = result.price.suggested_list_price ?? null;

  return {
    listing_title: result.listing_title,
    listing_description: result.listing_description,
    listing_tags: result.listing_tags,
    listing_category_path: result.listing_category_path,
    listing_title_strategy: result.listing_title_strategy,
    listing_product_story: result.listing_product_story,
    listing_condition_clarity: result.listing_condition_clarity,
    listing_attributes: result.listing_attributes,
    listing_pricing_shipping_notes: result.listing_pricing_shipping_notes,
    listing_quality_checklist: result.listing_quality_checklist,
    suggested_etsy_when_made: suggestedWhenMade,
    suggested_taxonomy_id: suggestedTaxonomyId,
    suggested_taxonomy_path: suggestedTaxonomyPath,
    suggested_materials_json: suggestedMaterialsJson,
    picture_classifications_json: pictureClassificationsJson,
    price: result.price,
    citations: result.citations,
    compliance_check: result.compliance_check,
    suggested_sale_revenue: suggestedSaleRevenue,
  };
}
