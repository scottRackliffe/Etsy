import OpenAI from "openai";
import { ApiRouteError } from "@/lib/api-error";
import { getAiConfig } from "@/lib/ai-config";
import { logApiCall } from "@/lib/api-usage";
import { loadListingGuidance, type ListingGuidance } from "@/lib/listing-guidance";
import { computeListingScore } from "@/lib/listing-score";
import { getSetting } from "@/lib/settings-store";
import type { CoachPhotoFile } from "@/lib/listing-coach-multipart";
import {
  cleanJsonResponse,
  normalizeConditionCode,
  normalizeConfirmCards,
  normalizePhotoReview,
  normalizePrice,
  normalizeTags,
} from "@/lib/listing-coach-normalize.mjs";

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

export type ConfirmCard = {
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

export type AnalyzeListingCoachResult = {
  photo_review: PhotoReview;
  suggested_identification: string;
  suggested_condition_code: string;
  price: PriceSuggestion;
  confirm_cards: ConfirmCard[];
  suggested_when_made?: string;
  suggested_taxonomy_id?: number;
  suggested_materials?: string[];
  suggested_dimensions?: SuggestedDimensions;
};

export type ConfirmAnswer = {
  id: string;
  answer: string;
};

export type ComposePriceInput = {
  sale_revenue?: number | null;
  accept_offer_note?: string;
};

export type ComposeListingCoachResult = {
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

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function requireAiConfigOrThrow(): NonNullable<ReturnType<typeof getAiConfig>> {
  const config = getAiConfig();
  if (!config) {
    throw new ApiRouteError({
      status: 503,
      code: "AI_NOT_CONFIGURED",
      message: "Integrated AI is not configured",
      userMessage: "Listing Coach needs AI configured in Config before it can analyze photos.",
      actions: [
        "Open Config → AI settings and add your API key.",
        "Use Test connection to verify.",
      ],
      canRetry: false,
    });
  }
  return config;
}

function getOpenAiClient(): OpenAI {
  const config = requireAiConfigOrThrow();
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl ?? undefined,
    timeout: Math.max(config.timeoutMs, 60000),
    maxRetries: config.retryCount,
  });
}

function clipForPrompt(content: string, maxChars = 25000): string {
  if (content.length <= maxChars) {
    return content;
  }
  return `${content.slice(0, maxChars)}\n\n[truncated for prompt length]`;
}

function bufferToDataUrl(buffer: Buffer, filename: string): string {
  const ext = filename.includes(".")
    ? filename.slice(filename.lastIndexOf(".")).toLowerCase()
    : ".jpg";
  const mimeType = IMAGE_MIME_BY_EXT[ext] ?? "image/jpeg";
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function defaultConfirmCards(identification: string): ConfirmCard[] {
  return [
    {
      id: "what_is_it",
      question: "What is this item?",
      suggested_answer: identification,
    },
    {
      id: "included",
      question: "What's included?",
      suggested_answer: "Single item as shown in photos.",
    },
    {
      id: "condition",
      question: "What condition issues should buyers know?",
      suggested_answer: "See photos for condition details.",
    },
    {
      id: "buyer",
      question: "Who is this for?",
      suggested_answer: "Collectors and vintage decor enthusiasts.",
    },
    {
      id: "special",
      question: "Anything special to highlight?",
      suggested_answer: "",
      optional: true,
    },
  ];
}

function buildGuidanceText(guidance: ListingGuidance): string {
  return [
    "Guidance document: etsy-listing-template-and-requirements.md",
    clipForPrompt(guidance.template),
    "",
    "Guidance document: How_to_Win_on_Etsy.md",
    clipForPrompt(guidance.listingTips),
    "",
    "Guidance document: Etsy_Photo_Guide.md",
    clipForPrompt(guidance.photoTips),
  ].join("\n");
}

function buildImageContent(photos: CoachPhotoFile[]): Array<{
  type: "input_image";
  image_url: string;
  detail: "auto";
}> {
  return photos.map((photo) => ({
    type: "input_image" as const,
    image_url: bufferToDataUrl(photo.buffer, photo.filename),
    detail: "auto" as const,
  }));
}

async function callAiJson(params: {
  system: string;
  userText: string;
  images: CoachPhotoFile[];
}): Promise<unknown> {
  const config = requireAiConfigOrThrow();
  const openai = getOpenAiClient();

  const content: Array<
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string; detail: "auto" }
  > = [{ type: "input_text", text: params.userText }, ...buildImageContent(params.images)];

  try {
    const response = await openai.responses.create({
      model: config.model,
      max_output_tokens: Math.max(config.tokenBudget, 4000),
      temperature: 0.2,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: params.system }],
        },
        {
          role: "user",
          content,
        },
      ],
    });
    logApiCall("openai", "responses.create/listing-coach", 200);

    const outputText = response.output_text?.trim();
    if (!outputText) {
      throw new Error("AI returned empty output");
    }
    return JSON.parse(cleanJsonResponse(outputText));
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      logApiCall("openai", "responses.create/listing-coach", error.status ?? 500);
      if (error.status === 429) {
        throw new ApiRouteError({
          status: 429,
          code: "LISTING_ANALYZE_FAILED",
          message: "AI rate limit exceeded",
          userMessage: "The AI service is busy. Please wait a moment and try again.",
          actions: ["Wait a minute and retry."],
          canRetry: true,
        });
      }
    }
    throw error;
  }
}

export async function analyzeListingCoach(params: {
  itemPhotos: CoachPhotoFile[];
  conditionPhotos: CoachPhotoFile[];
  googlePhotos: CoachPhotoFile[];
}): Promise<AnalyzeListingCoachResult> {
  const guidance = await loadListingGuidance();
  const allImages = [...params.itemPhotos, ...params.conditionPhotos, ...params.googlePhotos];

  const userText = [
    "Analyze these item photos for an Etsy vintage/antique listing coach flow.",
    "Item photos are the product. Condition photos show flaws. Google screenshots show comparable listings/prices from Google Visual Search.",
    "",
    "Return strict JSON only with keys:",
    "- photo_review: { present_shots: string[], missing_shots: string[], advisories: string[],",
    "    classifications: Array<{ photo_index: number, type: string, confidence: number }>,",
    "    suggested_order: number[] }",
    "  Shot types: hero, angle, detail, backstamp, scale, imperfection, underside, grouping, lifestyle, measurement, extra",
    "  classifications: classify each item photo by shot type with confidence 0-1. photo_index is 0-based.",
    "  suggested_order: reorder photo indices into canonical sequence (hero first, then detail, backstamp, scale, etc.)",
    "- suggested_identification: string (maker, pattern, item type, era if inferable; never invent unsupported details)",
    "- suggested_condition_code: one of Mint/Near Mint, Excellent, Very Good, Good, Fair/As-Is",
    "- price: { suggested_list_price, suggested_price_low, suggested_price_high, confidence (high|medium|low), rationale }",
    "- confirm_cards: array of up to 5 { id, question, suggested_answer, optional? }",
    "  Required ids: what_is_it, included, condition, buyer, special (special optional)",
    "- suggested_when_made: string (Etsy when_made enum: made_to_order, 2020_2026, 2010_2019, 2004_2009, 2000_2003, 1990s, 1980s, 1970s, 1960s, 1950s, 1940s, 1930s, 1920s, 1910s, 1900s, 1800s, 1700s, before_1700)",
    "- suggested_taxonomy_id: number (Etsy taxonomy ID if you can determine the category; omit if unsure)",
    "- suggested_materials: string[] (e.g. [\"ceramic\",\"glaze\",\"gold trim\"]; omit if unsure)",
    "- suggested_dimensions: { weight?: number, weight_unit?: string, length?: number, width?: number, height?: number, dimensions_unit?: string } (omit if cannot estimate)",
    "",
    "Use Google screenshots for price comps when present. State low confidence when unsure.",
    "",
    buildGuidanceText(guidance),
  ].join("\n");

  const parsed = (await callAiJson({
    system:
      "You are an Etsy listing coach for vintage and antique items. Be accurate, never misleading, and cite Google screenshot comps when pricing.",
    userText,
    images: allImages,
  })) as Record<string, unknown>;

  const identification =
    typeof parsed.suggested_identification === "string"
      ? parsed.suggested_identification.trim()
      : "Vintage item (identification pending)";

  let confirmCards = normalizeConfirmCards(parsed.confirm_cards);
  if (confirmCards.length === 0) {
    confirmCards = defaultConfirmCards(identification);
  }

  const photoReview: PhotoReview = normalizePhotoReview(parsed.photo_review);

  const rawReview = parsed.photo_review as Record<string, unknown> | undefined;
  if (rawReview && Array.isArray(rawReview.classifications)) {
    photoReview.classifications = (rawReview.classifications as Array<Record<string, unknown>>)
      .filter(
        (c) =>
          typeof c.photo_index === "number" &&
          typeof c.type === "string"
      )
      .map((c) => ({
        photo_index: c.photo_index as number,
        type: c.type as string,
        confidence: typeof c.confidence === "number" ? c.confidence : 0.5,
      }));
  }
  if (rawReview && Array.isArray(rawReview.suggested_order)) {
    photoReview.suggested_order = (rawReview.suggested_order as unknown[])
      .filter((i): i is number => typeof i === "number")
      .slice(0, params.itemPhotos.length);
  }

  const result: AnalyzeListingCoachResult = {
    photo_review: photoReview,
    suggested_identification: identification,
    suggested_condition_code: normalizeConditionCode(parsed.suggested_condition_code),
    price: normalizePrice(parsed.price),
    confirm_cards: confirmCards,
  };

  if (typeof parsed.suggested_when_made === "string" && parsed.suggested_when_made.trim()) {
    result.suggested_when_made = parsed.suggested_when_made.trim();
  }
  if (typeof parsed.suggested_taxonomy_id === "number" && parsed.suggested_taxonomy_id > 0) {
    result.suggested_taxonomy_id = parsed.suggested_taxonomy_id;
  }
  if (Array.isArray(parsed.suggested_materials) && parsed.suggested_materials.length > 0) {
    result.suggested_materials = parsed.suggested_materials
      .filter((m): m is string => typeof m === "string" && m.trim().length > 0)
      .map((m) => m.trim());
  }
  if (parsed.suggested_dimensions && typeof parsed.suggested_dimensions === "object") {
    const d = parsed.suggested_dimensions as Record<string, unknown>;
    result.suggested_dimensions = {};
    if (typeof d.weight === "number") result.suggested_dimensions.weight = d.weight;
    if (typeof d.weight_unit === "string") result.suggested_dimensions.weight_unit = d.weight_unit;
    if (typeof d.length === "number") result.suggested_dimensions.length = d.length;
    if (typeof d.width === "number") result.suggested_dimensions.width = d.width;
    if (typeof d.height === "number") result.suggested_dimensions.height = d.height;
    if (typeof d.dimensions_unit === "string") result.suggested_dimensions.dimensions_unit = d.dimensions_unit;
  }

  return result;
}

export async function composeListingCoach(params: {
  itemPhotos: CoachPhotoFile[];
  conditionPhotos: CoachPhotoFile[];
  googlePhotos: CoachPhotoFile[];
  confirmAnswers: ConfirmAnswer[];
  price: ComposePriceInput;
  identificationOverride?: string;
  suggestedConditionCode?: string;
  whenMade?: string;
  taxonomyId?: number;
  materials?: string;
}): Promise<ComposeListingCoachResult> {
  const guidance = await loadListingGuidance();
  const allImages = [...params.itemPhotos, ...params.conditionPhotos, ...params.googlePhotos];

  const userText = [
    "Compose a complete Etsy listing from photos and operator confirmations.",
    "Return strict JSON only with keys:",
    "- listing_title, listing_description, listing_tags (comma-separated, up to 13 unique tags)",
    "- listing_category_path (optional string)",
    "- listing_title_strategy, listing_product_story, listing_condition_clarity, listing_attributes",
    "- listing_pricing_shipping_notes, listing_quality_checklist",
    "",
    "Operator confirm answers:",
    JSON.stringify(params.confirmAnswers, null, 2),
    "",
    params.identificationOverride
      ? `Identification override: ${params.identificationOverride}`
      : "",
    params.suggestedConditionCode
      ? `Suggested condition code: ${params.suggestedConditionCode}`
      : "",
    params.price.sale_revenue != null
      ? `List price (sale_revenue): ${params.price.sale_revenue}`
      : "List price: not set yet",
    params.price.accept_offer_note ? `Accept-offer note: ${params.price.accept_offer_note}` : "",
    params.whenMade ? `Era (when_made): ${params.whenMade}` : "",
    params.taxonomyId ? `Etsy taxonomy ID: ${params.taxonomyId}` : "",
    params.materials ? `Materials: ${params.materials}` : "",
    "",
    "Never invent maker/pattern not supported by photos or Google results.",
    "",
    buildGuidanceText(guidance),
  ]
    .filter(Boolean)
    .join("\n");

  const parsed = (await callAiJson({
    system:
      "You are an Etsy listing writer for vintage and antique items. Produce search-optimized, accurate listing content.",
    userText,
    images: allImages,
  })) as Record<string, unknown>;

  if (typeof parsed.listing_title !== "string" || !parsed.listing_title.trim()) {
    throw new Error("AI response missing listing_title");
  }
  if (typeof parsed.listing_description !== "string" || !parsed.listing_description.trim()) {
    throw new Error("AI response missing listing_description");
  }

  const listingTags = normalizeTags(parsed.listing_tags);
  const listingCategoryPath =
    typeof parsed.listing_category_path === "string" &&
    parsed.listing_category_path.trim().length > 0
      ? parsed.listing_category_path.trim()
      : null;

  const stringField = (key: string): string =>
    typeof parsed[key] === "string" ? String(parsed[key]).trim() : "";

  const pictureCount = params.itemPhotos.length;
  const pictureSlots: Record<string, string | null> = {};
  for (let i = 1; i <= 20; i++) {
    pictureSlots[`picture_${i}`] = i <= pictureCount ? "set" : null;
  }
  const minScoreStr = getSetting("listing.min_quality_score");
  const minScoreVal = minScoreStr != null ? parseInt(minScoreStr, 10) : 80;
  const scoreResult = computeListingScore({
    listing_title: parsed.listing_title.trim(),
    listing_description: parsed.listing_description.trim(),
    listing_tags: listingTags,
    condition_code: params.suggestedConditionCode ?? "Good",
    sale_revenue: params.price.sale_revenue ?? null,
    ...pictureSlots,
  }, minScoreVal);

  return {
    listing_title: parsed.listing_title.trim(),
    listing_description: parsed.listing_description.trim(),
    listing_tags: listingTags,
    listing_category_path: listingCategoryPath,
    listing_title_strategy: stringField("listing_title_strategy"),
    listing_product_story: stringField("listing_product_story"),
    listing_condition_clarity: stringField("listing_condition_clarity"),
    listing_attributes: stringField("listing_attributes"),
    listing_pricing_shipping_notes: stringField("listing_pricing_shipping_notes"),
    listing_quality_checklist: stringField("listing_quality_checklist"),
    quality_score: {
      score: scoreResult.score,
      hints: scoreResult.tips,
    },
  };
}
