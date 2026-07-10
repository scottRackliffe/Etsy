/**
 * Neutral AI engine for listing research, authoring, and refinement.
 * The single AI listing engine (ADR-085).
 *
 * Qualifier naming per ADR-075:
 *   generate path  → responses.create/generate-listing
 *   refine path    → responses.create/listing-refine
 */
import OpenAI from "openai";
import type { ReasoningEffort } from "openai/resources/shared";
import sharp from "sharp";
import { ApiRouteError } from "@/lib/api-error";
import { getAiConfig } from "@/lib/ai-config";
import { logApiCall } from "@/lib/api-usage";
import { loadListingGuidance, type ListingGuidance } from "@/lib/listing-guidance";
import { computeRubricFastScore, type InventoryRowLike } from "@/lib/listing-rubric";
import { getMinQualityScore, getSetting } from "@/lib/settings-store";
import {
  cleanJsonResponse,
  normalizeConditionCode,
  normalizePhotoReview,
  normalizePrice,
  normalizeTags,
} from "@/lib/listing-ai-normalize.mjs";

export type CoachPhotoFile = {
  buffer: Buffer;
  filename: string;
};

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

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

export type SuggestedDimensions = {
  weight?: number;
  weight_unit?: string;
  length?: number;
  width?: number;
  height?: number;
  dimensions_unit?: string;
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

export type RefineListingInput = {
  mode: "field" | "global";
  fieldName?: string;
  currentValue?: string;
  instruction: string;
  /** Optional model override (escalated tier for the "Advance AI" remediation cycle). */
  model?: string;
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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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
      userMessage: "AI needs to be configured in Settings before generating listings.",
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

function bufferToDataUrl(buffer: Buffer, filename: string): string {
  const ext = filename.includes(".")
    ? filename.slice(filename.lastIndexOf(".")).toLowerCase()
    : ".jpg";
  const mimeType = IMAGE_MIME_BY_EXT[ext] ?? "image/jpeg";
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
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

function clipForPrompt(content: string, maxChars = 25000): string {
  if (content.length <= maxChars) return content;
  return `${content.slice(0, maxChars)}\n\n[truncated for prompt length]`;
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

/**
 * Core AI JSON caller used by all generate/refine paths.
 * Pass a `qualifier` to select the ADR-075 log tag for the call.
 */
export async function callAiJson(params: {
  system: string;
  userText: string;
  images: CoachPhotoFile[];
  webSearch?: boolean;
  highRes?: boolean;
  tokenBudget?: number;
  timeoutMs?: number;
  qualifier: string;
  /** Override the model (e.g. an escalated/premium tier for "Advance AI"). Defaults to config.model. */
  model?: string;
  /**
   * Reasoning effort for reasoning-class models (WS-CR7).
   * When set, passed as `reasoning: { effort }` and `temperature` is omitted.
   * SDK type: ReasoningEffort — 'none'|'minimal'|'low'|'medium'|'high'|'xhigh'
   */
  reasoningEffort?: ReasoningEffort;
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
  const qualifier = params.qualifier;
  const reasoningEffort: ReasoningEffort = params.reasoningEffort ?? null;

  /**
   * Build the request body. When `withTemperature` is false, omit `temperature`
   * entirely (required for reasoning-class models that reject the parameter).
   * When a reasoning effort is specified, include it as `reasoning: { effort }`.
   */
  const makeRequest = async (useTools: boolean, withTemperature: boolean) => {
    const requestTools = useTools ? tools : [];
    return openai.responses.create({
      model: params.model ?? config.model,
      max_output_tokens: maxTokens,
      ...(withTemperature ? { temperature: 0.2 } : {}),
      ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
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

  /**
   * Returns true when the error is the specific "temperature not supported"
   * 400 that reasoning models return (WS-CR7).
   */
  function isTemperatureUnsupportedError(err: unknown): boolean {
    if (!(err instanceof OpenAI.APIError) || err.status !== 400) return false;
    const msg = (typeof err.message === "string" ? err.message : "").toLowerCase();
    return msg.includes("temperature") && msg.includes("unsupported");
  }

  try {
    let response;
    // Start with temperature unless caller explicitly passes a reasoning effort
    // (in which case we already know to omit it).
    let useTemperature = !reasoningEffort;
    try {
      response = await makeRequest(tools.length > 0, useTemperature);
    } catch (firstError) {
      if (isTemperatureUnsupportedError(firstError)) {
        // Reasoning model rejected temperature — retry without it.
        logApiCall("openai", qualifier, 400);
        useTemperature = false;
        try {
          response = await makeRequest(tools.length > 0, useTemperature);
        } catch (secondError) {
          // Tools may also be unsupported on this model — try without both.
          if (
            tools.length > 0 &&
            secondError instanceof OpenAI.APIError &&
            (secondError.status === 400 || secondError.status === 422)
          ) {
            logApiCall("openai", qualifier, secondError.status);
            response = await makeRequest(false, useTemperature);
          } else {
            throw secondError;
          }
        }
      } else if (
        tools.length > 0 &&
        firstError instanceof OpenAI.APIError &&
        (firstError.status === 400 || firstError.status === 422)
      ) {
        // Pre-existing: tools not supported — retry without tools.
        logApiCall("openai", qualifier, firstError.status);
        response = await makeRequest(false, useTemperature);
      } else {
        throw firstError;
      }
    }
    logApiCall("openai", qualifier, 200);

    const outputText = response.output_text?.trim();
    if (!outputText) {
      throw new Error("AI returned empty output");
    }
    return JSON.parse(cleanJsonResponse(outputText));
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      logApiCall("openai", qualifier, error.status ?? 500);
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

// ---------------------------------------------------------------------------
// Research + compose helpers
// ---------------------------------------------------------------------------

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
  const sourceDetail =
    typeof obj.source_detail === "string" ? obj.source_detail.trim() : undefined;
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

// ---------------------------------------------------------------------------
// researchAndCompose — core Generate engine (ADR-085 §3)
// ---------------------------------------------------------------------------

/**
 * Maximum number of item photos sent to the AI for generate.
 * Keeps the payload bounded so the call stays fast + cheap (WS-CR12).
 * The most diagnostically valuable shots are the first N in the ordered set.
 */
const GENERATE_MAX_ITEM_PHOTOS = 6;

/**
 * Target long-edge in pixels when downscaling item photos before sending to AI.
 * The AI doesn't need full-res; 1024px is more than enough for vision tasks.
 */
const GENERATE_AI_MAX_DIMENSION = 1024;

/**
 * Downscale a photo buffer to at most GENERATE_AI_MAX_DIMENSION on its long edge,
 * returning the resized JPEG buffer. Falls back to the original if resize fails.
 */
async function downscaleForAi(photo: CoachPhotoFile): Promise<CoachPhotoFile> {
  try {
    const resized = await sharp(photo.buffer)
      .rotate()
      .resize({
        width: GENERATE_AI_MAX_DIMENSION,
        height: GENERATE_AI_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toBuffer();
    return { buffer: resized, filename: photo.filename };
  } catch {
    return photo;
  }
}

export async function researchAndCompose(
  params: ResearchAndComposeInput
): Promise<ResearchAndComposeResult> {
  const guidance = await loadListingGuidance();

  // Cap item photos and downscale before sending to AI (WS-CR12).
  const cappedItemPhotos = params.itemPhotos.slice(0, GENERATE_MAX_ITEM_PHOTOS);
  const [scaledItemPhotos, scaledConditionPhotos, scaledGooglePhotos] = await Promise.all([
    Promise.all(cappedItemPhotos.map(downscaleForAi)),
    Promise.all(params.conditionPhotos.map(downscaleForAi)),
    Promise.all(params.googlePhotos.map(downscaleForAi)),
  ]);

  const allImages = [
    ...scaledItemPhotos,
    ...scaledConditionPhotos,
    ...scaledGooglePhotos,
  ];

  const userText = buildResearchUserText(
    { ...params, itemPhotos: cappedItemPhotos },
    guidance
  );

  // Use premium reasoning effort when configured (WS-CR7).
  const rawEffort = (getSetting("ai.premium_reasoning_effort") ?? "").trim();
  const VALID_EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh"] as const;
  type ValidEffort = (typeof VALID_EFFORTS)[number];
  const reasoningEffort: ReasoningEffort | undefined =
    rawEffort && (VALID_EFFORTS as readonly string[]).includes(rawEffort)
      ? (rawEffort as ValidEffort)
      : undefined;

  const parsed = (await callAiJson({
    system: RESEARCH_SYSTEM_PROMPT,
    userText,
    images: allImages,
    webSearch: true,
    highRes: false,
    tokenBudget: 8000,
    timeoutMs: 180_000,
    qualifier: "responses.create/generate-listing",
    reasoningEffort,
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
  const minScoreVal = getMinQualityScore();
  const condCode = params.conditionCode ?? normalizeConditionCode(parsed.suggested_condition_code);
  const categoryPath =
    typeof parsed.listing_category_path === "string" ? parsed.listing_category_path.trim() : "";
  const syntheticItem = {
    id: 0,
    listing_quality_json: null,
    listing_title: parsed.listing_title.trim(),
    listing_description: parsed.listing_description.trim(),
    listing_tags: listingTags,
    condition_code: condCode,
    sale_revenue: null,
    category_tags: categoryPath || params.storeCategory || null,
    item_number: "(pending)",
    ...pictureSlots,
  };
  const scoreResult = computeRubricFastScore(syntheticItem as unknown as InventoryRowLike);

  let suggestedDimensions: SuggestedDimensions | undefined;
  if (parsed.suggested_dimensions && typeof parsed.suggested_dimensions === "object") {
    const d = parsed.suggested_dimensions as Record<string, unknown>;
    suggestedDimensions = {};
    if (typeof d.weight === "number") suggestedDimensions.weight = d.weight;
    if (typeof d.weight_unit === "string") suggestedDimensions.weight_unit = d.weight_unit;
    if (typeof d.length === "number") suggestedDimensions.length = d.length;
    if (typeof d.width === "number") suggestedDimensions.width = d.width;
    if (typeof d.height === "number") suggestedDimensions.height = d.height;
    if (typeof d.dimensions_unit === "string")
      suggestedDimensions.dimensions_unit = d.dimensions_unit;
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
    quality_score: { score: scoreResult.score, hints: [] as string[] },
  };
}

// ---------------------------------------------------------------------------
// refineListing — per-field or global AI refinement (ADR-085, WS-L1)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// suggestListingAttributes — focused attribute repair (ADR-082/085)
// ---------------------------------------------------------------------------

/** Valid Etsy `when_made` enum values (ADR-017 §1a). */
export const WHEN_MADE_VALUES = [
  "made_to_order", "2020_2026", "2010_2019", "2004_2009", "2000_2003",
  "1990s", "1980s", "1970s", "1960s", "1950s", "1940s", "1930s",
  "1920s", "1910s", "1900s", "1800s", "1700s", "before_1700",
] as const;

export type AttributeSuggestion = {
  when_made?: string;
  taxonomy_id?: number;
  taxonomy_path?: string;
  materials?: string[];
  dimensions?: SuggestedDimensions;
};

const ATTRIBUTE_SYSTEM_PROMPT = `You identify structured Etsy listing attributes for vintage/antique items from photos and a text identification.
Return STRICT JSON only. Never guess — omit any field you cannot determine with reasonable confidence.
You are filling in MISSING metadata for an existing listing; do NOT rewrite the title, description, or tags.`;

/**
 * Ask the AI for the missing structured attributes only (era, category, materials,
 * dimensions). Focused + cheap: no listing text is produced. Returns validated,
 * normalized suggestions; callers must still validate taxonomy against the cache.
 */
export async function suggestListingAttributes(params: {
  itemPhotos: CoachPhotoFile[];
  identification: string;
  description?: string;
  conditionCode?: string;
  storeCategory?: string;
  needWhenMade: boolean;
  needTaxonomy: boolean;
  needMaterials: boolean;
  needDimensions: boolean;
  model?: string;
}): Promise<AttributeSuggestion> {
  const cappedPhotos = params.itemPhotos.slice(0, 4);
  const scaled = await Promise.all(cappedPhotos.map(downscaleForAi));

  const wants: string[] = [];
  if (params.needWhenMade) {
    wants.push(
      `- when_made: one of ${WHEN_MADE_VALUES.join(", ")} (the era the item was made)`
    );
  }
  if (params.needTaxonomy) {
    wants.push(
      "- taxonomy_path: the most-specific Etsy category path (e.g. 'Home & Living > Home Décor > Candles & Holders > Candle Holders')",
      "- taxonomy_id: the numeric Etsy taxonomy id if you are confident (else omit)"
    );
  }
  if (params.needMaterials) {
    wants.push("- materials: array of 1-4 specific material strings (e.g. ['crystal','brass'])");
  }
  if (params.needDimensions) {
    wants.push(
      "- dimensions: { length, width, height, dimensions_unit (in|cm|mm|ft|m), weight, weight_unit (oz|lb|g|kg) } — you MUST provide ALL THREE of length, width, and height (estimate reasonable values from the item type and photos even if unsure, so shipping can be calculated), plus weight"
    );
  }

  const userText = [
    "TASK: Determine ONLY the following missing attributes for this item. Omit anything uncertain.",
    "",
    `Identification: ${params.identification || "(unknown)"}`,
    params.description ? `Seller description: ${params.description.slice(0, 600)}` : "",
    params.conditionCode ? `Condition: ${params.conditionCode}` : "",
    params.storeCategory ? `Store category: ${params.storeCategory}` : "",
    "",
    "Return strict JSON with only these keys (omit any you cannot determine):",
    ...wants,
  ]
    .filter(Boolean)
    .join("\n");

  let parsed: Record<string, unknown> = {};
  try {
    parsed = (await callAiJson({
      system: ATTRIBUTE_SYSTEM_PROMPT,
      userText,
      images: scaled,
      webSearch: params.needTaxonomy || params.needWhenMade,
      highRes: false,
      tokenBudget: 2000,
      timeoutMs: 90_000,
      qualifier: "responses.create/listing-attributes",
      model: params.model,
    })) as Record<string, unknown>;
  } catch {
    return {};
  }

  const out: AttributeSuggestion = {};

  const wm = typeof parsed.when_made === "string" ? parsed.when_made.trim() : "";
  if (params.needWhenMade && (WHEN_MADE_VALUES as readonly string[]).includes(wm)) {
    out.when_made = wm;
  }

  if (params.needTaxonomy) {
    if (typeof parsed.taxonomy_id === "number" && parsed.taxonomy_id > 0) {
      out.taxonomy_id = Math.round(parsed.taxonomy_id);
    }
    if (typeof parsed.taxonomy_path === "string" && parsed.taxonomy_path.trim()) {
      out.taxonomy_path = parsed.taxonomy_path.trim();
    }
  }

  if (params.needMaterials && Array.isArray(parsed.materials)) {
    const mats = (parsed.materials as unknown[])
      .filter((m): m is string => typeof m === "string" && m.trim().length > 0)
      .map((m) => m.trim())
      .slice(0, 4);
    if (mats.length > 0) out.materials = mats;
  }

  if (params.needDimensions && parsed.dimensions && typeof parsed.dimensions === "object") {
    const d = parsed.dimensions as Record<string, unknown>;
    const dims: SuggestedDimensions = {};
    if (typeof d.length === "number" && d.length > 0) dims.length = d.length;
    if (typeof d.width === "number" && d.width > 0) dims.width = d.width;
    if (typeof d.height === "number" && d.height > 0) dims.height = d.height;
    if (typeof d.dimensions_unit === "string") dims.dimensions_unit = d.dimensions_unit.trim();
    if (typeof d.weight === "number" && d.weight > 0) dims.weight = d.weight;
    if (typeof d.weight_unit === "string") dims.weight_unit = d.weight_unit.trim();
    if (Object.keys(dims).length > 0) out.dimensions = dims;
  }

  return out;
}

export async function refineListing(input: RefineListingInput): Promise<RefineListingResult> {
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
    `- Description (current full text): ${input.context.listing_description.slice(0, 2500)}`,
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
    qualifier: "responses.create/listing-refine",
    model: input.model,
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
