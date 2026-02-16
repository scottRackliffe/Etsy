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
  condition_picture_1: string | null;
  condition_picture_2: string | null;
  condition_picture_3: string | null;
  condition_picture_4: string | null;
  condition_picture_5: string | null;
  listing_title: string | null;
  listing_description: string | null;
  listing_tags: string | null;
  listing_category_path: string | null;
  listing_title_strategy: string | null;
  listing_product_story: string | null;
  listing_condition_clarity: string | null;
  listing_attributes: string | null;
  listing_pricing_shipping_notes: string | null;
  listing_quality_checklist: string | null;
  listing_draft_state: string | null;
  listing_draft_source: string | null;
  listing_export_id: string | null;
  listing_approved_at: string | null;
  listing_published_at: string | null;
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
  listing_draft_source?: "manual" | "integrated_ai" | "portable_import";
  listing_export_id?: string | null;
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
  if (
    item.sale_revenue == null ||
    Number.isNaN(Number(item.sale_revenue)) ||
    Number(item.sale_revenue) <= 0
  ) {
    add(
      "sale_revenue",
      "Sale revenue (price) must be set to a value greater than 0 before requesting listing generation."
    );
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

  const draftSource = content.listing_draft_source ?? "integrated_ai";
  const draftState = draftSource === "portable_import" ? "imported" : "generated";

  db.prepare(
    `
      UPDATE inventory
      SET
        listing_title = @listing_title,
        listing_description = @listing_description,
        listing_tags = @listing_tags,
        listing_category_path = @listing_category_path,
        listing_draft_state = @listing_draft_state,
        listing_draft_source = @listing_draft_source,
        listing_export_id = @listing_export_id,
        listing_approved_at = NULL,
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
    listing_draft_state: draftState,
    listing_draft_source: draftSource,
    listing_export_id: content.listing_export_id ?? null,
    updated_at: now,
  });

  return getInventoryById(id);
}
