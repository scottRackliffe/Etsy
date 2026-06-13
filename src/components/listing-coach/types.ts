export type CoachPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

export type PhotoClassification = {
  photo_index: number;
  type: string;
  confidence: number;
};

export type PhotoReview = {
  present_shots: string[];
  missing_shots: string[];
  advisories: string[];
  classifications?: PhotoClassification[];
  suggested_order?: number[];
};

export type PriceSuggestion = {
  suggested_list_price: number | null;
  suggested_price_low: number | null;
  suggested_price_high: number | null;
  confidence: "high" | "medium" | "low";
  rationale: string;
};

export type ConfirmCardData = {
  id: string;
  question: string;
  suggested_answer: string;
  optional?: boolean;
};

export type SuggestedDimensions = {
  weight?: number;
  weight_unit?: string;
  length?: number;
  width?: number;
  height?: number;
  dimensions_unit?: string;
};

export type AnalyzeResponse = {
  ok: true;
  photo_review: PhotoReview;
  suggested_identification: string;
  suggested_condition_code: string;
  price: PriceSuggestion;
  confirm_cards: ConfirmCardData[];
  suggested_when_made?: string;
  suggested_taxonomy_id?: number;
  suggested_materials?: string[];
  suggested_dimensions?: SuggestedDimensions;
};

export type ConfirmAnswer = {
  id: string;
  answer: string;
};

export type ComposeResponse = {
  ok: true;
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
  quality_score: {
    score: number;
    hints: string[];
  };
};

export type CoachStep =
  | "welcome"
  | "photos"
  | "google"
  | "analyze"
  | "price"
  | "era_category"
  | "confirm"
  | "compose"
  | "save";

export function appendCoachPhotos(
  formData: FormData,
  itemPhotos: CoachPhoto[],
  conditionPhotos: CoachPhoto[],
  googlePhotos: CoachPhoto[]
): void {
  for (const photo of itemPhotos) {
    formData.append("item_photos[]", photo.file);
  }
  for (const photo of conditionPhotos) {
    formData.append("condition_photos[]", photo.file);
  }
  for (const photo of googlePhotos) {
    formData.append("google_photos[]", photo.file);
  }
}

export function createCoachPhoto(file: File): CoachPhoto {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    file,
    previewUrl: URL.createObjectURL(file),
  };
}

export function revokeCoachPhotos(photos: CoachPhoto[]): void {
  for (const photo of photos) {
    URL.revokeObjectURL(photo.previewUrl);
  }
}

export const SHOT_LABELS: Record<string, string> = {
  hero: "Hero / main shot",
  angle: "Alternate angle",
  detail: "Detail close-up",
  backstamp: "Maker mark / backstamp",
  scale: "Scale / size reference",
  imperfection: "Flaws / wear",
  underside: "Underside / bottom",
  grouping: "Group / context shot",
  lifestyle: "Lifestyle / in-use",
  measurement: "Measurement / ruler",
  extra: "Extra / supplemental",
};

export const SHOT_DESCRIPTIONS: Record<string, string> = {
  hero: "Straight-on shot showing the entire item (or set). Clean, bright, and centered — this is the first photo buyers see.",
  angle: "A 45-degree view that shows depth and dimension. Soft shadows help the item look three-dimensional.",
  detail: "Zoom in on the pattern, texture, transfer print, or edges. Show the craftsmanship up close.",
  backstamp: "Clear photo of the maker's mark, label, or stamp on the bottom. Essential for vintage — builds buyer trust.",
  scale: "Include a ruler, your hand, or a familiar object next to the item so buyers understand the size.",
  imperfection: "Honestly document any crazing, chips, scratches, or utensil marks. Buyers appreciate transparency — fewer returns.",
  underside: "Bottom or underside view showing authenticity and structure.",
  grouping: "All pieces in a set arranged together symmetrically. Shows the complete value of what's included.",
  lifestyle: "Item staged in context — on a kitchen table, shelf, or with simple props like greenery or a napkin. Optional but boosts sales.",
  measurement: "A ruler or tape measure placed directly against the item for exact dimensions.",
  extra: "Any additional view that doesn't fit the categories above.",
};

export const SHOT_SLOT_ORDER: string[] = [
  "hero",
  "angle",
  "detail",
  "backstamp",
  "scale",
  "imperfection",
  "underside",
  "grouping",
  "lifestyle",
  "measurement",
];
