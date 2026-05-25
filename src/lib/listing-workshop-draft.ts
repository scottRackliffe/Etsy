import type { InventoryItem } from "@/types";

export type ListingWorkshopDraft = {
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
};

export function itemToListingWorkshopDraft(item: InventoryItem): ListingWorkshopDraft {
  return {
    listing_title: item.listing_title ?? null,
    listing_description: item.listing_description ?? null,
    listing_tags: item.listing_tags ?? null,
    listing_category_path: item.listing_category_path ?? null,
    listing_title_strategy: item.listing_title_strategy ?? null,
    listing_product_story: item.listing_product_story ?? null,
    listing_condition_clarity: item.listing_condition_clarity ?? null,
    listing_attributes: item.listing_attributes ?? null,
    listing_pricing_shipping_notes: item.listing_pricing_shipping_notes ?? null,
    listing_quality_checklist: item.listing_quality_checklist ?? null,
  };
}
