export type CoachPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

export type PhotoReview = {
  present_shots: string[];
  missing_shots: string[];
  advisories: string[];
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

export type AnalyzeResponse = {
  ok: true;
  photo_review: PhotoReview;
  suggested_identification: string;
  suggested_condition_code: string;
  price: PriceSuggestion;
  confirm_cards: ConfirmCardData[];
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
  detail: "Detail close-up",
  backstamp: "Maker mark / backstamp",
  scale: "Scale / size reference",
  imperfections: "Flaws / wear",
  group: "Group / context shot",
};
