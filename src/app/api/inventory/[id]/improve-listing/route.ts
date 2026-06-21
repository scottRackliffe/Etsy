/**
 * POST /api/inventory/[id]/improve-listing
 * Uses AI to improve listing fields that are scoring low.
 * Receives the current breakdown and returns improved content for weak areas.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import OpenAI from "openai";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { logActivity } from "@/lib/activity-log";
import { logApiCall } from "@/lib/api-usage";
import { getInventoryById } from "@/lib/inventory";
import { getDb } from "@/lib/sqlite";
import { getAiConfig } from "@/lib/ai-config";
import { computeListingScore } from "@/lib/listing-score";
import { getMinQualityScore } from "@/lib/settings-store";
import { logger } from "@/lib/logging";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const id = parsePositiveInt((await context.params).id);
    if (!id) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid inventory id",
        userMessage: "Inventory id must be a positive integer.",
        actions: ["Check the URL and retry."],
        canRetry: false,
      });
    }

    const item = getInventoryById(id);
    if (!item) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Inventory item not found",
        userMessage: "The selected inventory item was not found.",
        actions: ["Refresh and retry."],
        canRetry: false,
      });
    }

    const config = getAiConfig();
    if (!config) {
      throw new ApiRouteError({
        status: 400,
        code: "AI_NOT_CONFIGURED",
        message: "AI configuration missing",
        userMessage: "AI is not configured. Set your API key in Settings → AI Settings.",
        actions: ["Go to Settings and enter your OpenAI API key."],
        canRetry: false,
      });
    }

    const missing: string[] = [];
    if (!item.description?.trim()) missing.push("Item description — the AI needs to know what this item is");
    if (!item.condition_code?.trim()) missing.push("Condition code — needed for condition clarity and description");
    if (!item.condition_notes?.trim()) missing.push("Condition notes — needed to accurately describe wear, flaws, or quality");
    if (!item.sale_revenue && item.sale_revenue !== 0) missing.push("Sale price — needed for pricing and shipping notes");
    const hasPicture = Array.from({ length: 10 }, (_, i) => (item as Record<string, unknown>)[`picture_${i + 1}`])
      .some((v) => typeof v === "string" && v.trim().length > 0);
    if (!hasPicture) missing.push("At least one photo — needed so the quality checklist can reference photo count");

    if (missing.length > 0) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Item is missing required data for AI improvement",
        userMessage: `The AI needs this information to accurately fill in all listing fields:\n\n${missing.map((m) => `• ${m}`).join("\n")}`,
        actions: ["Fill in the missing fields in the detail panel, then try again."],
        canRetry: false,
      });
    }

    const minScore = getMinQualityScore();
    const scoreResult = computeListingScore(item, minScore);
    const { breakdown, tips } = scoreResult;

    const weakAreas: string[] = [];
    if (breakdown.title_length < 15) weakAreas.push("title is too short or missing — aim for 60–140 characters");
    if (breakdown.title_keywords < 10) weakAreas.push("title should include a category keyword from the item's tags");
    if (breakdown.description_length < 15) weakAreas.push("description should be at least 500 characters with rich detail");
    if (breakdown.tags_filled < 10) weakAreas.push("need more search tags — aim for exactly 13 unique tags");
    if (breakdown.description_dimensions < 5) weakAreas.push("description should include measurements/dimensions");
    if (breakdown.description_materials < 5) weakAreas.push("description should mention materials (e.g. ceramic, glass, wood)");

    const emptyAuthoring: string[] = [];
    if (!item.category_tags?.trim()) emptyAuthoring.push("category_tags: comma-separated category keywords for this item");
    if (!item.listing_title_strategy?.trim()) emptyAuthoring.push("listing_title_strategy: explain the approach used for the title — what keywords and why");
    if (!item.listing_product_story?.trim()) emptyAuthoring.push("listing_product_story: the story/history of this item — era, origin, what makes it special");
    if (!item.listing_condition_clarity?.trim()) emptyAuthoring.push("listing_condition_clarity: detailed description of condition, flaws, wear patterns");
    if (!item.listing_attributes?.trim()) emptyAuthoring.push("listing_attributes: key attributes like dimensions, weight, materials, color, style");
    if (!item.listing_pricing_shipping_notes?.trim()) emptyAuthoring.push("listing_pricing_shipping_notes: notes about pricing rationale and shipping considerations");
    if (!item.listing_quality_checklist?.trim()) emptyAuthoring.push("listing_quality_checklist: a final review checklist — mark items you CAN verify from the data (description accuracy, tags, category) and flag items that NEED SELLER REVIEW (photos, pricing, measurements)");
    if (!item.listing_category_path?.trim()) emptyAuthoring.push("listing_category_path: the Etsy category breadcrumb path for this item (e.g. 'Home & Living > Home Décor > Vases')");

    const emptyEtsyMeta: string[] = [];
    if (!item.etsy_when_made?.trim()) emptyEtsyMeta.push("etsy_when_made: the era this item was made. MUST be one of these exact values: made_to_order, 2020_2026, 2010_2019, 2004_2009, 2000_2003, 1990s, 1980s, 1970s, 1960s, 1950s, 1940s, 1930s, 1920s, 1910s. Pick the most likely decade based on the item description.");
    if (!item.materials?.trim() || item.materials === "[]") emptyEtsyMeta.push("materials: a JSON array of material strings, e.g. [\"cast iron\", \"paint\"]. Only include materials you can reasonably infer from the item description.");
    if (!item.etsy_taxonomy_id) emptyEtsyMeta.push("etsy_taxonomy_id: the Etsy taxonomy category ID number. For common vintage items: 562 (Home Décor), 1074 (Collectibles), 172 (Art & Collectibles). Pick the best fit.");

    if (weakAreas.length === 0 && emptyAuthoring.length === 0 && emptyEtsyMeta.length === 0) {
      return NextResponse.json({
        ok: true,
        improved: false,
        message: "All fields are already filled — score is strong.",
        score: scoreResult.score,
      });
    }

    const openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl ?? undefined,
      timeout: config.timeoutMs,
      maxRetries: config.retryCount,
    });

    const currentContent = {
      listing_title: item.listing_title ?? "",
      listing_description: item.listing_description ?? "",
      listing_tags: item.listing_tags ?? "",
      category_tags: item.category_tags ?? "",
      listing_title_strategy: item.listing_title_strategy ?? "",
      listing_product_story: item.listing_product_story ?? "",
      listing_condition_clarity: item.listing_condition_clarity ?? "",
      listing_attributes: item.listing_attributes ?? "",
      listing_pricing_shipping_notes: item.listing_pricing_shipping_notes ?? "",
      listing_quality_checklist: item.listing_quality_checklist ?? "",
      listing_category_path: item.listing_category_path ?? "",
      etsy_when_made: item.etsy_when_made ?? "",
      etsy_taxonomy_id: item.etsy_taxonomy_id ?? "",
      materials: item.materials ?? "",
      item_description: item.description ?? "",
      condition_code: item.condition_code ?? "",
      condition_notes: item.condition_notes ?? "",
      sale_revenue: item.sale_revenue,
    };

    const promptParts = [
      "You are improving an existing Etsy vintage/antique listing to achieve a higher quality score.",
    ];

    if (weakAreas.length > 0) {
      promptParts.push("", "The listing has the following weak areas that need improvement:");
      weakAreas.forEach((a, i) => promptParts.push(`${i + 1}. ${a}`));
    }

    if (emptyAuthoring.length > 0) {
      promptParts.push("", "The following content fields are empty and should be filled in:");
      emptyAuthoring.forEach((a, i) => promptParts.push(`${i + 1}. ${a}`));
    }

    if (emptyEtsyMeta.length > 0) {
      promptParts.push("", "The following Etsy metadata fields are empty — infer from the item description:");
      emptyEtsyMeta.forEach((a, i) => promptParts.push(`${i + 1}. ${a}`));
    }

    promptParts.push(
      "",
      "Current listing content:",
      JSON.stringify(currentContent, null, 2),
      "",
      "CRITICAL — What you DO and DO NOT have access to:",
      "- You have NOT been shown any photos. Do NOT claim photos are clear, high-quality, or comment on them at all.",
      "- You have NO access to market data. Do NOT claim pricing is competitive, fair, or appropriate.",
      "- You CAN ONLY comment on text content you can actually see in the data above.",
      "- If a field like condition_notes or item_description is empty, say so — do not invent details.",
      "",
      "Rules:",
      "- Return ONLY a JSON object with the fields you improved or filled in.",
      "- Possible fields: listing_title, listing_description, listing_tags, category_tags, listing_category_path, listing_title_strategy, listing_product_story, listing_condition_clarity, listing_attributes, listing_pricing_shipping_notes, listing_quality_checklist, etsy_when_made, etsy_taxonomy_id, materials.",
      "- Only include fields you actually changed or created — omit unchanged fields.",
      "- NEVER fabricate facts, dimensions, materials, or details not present in the data.",
      "- For listing_tags: comma-separated string, up to 13 unique tags, each ≤20 chars.",
      "- For listing_title: 60–140 characters, include relevant keywords.",
      "- For listing_description: 500+ characters. Only mention dimensions/materials if they appear in the item data. If unknown, suggest the seller add them.",
      "- For category_tags: comma-separated keywords describing what this item is (e.g. 'vintage, ceramic, vase, pottery').",
      "- For listing_category_path: Etsy breadcrumb path (e.g. 'Home & Living > Home Décor > Vases').",
      "- For listing_condition_clarity: only describe condition details found in condition_code and condition_notes. If those are empty, state that condition details need to be added by the seller.",
      "- For listing_attributes: only list attributes that can be inferred from the data. Flag unknown attributes as 'needs measurement' or 'needs seller input'.",
      "- For listing_pricing_shipping_notes: note the listed price if sale_revenue is provided, but do NOT judge whether it is competitive. Mention shipping considerations based on item type.",
      "- For listing_quality_checklist: create a checklist based ONLY on what you can verify from the data. Mark photo review and pricing review as 'Needs seller verification' since you cannot see photos or market data.",
      "- For etsy_when_made: MUST be one of these exact strings: made_to_order, 2020_2026, 2010_2019, 2004_2009, 2000_2003, 1990s, 1980s, 1970s, 1960s, 1950s, 1940s, 1930s, 1920s, 1910s. Infer from the item description.",
      "- For materials: return a JSON array of strings, e.g. [\"cast iron\", \"paint\"]. Only include materials evident from the description.",
      "- For etsy_taxonomy_id: return a number. Common IDs: 562 (Home Décor), 1074 (Collectibles), 172 (Art & Collectibles), 1058 (Kitchen & Dining), 891 (Figurines). Pick the best match.",
      "- For other authoring fields (title_strategy, product_story): write 1–3 helpful sentences based only on available data.",
      "- Maintain the item's authentic vintage/antique character.",
    );

    const prompt = promptParts.join("\n");

    let response;
    try {
      response = await openai.responses.create({
        model: config.model,
        max_output_tokens: config.tokenBudget,
        temperature: 0.3,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: "You are an Etsy listing improvement assistant. Return strict JSON only." }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: prompt }],
          },
        ],
      });
      logApiCall("openai", "responses.create/improve-listing", 200);
    } catch (aiErr) {
      const status = aiErr instanceof OpenAI.APIError ? (aiErr.status ?? 500) : 500;
      logApiCall("openai", "responses.create/improve-listing", status);
      throw aiErr;
    }

    const outputText = response.output_text?.trim();
    if (!outputText) {
      throw new ApiRouteError({
        status: 502,
        code: "LISTING_IMPROVEMENT_FAILED",
        message: "AI returned empty output",
        userMessage: "The AI returned an empty response. This usually means the model is overloaded. Try again in a few seconds.",
        actions: ["Wait a few seconds and try again."],
        canRetry: true,
      });
    }

    const cleaned = outputText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      logger.warn("AI returned non-JSON output", { outputText: cleaned.slice(0, 500) });
      throw new ApiRouteError({
        status: 502,
        code: "LISTING_IMPROVEMENT_FAILED",
        message: "AI returned invalid JSON",
        userMessage: `The AI returned text we couldn't process. This happens occasionally — try again and it usually works on the second attempt.`,
        actions: ["Try again."],
        canRetry: true,
      });
    }

    const updates: Record<string, string> = {};
    const textFields = [
      "listing_title",
      "listing_description",
      "category_tags",
      "listing_title_strategy",
      "listing_product_story",
      "listing_condition_clarity",
      "listing_attributes",
      "listing_pricing_shipping_notes",
      "listing_quality_checklist",
      "listing_category_path",
    ] as const;
    for (const field of textFields) {
      if (typeof parsed[field] === "string" && parsed[field].trim()) {
        updates[field] = parsed[field].trim();
      }
    }
    const validWhenMade = new Set([
      "made_to_order", "2020_2026", "2010_2019", "2004_2009", "2000_2003",
      "1990s", "1980s", "1970s", "1960s", "1950s", "1940s", "1930s", "1920s", "1910s",
    ]);
    if (typeof parsed.etsy_when_made === "string" && validWhenMade.has(parsed.etsy_when_made.trim())) {
      updates.etsy_when_made = parsed.etsy_when_made.trim();
    }

    if (parsed.materials) {
      const mats = Array.isArray(parsed.materials) ? parsed.materials : null;
      if (mats && mats.length > 0 && mats.every((m) => typeof m === "string")) {
        updates.materials = JSON.stringify(mats.map((m: string) => m.trim()));
      }
    }

    if (parsed.etsy_taxonomy_id != null) {
      const taxId = typeof parsed.etsy_taxonomy_id === "number"
        ? parsed.etsy_taxonomy_id
        : parseInt(String(parsed.etsy_taxonomy_id), 10);
      if (Number.isFinite(taxId) && taxId > 0) {
        updates.etsy_taxonomy_id = String(taxId);
      }
    }

    if (typeof parsed.listing_tags === "string" && parsed.listing_tags.trim()) {
      const tags = (parsed.listing_tags as string)
        .split(",")
        .map((t: string) => t.trim())
        .filter(Boolean)
        .slice(0, 13)
        .join(", ");
      if (tags) updates.listing_tags = tags;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({
        ok: true,
        improved: false,
        message: "AI did not suggest any text changes.",
        score: scoreResult.score,
      });
    }

    const db = getDb();
    const setClauses: string[] = ["updated_at = @updated_at"];
    const params: Record<string, unknown> = { id, updated_at: new Date().toISOString() };

    const dbColumns = [
      "listing_title", "listing_description", "listing_tags",
      "category_tags", "listing_title_strategy", "listing_product_story",
      "listing_condition_clarity", "listing_attributes",
      "listing_pricing_shipping_notes", "listing_quality_checklist",
      "listing_category_path", "etsy_when_made", "materials",
    ] as const;

    if (updates.etsy_taxonomy_id) {
      setClauses.push("etsy_taxonomy_id = @etsy_taxonomy_id");
      params.etsy_taxonomy_id = Number(updates.etsy_taxonomy_id);
    }

    for (const col of dbColumns) {
      if (updates[col]) {
        setClauses.push(`${col} = @${col}`);
        params[col] = updates[col];
      }
    }
    if (item.listing_draft_state === "approved") {
      setClauses.push("listing_draft_state = 'draft'");
    }

    db.prepare(`UPDATE inventory SET ${setClauses.join(", ")} WHERE id = @id`).run(params);

    const refreshed = getInventoryById(id);
    const newScore = refreshed ? computeListingScore(refreshed, minScore) : null;

    logActivity({
      action: "listing.ai_improved",
      entityType: "inventory",
      entityId: id,
      entityLabel: item.item_number || item.description || `Item ${id}`,
      detail: {
        previous_score: scoreResult.score,
        new_score: newScore?.score ?? null,
        fields_improved: Object.keys(updates),
      },
      source: "user",
    });

    return NextResponse.json({
      ok: true,
      improved: true,
      fields_improved: Object.keys(updates),
      previous_score: scoreResult.score,
      new_score: newScore?.score ?? scoreResult.score,
      item: refreshed,
    });
  } catch (error) {
    logger.error("Improve listing error", { error });

    if (error instanceof ApiRouteError) {
      return errorResponse(error);
    }

    if (error instanceof OpenAI.AuthenticationError) {
      return errorResponse(new ApiRouteError({
        status: 401,
        code: "LISTING_IMPROVEMENT_FAILED",
        message: "OpenAI authentication failed",
        userMessage: "Your AI API key is invalid or expired. Go to Settings → AI Settings and update it.",
        actions: ["Go to Settings → AI Settings and check your API key."],
        canRetry: false,
      }));
    }

    if (error instanceof OpenAI.RateLimitError) {
      const isQuota = error.message?.toLowerCase().includes("insufficient_quota")
        || error.message?.toLowerCase().includes("exceeded your current quota");
      if (isQuota) {
        return errorResponse(new ApiRouteError({
          status: 429,
          code: "LISTING_IMPROVEMENT_FAILED",
          message: "OpenAI quota exhausted",
          userMessage: "Your OpenAI account is out of credits. Add a payment method or purchase credits at platform.openai.com, then try again.",
          actions: ["Go to platform.openai.com → Billing and add credits."],
          canRetry: false,
        }));
      }
      return errorResponse(new ApiRouteError({
        status: 429,
        code: "LISTING_IMPROVEMENT_FAILED",
        message: "OpenAI rate limit exceeded",
        userMessage: "The AI service is rate-limited. Wait about 30 seconds and try again.",
        actions: ["Wait 30 seconds and try again."],
        canRetry: true,
      }));
    }

    if (error instanceof OpenAI.APIConnectionError) {
      return errorResponse(new ApiRouteError({
        status: 503,
        code: "LISTING_IMPROVEMENT_FAILED",
        message: "Cannot reach OpenAI",
        userMessage: "Could not connect to the AI service. Check your internet connection and try again.",
        actions: ["Check your internet connection.", "Try again in a moment."],
        canRetry: true,
      }));
    }

    if (error instanceof OpenAI.APIError) {
      const statusCode = error.status ?? 500;
      return errorResponse(new ApiRouteError({
        status: statusCode,
        code: "LISTING_IMPROVEMENT_FAILED",
        message: `OpenAI error: ${error.message}`,
        userMessage: statusCode >= 500
          ? "The AI service is experiencing problems on their end. Try again in a minute."
          : `The AI service returned an error: ${error.message}`,
        actions: statusCode >= 500
          ? ["Wait a minute and try again — this is an issue on OpenAI's side."]
          : ["Try again.", "If this persists, check Config → AI Settings."],
        canRetry: statusCode >= 500,
      }));
    }

    const msg = error instanceof Error ? error.message : String(error);
    return errorResponse(new ApiRouteError({
      status: 500,
      code: "LISTING_IMPROVEMENT_FAILED",
      message: msg,
      userMessage: `Something unexpected went wrong: ${msg}`,
      actions: ["Try again.", "If this keeps happening, check Config → AI Settings."],
      canRetry: true,
    }));
  }
}
