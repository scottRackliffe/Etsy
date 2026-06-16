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

export type EvidenceSource = "photo" | "web_search" | "operator_input" | "unverified";

export type FieldEvidence = {
  value: string;
  evidence: EvidenceSource;
  confidence: "high" | "medium" | "low";
  source_detail?: string;
};

export type Citation = {
  claim: string;
  source: string;
  url?: string;
};

export type ComplianceCheck = {
  condition_accurately_disclosed: boolean;
  no_misleading_claims: boolean;
  vintage_categorization_correct: boolean;
  keywords_match_item: boolean;
  issues: string[];
};

export type ResearchAndComposeInput = {
  itemPhotos: CoachPhotoFile[];
  conditionPhotos: CoachPhotoFile[];
  googlePhotos: CoachPhotoFile[];
  googleText: string;
  datePurchased?: string;
  purchasePrice?: number;
  conditionCode?: string;
  conditionNotes?: string;
  description?: string;
  storeCategory?: string;
};

export type ResearchAndComposeResult = {
  photo_review: PhotoReview;
  suggested_identification: FieldEvidence;
  suggested_condition_code: string;
  price: PriceSuggestion;
  suggested_when_made?: FieldEvidence;
  suggested_taxonomy_id?: number;
  suggested_taxonomy_path?: string;
  suggested_materials?: FieldEvidence[];
  suggested_dimensions?: SuggestedDimensions;
  citations: Citation[];
  compliance_check: ComplianceCheck;
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
  quality_score: { score: number; hints: string[] };
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
      userMessage: "AI needs to be configured in Config before analyzing photos.",
      actions: [
        "Open Config → AI settings and add your API key.",
        "Use Test connection to verify.",
      ],
      canRetry: false,
    });
  }
  return config;
}

function getOpenAiClient(timeoutMs?: number): OpenAI {
  const config = requireAiConfigOrThrow();
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl ?? undefined,
    timeout: timeoutMs ?? Math.max(config.timeoutMs, 60000),
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

function buildImageContent(photos: CoachPhotoFile[], detail: "auto" | "high" = "auto"): Array<{
  type: "input_image";
  image_url: string;
  detail: "auto" | "high";
}> {
  return photos.map((photo) => ({
    type: "input_image" as const,
    image_url: bufferToDataUrl(photo.buffer, photo.filename),
    detail,
  }));
}

async function callAiJson(params: {
  system: string;
  userText: string;
  images: CoachPhotoFile[];
  webSearch?: boolean;
  highRes?: boolean;
  tokenBudget?: number;
  timeoutMs?: number;
}): Promise<unknown> {
  const config = requireAiConfigOrThrow();
  const openai = getOpenAiClient(params.timeoutMs);

  const detail = params.highRes ? "high" as const : "auto" as const;
  const content: Array<
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string; detail: "auto" | "high" }
  > = [{ type: "input_text", text: params.userText }, ...buildImageContent(params.images, detail)];

  const tools: Array<{ type: "web_search_preview" }> = params.webSearch
    ? [{ type: "web_search_preview" }]
    : [];

  const maxTokens = Math.max(params.tokenBudget ?? config.tokenBudget, 4000);

  const makeRequest = async (useTools: boolean) => {
    const requestTools = useTools ? tools : [];
    return openai.responses.create({
      model: config.model,
      max_output_tokens: maxTokens,
      temperature: 0.2,
      ...(requestTools.length > 0 ? { tools: requestTools } : {}),
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
  };

  try {
    let response;
    try {
      response = await makeRequest(tools.length > 0);
    } catch (firstError) {
      if (tools.length > 0 && firstError instanceof OpenAI.APIError && (firstError.status === 400 || firstError.status === 422)) {
        logApiCall("openai", "responses.create/listing-coach", firstError.status);
        response = await makeRequest(false);
      } else {
        throw firstError;
      }
    }
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
  googleText: string;
}): Promise<AnalyzeListingCoachResult> {
  const guidance = await loadListingGuidance();
  const allImages = [...params.itemPhotos, ...params.conditionPhotos, ...params.googlePhotos];

  const googleContext = [];
  if (params.googlePhotos.length > 0 || params.googleText) {
    googleContext.push("Google Visual Search results are provided for comparable listings/pricing:");
    if (params.googlePhotos.length > 0) {
      googleContext.push(`- ${params.googlePhotos.length} Google result screenshot(s) are included as images.`);
    }
    if (params.googleText) {
      googleContext.push("- Google result text (pasted by operator):");
      googleContext.push("--- START GOOGLE TEXT ---");
      googleContext.push(params.googleText.slice(0, 4000));
      googleContext.push("--- END GOOGLE TEXT ---");
    }
    googleContext.push("");
  }

  const userText = [
    "Analyze these item photos for an Etsy vintage/antique listing coach flow.",
    "Item photos are the product. Condition photos show flaws.",
    "",
    ...googleContext,
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
    "Use Google screenshots and/or Google text for price comps when present. State low confidence when unsure.",
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
  googleText: string;
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

  const googleContext = [];
  if (params.googlePhotos.length > 0 || params.googleText) {
    googleContext.push("Google Visual Search results provided:");
    if (params.googlePhotos.length > 0) {
      googleContext.push(`- ${params.googlePhotos.length} Google result screenshot(s) included as images.`);
    }
    if (params.googleText) {
      googleContext.push("- Google result text (pasted by operator):");
      googleContext.push("--- START GOOGLE TEXT ---");
      googleContext.push(params.googleText.slice(0, 4000));
      googleContext.push("--- END GOOGLE TEXT ---");
    }
    googleContext.push("");
  }

  const userText = [
    "Compose a complete Etsy listing from photos and operator confirmations.",
    "Return strict JSON only with keys:",
    "- listing_title, listing_description, listing_tags (comma-separated, up to 13 unique tags)",
    "- listing_category_path (optional string)",
    "- listing_title_strategy, listing_product_story, listing_condition_clarity, listing_attributes",
    "- listing_pricing_shipping_notes, listing_quality_checklist",
    "",
    ...googleContext,
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

const RESEARCH_SYSTEM_PROMPT = `You are a factual research assistant and Etsy listing writer for vintage and antique items.

ABSOLUTE RULES — NEVER VIOLATE:
1. NEVER GUESS. Every claim must be backed by evidence you can cite.
2. If you cannot identify a maker, pattern, era, or material with certainty, say "unknown" or omit the field. Do NOT invent plausible-sounding details.
3. For pricing, ONLY cite real comparable sales you find via web search. If no comparables are found, set confidence to "low" and explain why.
4. Every factual field must include an "evidence" tag: "photo" (you can see it), "web_search" (you found it online), "operator_input" (the seller told you), or "unverified" (you are not confident).
5. Every factual field must include a "confidence" level: "high", "medium", or "low".
6. Include a "citations" array listing each factual claim with its source and URL when available.
7. Run a compliance self-check before returning results.

EVIDENCE RULES:
- "photo" evidence: Only use when you can visibly read text, see a marking, or observe a physical characteristic in the uploaded photos.
- "web_search" evidence: Only use when your web search returned a matching result. Include the URL.
- "operator_input" evidence: Only use for information the seller provided (description, date purchased, purchase price, condition notes).
- "unverified" evidence: Use for anything you infer but cannot confirm. The seller will be asked to verify these fields.

WRITING VOICE — CRITICAL:
- Write ALL listing content (title, description, story) in the SELLER'S OWN VOICE — first person, warm, personal.
- The seller is Trudy, a passionate vintage collector. Write as if SHE is describing the item directly to the buyer.
- NEVER use third-person phrases like "seller states", "the seller reports", "according to the seller".
- NEVER use phrases like "please message me" — instead say "message me" or "feel free to ask".
- Use natural, friendly language: "I found this gorgeous piece at..." not "This item was acquired by the seller..."
- The tone should be knowledgeable, enthusiastic, and trustworthy — like a friend who knows antiques.

ETSY LISTING BEST PRACTICES:
- Title: Front-load the most important keywords. Include maker, item type, era, and distinguishing features. Max 140 characters.
- Description: Tell the item's story in the seller's voice. Lead with what it IS, then condition, then measurements, then shipping info.
- Tags: Up to 13 unique tags. Use multi-word phrases that buyers actually search for. No single generic words.
- Condition: Be brutally honest. Disclose every flaw. Buyers respect transparency and it reduces returns. But say "I noticed..." not "seller states..."
- Photos: Reference specific photos in the description (e.g., "as shown in photo 3").

Return strict JSON only.`;

function buildResearchUserText(
  params: ResearchAndComposeInput,
  guidance: ListingGuidance
): string {
  const operatorContext: string[] = [];
  if (params.description) {
    operatorContext.push(`Seller's description: "${params.description}"`);
  }
  if (params.datePurchased) {
    operatorContext.push(`Date purchased: ${params.datePurchased}`);
  }
  if (params.purchasePrice != null) {
    operatorContext.push(`Purchase price: $${params.purchasePrice}`);
  }
  if (params.conditionCode) {
    operatorContext.push(`Seller's condition assessment: ${params.conditionCode}`);
  }
  if (params.conditionNotes) {
    operatorContext.push(`Condition notes: "${params.conditionNotes}"`);
  }
  if (params.storeCategory) {
    operatorContext.push(`Store category: ${params.storeCategory}`);
  }

  const googleContext: string[] = [];
  if (params.googlePhotos.length > 0 || params.googleText) {
    googleContext.push("Seller-provided research (Google Visual Search or other):");
    if (params.googlePhotos.length > 0) {
      googleContext.push(`- ${params.googlePhotos.length} screenshot(s) included as images.`);
    }
    if (params.googleText) {
      googleContext.push("- Research text:");
      googleContext.push("--- START RESEARCH TEXT ---");
      googleContext.push(params.googleText.slice(0, 4000));
      googleContext.push("--- END RESEARCH TEXT ---");
    }
    googleContext.push("");
  }

  return [
    "TASK: Analyze these item photos and research this vintage/antique item deeply.",
    "Then compose a complete, world-class Etsy listing.",
    "",
    `Item photos: ${params.itemPhotos.length}`,
    `Condition photos: ${params.conditionPhotos.length}`,
    "",
    operatorContext.length > 0 ? "SELLER-PROVIDED INFORMATION:" : "",
    ...operatorContext,
    "",
    ...googleContext,
    "REQUIRED OUTPUT — strict JSON with these keys:",
    "",
    "1. photo_review: {",
    "     present_shots: string[] (shot types found: hero, angle, detail, backstamp, scale, imperfection, underside, grouping, lifestyle, measurement, extra),",
    "     missing_shots: string[] (recommended additional shots),",
    "     advisories: string[] (photo quality warnings),",
    "     classifications: Array<{ photo_index: number, type: string, confidence: number }>,",
    "     suggested_order: number[] (optimal sequence for listing display)",
    "   }",
    "",
    "2. suggested_identification: {",
    "     value: string (maker, pattern, item type, era — ONLY what you can confirm),",
    "     evidence: 'photo' | 'web_search' | 'operator_input' | 'unverified',",
    "     confidence: 'high' | 'medium' | 'low',",
    "     source_detail: string (what you saw or found that led to this identification)",
    "   }",
    "",
    "3. suggested_condition_code: one of 'Mint/Near Mint', 'Excellent', 'Very Good', 'Good', 'Fair/As-Is'",
    "",
    "4. price: {",
    "     suggested_list_price: number | null,",
    "     suggested_price_low: number | null,",
    "     suggested_price_high: number | null,",
    "     confidence: 'high' | 'medium' | 'low',",
    "     rationale: string (MUST cite specific comparable sales if confidence is medium or high)",
    "   }",
    "",
    "5. suggested_when_made: {",
    "     value: string (Etsy when_made enum: made_to_order, 2020_2026, 2010_2019, 2004_2009, 2000_2003, 1990s, 1980s, 1970s, 1960s, 1950s, 1940s, 1930s, 1920s, 1910s, 1900s, 1800s, 1700s, before_1700),",
    "     evidence: 'photo' | 'web_search' | 'operator_input' | 'unverified',",
    "     confidence: 'high' | 'medium' | 'low',",
    "     source_detail: string",
    "   } (omit entirely if unknown)",
    "",
    "6. suggested_taxonomy_id: number (Etsy taxonomy ID; omit if unsure)",
    "7. suggested_taxonomy_path: string (e.g. 'Home & Living > Kitchen & Dining > Dinnerware'; omit if unsure)",
    "8. suggested_materials: Array<{ value: string, evidence: string, confidence: string }> (omit if unsure)",
    "9. suggested_dimensions: { weight, weight_unit, length, width, height, dimensions_unit } (omit if cannot estimate from photos)",
    "",
    "10. citations: Array<{ claim: string, source: string, url?: string }>",
    "    List every factual claim and its evidence source. Include URLs for web search results.",
    "",
    "11. compliance_check: {",
    "      condition_accurately_disclosed: boolean,",
    "      no_misleading_claims: boolean,",
    "      vintage_categorization_correct: boolean,",
    "      keywords_match_item: boolean,",
    "      issues: string[]",
    "    }",
    "",
    "12. listing_title: string (max 140 chars, SEO-optimized)",
    "13. listing_description: string (complete Etsy description with story, condition, measurements)",
    "14. listing_tags: string (comma-separated, up to 13 unique multi-word tags)",
    "15. listing_category_path: string | null",
    "16. listing_title_strategy: string",
    "17. listing_product_story: string",
    "18. listing_condition_clarity: string",
    "19. listing_attributes: string",
    "20. listing_pricing_shipping_notes: string",
    "21. listing_quality_checklist: string",
    "",
    "USE WEB SEARCH to:",
    "- Identify the item from backstamps, markings, or visual characteristics",
    "- Find comparable sold listings for pricing",
    "- Verify maker, pattern name, and production era",
    "- Research current market demand and pricing trends",
    "",
    "If web search returns no results for a claim, mark it 'unverified' — NEVER fabricate a source.",
    "",
    buildGuidanceText(guidance),
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

function normalizeFieldEvidence(raw: unknown): FieldEvidence {
  if (!raw || typeof raw !== "object") {
    return { value: "", evidence: "unverified", confidence: "low" };
  }
  const obj = raw as Record<string, unknown>;
  const value = typeof obj.value === "string" ? obj.value.trim() : "";
  const evidence = (["photo", "web_search", "operator_input", "unverified"] as const).includes(
    obj.evidence as EvidenceSource
  )
    ? (obj.evidence as EvidenceSource)
    : "unverified";
  const confidence = (["high", "medium", "low"] as const).includes(
    obj.confidence as "high" | "medium" | "low"
  )
    ? (obj.confidence as "high" | "medium" | "low")
    : "low";
  const sourceDetail = typeof obj.source_detail === "string" ? obj.source_detail.trim() : undefined;
  return { value, evidence, confidence, source_detail: sourceDetail };
}

function normalizeCitations(raw: unknown): Citation[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => c != null && typeof c === "object")
    .map((c) => ({
      claim: typeof c.claim === "string" ? c.claim.trim() : "",
      source: typeof c.source === "string" ? c.source.trim() : "",
      url: typeof c.url === "string" && c.url.trim() ? c.url.trim() : undefined,
    }))
    .filter((c) => c.claim && c.source);
}

function normalizeComplianceCheck(raw: unknown): ComplianceCheck {
  const defaults: ComplianceCheck = {
    condition_accurately_disclosed: true,
    no_misleading_claims: true,
    vintage_categorization_correct: true,
    keywords_match_item: true,
    issues: [],
  };
  if (!raw || typeof raw !== "object") return defaults;
  const obj = raw as Record<string, unknown>;
  return {
    condition_accurately_disclosed: obj.condition_accurately_disclosed !== false,
    no_misleading_claims: obj.no_misleading_claims !== false,
    vintage_categorization_correct: obj.vintage_categorization_correct !== false,
    keywords_match_item: obj.keywords_match_item !== false,
    issues: Array.isArray(obj.issues)
      ? obj.issues.filter((i): i is string => typeof i === "string" && i.trim().length > 0)
      : [],
  };
}

export async function researchAndCompose(
  params: ResearchAndComposeInput
): Promise<ResearchAndComposeResult> {
  const guidance = await loadListingGuidance();
  const allImages = [
    ...params.itemPhotos,
    ...params.conditionPhotos,
    ...params.googlePhotos,
  ];

  const userText = buildResearchUserText(params, guidance);

  const parsed = (await callAiJson({
    system: RESEARCH_SYSTEM_PROMPT,
    userText,
    images: allImages,
    webSearch: true,
    highRes: true,
    tokenBudget: 8000,
    timeoutMs: 180_000,
  })) as Record<string, unknown>;

  const photoReview: PhotoReview = normalizePhotoReview(parsed.photo_review);
  const rawReview = parsed.photo_review as Record<string, unknown> | undefined;
  if (rawReview && Array.isArray(rawReview.classifications)) {
    photoReview.classifications = (rawReview.classifications as Array<Record<string, unknown>>)
      .filter((c) => typeof c.photo_index === "number" && typeof c.type === "string")
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

  const identification = normalizeFieldEvidence(parsed.suggested_identification);
  if (!identification.value) {
    identification.value = "Vintage item (identification pending)";
    identification.evidence = "unverified";
    identification.confidence = "low";
  }

  const citations = normalizeCitations(parsed.citations);
  const complianceCheck = normalizeComplianceCheck(parsed.compliance_check);

  const suggestedWhenMade = parsed.suggested_when_made
    ? normalizeFieldEvidence(parsed.suggested_when_made)
    : undefined;

  const suggestedMaterials: FieldEvidence[] = Array.isArray(parsed.suggested_materials)
    ? (parsed.suggested_materials as unknown[])
        .map((m) => normalizeFieldEvidence(m))
        .filter((m) => m.value.length > 0)
    : [];

  if (typeof parsed.listing_title !== "string" || !parsed.listing_title.trim()) {
    throw new Error("AI response missing listing_title");
  }
  if (typeof parsed.listing_description !== "string" || !parsed.listing_description.trim()) {
    throw new Error("AI response missing listing_description");
  }

  const listingTags = normalizeTags(parsed.listing_tags);
  const listingCategoryPath =
    typeof parsed.listing_category_path === "string" && parsed.listing_category_path.trim()
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
  const condCode = params.conditionCode ?? normalizeConditionCode(parsed.suggested_condition_code);
  const categoryPath = typeof parsed.listing_category_path === "string" ? parsed.listing_category_path.trim() : "";
  const scoreResult = computeListingScore(
    {
      listing_title: parsed.listing_title.trim(),
      listing_description: parsed.listing_description.trim(),
      listing_tags: listingTags,
      condition_code: condCode,
      sale_revenue: null,
      category_tags: categoryPath || params.storeCategory || null,
      item_number: "(pending)",
      ...pictureSlots,
    },
    minScoreVal
  );

  let suggestedDimensions: SuggestedDimensions | undefined;
  if (parsed.suggested_dimensions && typeof parsed.suggested_dimensions === "object") {
    const d = parsed.suggested_dimensions as Record<string, unknown>;
    suggestedDimensions = {};
    if (typeof d.weight === "number") suggestedDimensions.weight = d.weight;
    if (typeof d.weight_unit === "string") suggestedDimensions.weight_unit = d.weight_unit;
    if (typeof d.length === "number") suggestedDimensions.length = d.length;
    if (typeof d.width === "number") suggestedDimensions.width = d.width;
    if (typeof d.height === "number") suggestedDimensions.height = d.height;
    if (typeof d.dimensions_unit === "string") suggestedDimensions.dimensions_unit = d.dimensions_unit;
  }

  return {
    photo_review: photoReview,
    suggested_identification: identification,
    suggested_condition_code: normalizeConditionCode(parsed.suggested_condition_code),
    price: normalizePrice(parsed.price),
    suggested_when_made: suggestedWhenMade?.value ? suggestedWhenMade : undefined,
    suggested_taxonomy_id:
      typeof parsed.suggested_taxonomy_id === "number" && parsed.suggested_taxonomy_id > 0
        ? parsed.suggested_taxonomy_id
        : undefined,
    suggested_taxonomy_path:
      typeof parsed.suggested_taxonomy_path === "string" && parsed.suggested_taxonomy_path.trim()
        ? parsed.suggested_taxonomy_path.trim()
        : undefined,
    suggested_materials: suggestedMaterials.length > 0 ? suggestedMaterials : undefined,
    suggested_dimensions: suggestedDimensions,
    citations,
    compliance_check: complianceCheck,
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
    quality_score: { score: scoreResult.score, hints: scoreResult.tips },
  };
}

// ---------------------------------------------------------------------------
// Refine: per-field or global AI refinement
// ---------------------------------------------------------------------------

export type RefineListingInput = {
  mode: "field" | "global";
  fieldName?: string;
  currentValue?: string;
  instruction: string;
  context: {
    identification: string;
    listing_title: string;
    listing_description: string;
    listing_tags: string;
    listing_category_path: string | null;
    listing_condition_clarity: string;
    listing_product_story: string;
    listing_attributes: string;
    listing_pricing_shipping_notes: string;
    listing_title_strategy: string;
    listing_quality_checklist: string;
    condition_code: string;
    condition_notes: string;
    materials: string;
    sale_price: number | null;
  };
};

export type RefineListingResult = {
  fields: Record<string, string>;
};

const REFINE_FIELD_PROMPT = `You are an Etsy listing editor for vintage/antique items.
The seller wants to improve a SPECIFIC FIELD of their listing.

RULES:
1. ONLY return the corrected value for the requested field.
2. Follow all Etsy listing best practices.
3. Write in the seller's first-person voice (warm, knowledgeable, personal — the seller is Trudy, a passionate vintage collector).
4. NEVER guess facts. If the instruction asks for something you cannot verify, say so.
5. Return ONLY valid JSON: { "fields": { "<field_name>": "<new_value>" } }`;

const REFINE_GLOBAL_PROMPT = `You are an Etsy listing editor for vintage/antique items.
The seller has reviewed the AI-generated listing and wants improvements.

RULES:
1. Read the seller's feedback carefully.
2. Only change fields that are directly affected by the feedback. Leave everything else unchanged.
3. Write in the seller's first-person voice (warm, knowledgeable, personal — the seller is Trudy, a passionate vintage collector).
4. NEVER guess facts. If the feedback asks for something you cannot verify, say so.
5. Follow all Etsy listing best practices.
6. Return ONLY valid JSON: { "fields": { "<field_name>": "<new_value>", ... } }
   Only include fields you actually changed. Valid field names:
   listing_title, listing_description, listing_tags, listing_category_path,
   listing_title_strategy, listing_product_story, listing_condition_clarity,
   listing_attributes, listing_pricing_shipping_notes, listing_quality_checklist,
   condition_notes, identification, sale_price`;

export async function refineListing(
  input: RefineListingInput
): Promise<RefineListingResult> {
  const isField = input.mode === "field" && input.fieldName;

  const systemPrompt = isField ? REFINE_FIELD_PROMPT : REFINE_GLOBAL_PROMPT;

  const contextLines = [
    `Current listing context:`,
    `- Identification: ${input.context.identification}`,
    `- Condition: ${input.context.condition_code}`,
    `- Condition notes: ${input.context.condition_notes}`,
    `- Materials: ${input.context.materials}`,
    `- Sale price: ${input.context.sale_price ?? "not set"}`,
    `- Title: ${input.context.listing_title}`,
    `- Tags: ${input.context.listing_tags}`,
    `- Category: ${input.context.listing_category_path ?? "not set"}`,
    `- Description (first 500 chars): ${input.context.listing_description.slice(0, 500)}`,
  ];

  let userText: string;
  if (isField) {
    userText = [
      ...contextLines,
      "",
      `FIELD TO FIX: ${input.fieldName}`,
      `CURRENT VALUE: ${input.currentValue ?? ""}`,
      `SELLER'S INSTRUCTION: ${input.instruction}`,
      "",
      `Return JSON: { "fields": { "${input.fieldName}": "<corrected value>" } }`,
    ].join("\n");
  } else {
    userText = [
      ...contextLines,
      `- Title strategy: ${input.context.listing_title_strategy}`,
      `- Product story: ${input.context.listing_product_story}`,
      `- Condition clarity: ${input.context.listing_condition_clarity}`,
      `- Attributes: ${input.context.listing_attributes}`,
      `- Pricing/shipping notes: ${input.context.listing_pricing_shipping_notes}`,
      `- Quality checklist: ${input.context.listing_quality_checklist}`,
      "",
      `SELLER'S FEEDBACK: ${input.instruction}`,
      "",
      `Return JSON with ONLY the fields you changed.`,
    ].join("\n");
  }

  const parsed = (await callAiJson({
    system: systemPrompt,
    userText,
    images: [],
    webSearch: false,
    tokenBudget: 4000,
    timeoutMs: 60_000,
  })) as Record<string, unknown>;

  const fields: Record<string, string> = {};
  if (parsed.fields && typeof parsed.fields === "object") {
    for (const [k, v] of Object.entries(parsed.fields as Record<string, unknown>)) {
      if (typeof v === "string") {
        fields[k] = v;
      } else if (typeof v === "number") {
        fields[k] = String(v);
      }
    }
  }

  return { fields };
}
