import { getDb } from "@/lib/sqlite";

export type InventoryRecord = {
  id: number;
  item_number: string | null;
  description: string | null;
  sale_revenue: number | null;
  quantity: number | null;
  etsy_listing_id: string | null;
  condition_code: string | null;
  condition_notes: string | null;
  category_tags: string | null;
  picture_1: string | null;
  picture_2: string | null;
  picture_3: string | null;
  picture_4: string | null;
  picture_5: string | null;
  picture_6: string | null;
  picture_7: string | null;
  picture_8: string | null;
  picture_9: string | null;
  picture_10: string | null;
  picture_11: string | null;
  picture_12: string | null;
  picture_13: string | null;
  picture_14: string | null;
  picture_15: string | null;
  picture_16: string | null;
  picture_17: string | null;
  picture_18: string | null;
  picture_19: string | null;
  picture_20: string | null;
  video_path: string | null;
  condition_picture_1: string | null;
  condition_picture_2: string | null;
  condition_picture_3: string | null;
  condition_picture_4: string | null;
  condition_picture_5: string | null;
  etsy_when_made: string | null;
  etsy_taxonomy_id: number | null;
  etsy_who_made: string | null;
  etsy_shipping_profile_id: number | null;
  etsy_return_policy_id: number | null;
  materials: string | null;
  item_weight: number | null;
  item_weight_unit: string | null;
  item_length: number | null;
  item_width: number | null;
  item_height: number | null;
  item_dimensions_unit: string | null;
  is_supply: number | null;
  picture_classifications: string | null;
  listing_title: string | null;
  listing_description: string | null;
  listing_tags: string | null;
  listing_category_path: string | null;
  listing_title_strategy: string | null;
  listing_product_story: string | null;
  listing_condition_clarity: string | null;
  listing_attributes: string | null;
  etsy_attributes_json: string | null;
  listing_pricing_shipping_notes: string | null;
  listing_quality_checklist: string | null;
  listing_published_at: string | null;
  listing_phase: string | null;
  listing_source_hash: string | null;
  listing_generated_at: string | null;
  listing_quality_json: string | null;
  shot_list_json: string | null;
  dimension_annotation_json: string | null;
  is_listed: number | null;
  updated_at: string | null;
};

const PICTURE_KEYS: ReadonlyArray<keyof InventoryRecord> = [
  "picture_1",
  "picture_2",
  "picture_3",
  "picture_4",
  "picture_5",
  "picture_6",
  "picture_7",
  "picture_8",
  "picture_9",
  "picture_10",
  "picture_11",
  "picture_12",
  "picture_13",
  "picture_14",
  "picture_15",
  "picture_16",
  "picture_17",
  "picture_18",
  "picture_19",
  "picture_20",
  "condition_picture_1",
  "condition_picture_2",
  "condition_picture_3",
  "condition_picture_4",
  "condition_picture_5",
];

export type ListingContentUpdate = {
  listing_title: string;
  listing_description: string;
  listing_tags: string;
  listing_category_path?: string | null;
  listing_title_strategy?: string | null;
  listing_product_story?: string | null;
  listing_condition_clarity?: string | null;
  listing_attributes?: string | null;
  listing_pricing_shipping_notes?: string | null;
  listing_quality_checklist?: string | null;
  etsy_when_made?: string | null;
  etsy_taxonomy_id?: number | null;
  materials?: string | null;
  picture_classifications?: string | null;
  /** Write this price only if the item's sale_revenue is currently unset/zero. */
  sale_revenue_if_unset?: number | null;
};

export type ListingRequestValidation = {
  ok: boolean;
  fields: Record<string, string[]>;
};

export function getInventoryById(id: number): InventoryRecord | null {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM inventory WHERE id = ?");
  const row = stmt.get(id) as InventoryRecord | undefined;
  return row ?? null;
}

export function getAllPictureReferences(item: InventoryRecord): string[] {
  return PICTURE_KEYS.map((key) => item[key])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
}

/**
 * Required data gate before allowing a listing-generation request.
 * This enforces "can't request listing until required item data exists."
 */
export function validateItemForListingRequest(item: InventoryRecord): ListingRequestValidation {
  const fields: Record<string, string[]> = {};
  const add = (key: string, message: string) => {
    fields[key] = fields[key] ?? [];
    fields[key].push(message);
  };

  const itemNumber = item.item_number?.trim() ?? "";
  const description = item.description?.trim() ?? "";
  const conditionCode = item.condition_code?.trim() ?? "";
  const pictures = getAllPictureReferences(item);

  if (!itemNumber) {
    add("item_number", "Item number is required before requesting listing generation.");
  }
  if (!description) {
    add("description", "Item description is required before requesting listing generation.");
  }
  if (!conditionCode) {
    add("condition_code", "Condition code is required before requesting listing generation.");
  }
  if (pictures.length === 0) {
    add("pictures", "At least one item picture is required before requesting listing generation.");
  }

  return { ok: Object.keys(fields).length === 0, fields };
}

export function updateListingContent(
  id: number,
  content: ListingContentUpdate
): InventoryRecord | null {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(
    `
      UPDATE inventory
      SET
        listing_title = @listing_title,
        listing_description = @listing_description,
        listing_tags = @listing_tags,
        listing_category_path = @listing_category_path,
        listing_title_strategy = COALESCE(@listing_title_strategy, listing_title_strategy),
        listing_product_story = COALESCE(@listing_product_story, listing_product_story),
        listing_condition_clarity = COALESCE(@listing_condition_clarity, listing_condition_clarity),
        listing_attributes = COALESCE(@listing_attributes, listing_attributes),
        listing_pricing_shipping_notes = COALESCE(@listing_pricing_shipping_notes, listing_pricing_shipping_notes),
        listing_quality_checklist = COALESCE(@listing_quality_checklist, listing_quality_checklist),
        etsy_when_made = CASE WHEN @set_etsy_when_made = 1 THEN @etsy_when_made ELSE etsy_when_made END,
        etsy_taxonomy_id = CASE WHEN @set_etsy_taxonomy_id = 1 THEN @etsy_taxonomy_id ELSE etsy_taxonomy_id END,
        materials = CASE WHEN @set_materials = 1 THEN @materials ELSE materials END,
        picture_classifications = CASE WHEN @set_pic_class = 1 THEN @picture_classifications ELSE picture_classifications END,
        sale_revenue = CASE
          WHEN @sale_revenue_if_unset IS NOT NULL
           AND (sale_revenue IS NULL OR CAST(sale_revenue AS REAL) = 0)
          THEN @sale_revenue_if_unset
          ELSE sale_revenue
        END,
        listing_published_at = NULL,
        is_listed = 0,
        updated_at = @updated_at
      WHERE id = @id
    `
  ).run({
    id,
    listing_title: content.listing_title,
    listing_description: content.listing_description,
    listing_tags: content.listing_tags,
    listing_category_path: content.listing_category_path ?? null,
    listing_title_strategy: content.listing_title_strategy ?? null,
    listing_product_story: content.listing_product_story ?? null,
    listing_condition_clarity: content.listing_condition_clarity ?? null,
    listing_attributes: content.listing_attributes ?? null,
    listing_pricing_shipping_notes: content.listing_pricing_shipping_notes ?? null,
    listing_quality_checklist: content.listing_quality_checklist ?? null,
    set_etsy_when_made: content.etsy_when_made !== undefined ? 1 : 0,
    etsy_when_made: content.etsy_when_made ?? null,
    set_etsy_taxonomy_id: content.etsy_taxonomy_id !== undefined ? 1 : 0,
    etsy_taxonomy_id: content.etsy_taxonomy_id ?? null,
    set_materials: content.materials !== undefined ? 1 : 0,
    materials: content.materials ?? null,
    set_pic_class: content.picture_classifications !== undefined ? 1 : 0,
    picture_classifications: content.picture_classifications ?? null,
    sale_revenue_if_unset: content.sale_revenue_if_unset ?? null,
    updated_at: now,
  });

  return getInventoryById(id);
}
