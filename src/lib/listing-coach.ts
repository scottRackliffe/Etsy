import OpenAI from "openai";
import { ApiRouteError } from "@/lib/api-error";
import { getAiConfig } from "@/lib/ai-config";
import { loadListingGuidance, type ListingGuidance } from "@/lib/listing-guidance";
import { computeListingScore } from "@/lib/listing-score";
import type { CoachPhotoFile } from "@/lib/listing-coach-multipart";

const CONDITION_CODES = new Set([
  "Mint/Near Mint",
  "Excellent",
  "Very Good",
  "Good",
  "Fair/As-Is",
]);

const PHOTO_SHOT_TYPES = ["hero", "detail", "backstamp", "scale", "imperfections", "group"] as const;

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

export type ConfirmCard = {
  id: string;
  question: string;
  suggested_answer: string;
  optional?: boolean;
};

export type AnalyzeListingCoachResult = {
  photo_review: PhotoReview;
  suggested_identification: string;
  suggested_condition_code: string;
  price: PriceSuggestion;
  confirm_cards: ConfirmCard[];
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
      actions: ["Open Config → AI settings and add your API key.", "Use Test connection to verify."],
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

function cleanJsonResponse(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function clipForPrompt(content: string, maxChars = 25000): string {
  if (content.length <= maxChars) {
    return content;
  }
  return `${content.slice(0, maxChars)}\n\n[truncated for prompt length]`;
}

function bufferToDataUrl(buffer: Buffer, filename: string): string {
  const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")).toLowerCase() : ".jpg";
  const mimeType = IMAGE_MIME_BY_EXT[ext] ?? "image/jpeg";
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function normalizeTags(rawTags: unknown): string {
  const parsed = Array.isArray(rawTags)
    ? rawTags
    : typeof rawTags === "string"
      ? rawTags.split(/[,\n]/g)
      : [];

  const tags = parsed
    .map((tag) => String(tag).trim())
    .filter((tag) => tag.length > 0)
    .filter(
      (tag, index, all) => all.findIndex((t) => t.toLowerCase() === tag.toLowerCase()) === index
    )
    .slice(0, 13);

  if (tags.length === 0) {
    throw new Error("AI returned empty listing tags");
  }

  return tags.join(", ");
}

function normalizeConditionCode(raw: unknown): string {
  if (typeof raw !== "string") return "Good";
  const trimmed = raw.trim();
  if (CONDITION_CODES.has(trimmed)) return trimmed;
  return "Good";
}

function normalizePhotoReview(raw: unknown): PhotoReview {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const present = Array.isArray(obj.present_shots)
    ? obj.present_shots
        .map(String)
        .filter((s) => PHOTO_SHOT_TYPES.includes(s as (typeof PHOTO_SHOT_TYPES)[number]))
    : [];
  const missing = Array.isArray(obj.missing_shots)
    ? obj.missing_shots
        .map(String)
        .filter((s) => PHOTO_SHOT_TYPES.includes(s as (typeof PHOTO_SHOT_TYPES)[number]))
    : [];
  const advisories = Array.isArray(obj.advisories)
    ? obj.advisories.map(String).filter(Boolean)
    : [];
  return { present_shots: present, missing_shots: missing, advisories };
}

function normalizePrice(raw: unknown): PriceSuggestion {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const confidenceRaw = typeof obj.confidence === "string" ? obj.confidence.toLowerCase() : "low";
  const confidence =
    confidenceRaw === "high" || confidenceRaw === "medium" ? confidenceRaw : "low";
  const toNum = (value: unknown): number | null => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  return {
    suggested_list_price: toNum(obj.suggested_list_price),
    suggested_price_low: toNum(obj.suggested_price_low),
    suggested_price_high: toNum(obj.suggested_price_high),
    confidence,
    rationale: typeof obj.rationale === "string" ? obj.rationale.trim() : "",
  };
}

function normalizeConfirmCards(raw: unknown): ConfirmCard[] {
  if (!Array.isArray(raw)) return [];
  const cards: ConfirmCard[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const id = typeof obj.id === "string" ? obj.id.trim() : "";
    const question = typeof obj.question === "string" ? obj.question.trim() : "";
    if (!id || !question) continue;
    cards.push({
      id,
      question,
      suggested_answer: typeof obj.suggested_answer === "string" ? obj.suggested_answer.trim() : "",
      optional: obj.optional === true,
    });
  }
  return cards.slice(0, 5);
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

    const outputText = response.output_text?.trim();
    if (!outputText) {
      throw new Error("AI returned empty output");
    }
    return JSON.parse(cleanJsonResponse(outputText));
  } catch (error) {
    if (error instanceof OpenAI.APIError && error.status === 429) {
      throw new ApiRouteError({
        status: 429,
        code: "LISTING_ANALYZE_FAILED",
        message: "AI rate limit exceeded",
        userMessage: "The AI service is busy. Please wait a moment and try again.",
        actions: ["Wait a minute and retry."],
        canRetry: true,
      });
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
    "- photo_review: { present_shots: string[], missing_shots: string[], advisories: string[] }",
    "  Shot types allowed: hero, detail, backstamp, scale, imperfections, group",
    "- suggested_identification: string (maker, pattern, item type, era if inferable; never invent unsupported details)",
    "- suggested_condition_code: one of Mint/Near Mint, Excellent, Very Good, Good, Fair/As-Is",
    "- price: { suggested_list_price, suggested_price_low, suggested_price_high, confidence (high|medium|low), rationale }",
    "- confirm_cards: array of up to 5 { id, question, suggested_answer, optional? }",
    "  Required ids: what_is_it, included, condition, buyer, special (special optional)",
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

  return {
    photo_review: normalizePhotoReview(parsed.photo_review),
    suggested_identification: identification,
    suggested_condition_code: normalizeConditionCode(parsed.suggested_condition_code),
    price: normalizePrice(parsed.price),
    confirm_cards: confirmCards,
  };
}

export async function composeListingCoach(params: {
  itemPhotos: CoachPhotoFile[];
  conditionPhotos: CoachPhotoFile[];
  googlePhotos: CoachPhotoFile[];
  confirmAnswers: ConfirmAnswer[];
  price: ComposePriceInput;
  identificationOverride?: string;
  suggestedConditionCode?: string;
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
    params.price.accept_offer_note
      ? `Accept-offer note: ${params.price.accept_offer_note}`
      : "",
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
  const scoreResult = computeListingScore({
    listing_title: parsed.listing_title.trim(),
    listing_description: parsed.listing_description.trim(),
    listing_tags: listingTags,
    condition_code: params.suggestedConditionCode ?? "Good",
    sale_revenue: params.price.sale_revenue ?? null,
    picture_1: pictureCount >= 1 ? "set" : null,
    picture_2: pictureCount >= 2 ? "set" : null,
    picture_3: pictureCount >= 3 ? "set" : null,
    picture_4: pictureCount >= 4 ? "set" : null,
    picture_5: pictureCount >= 5 ? "set" : null,
    picture_6: pictureCount >= 6 ? "set" : null,
    picture_7: pictureCount >= 7 ? "set" : null,
    picture_8: pictureCount >= 8 ? "set" : null,
    picture_9: pictureCount >= 9 ? "set" : null,
    picture_10: pictureCount >= 10 ? "set" : null,
  });

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
