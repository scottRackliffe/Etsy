import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import type { InventoryRecord } from "@/lib/inventory";
import type { ListingGuidance } from "@/lib/listing-guidance";
import { getAiConfig } from "@/lib/ai-config";

export type GeneratedListing = {
  listing_title: string;
  listing_description: string;
  listing_tags: string;
  listing_category_path?: string | null;
};

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function getOpenAiClient(): OpenAI {
  const config = getAiConfig();
  if (!config) {
    throw new Error("Missing AI configuration for listing generation");
  }
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl ?? undefined,
    timeout: config.timeoutMs,
    maxRetries: config.retryCount,
  });
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

async function toImageUrl(reference: string): Promise<string> {
  if (/^https?:\/\//i.test(reference)) {
    return reference;
  }

  const absolutePath = path.isAbsolute(reference) ? reference : path.join(process.cwd(), reference);
  const fileBuffer = await fs.readFile(absolutePath);
  const extension = path.extname(absolutePath).toLowerCase();
  const mimeType = IMAGE_MIME_BY_EXT[extension];
  if (!mimeType) {
    throw new Error(`Unsupported image type for listing generation: ${absolutePath}`);
  }
  return `data:${mimeType};base64,${fileBuffer.toString("base64")}`;
}

function buildItemContext(item: InventoryRecord): string {
  return JSON.stringify(
    {
      id: item.id,
      item_number: item.item_number,
      description: item.description,
      condition_code: item.condition_code,
      condition_notes: item.condition_notes,
      category_tags: item.category_tags,
      sale_revenue: item.sale_revenue,
    },
    null,
    2
  );
}

export async function generateListingFromAi(params: {
  item: InventoryRecord;
  pictureReferences: string[];
  guidance: ListingGuidance;
}): Promise<GeneratedListing> {
  const config = getAiConfig();
  if (!config) {
    throw new Error("AI configuration is required for integrated generation");
  }
  const model = config.model;
  const openai = getOpenAiClient();

  const imageUrls = await Promise.all(
    params.pictureReferences.map((reference) => toImageUrl(reference))
  );

  const userText = [
    "Generate Etsy listing content for this item using the guidance and images.",
    "Return strict JSON only with keys: listing_title, listing_description, listing_tags, listing_category_path (optional).",
    "Use up to 13 tags and avoid duplicates.",
    "",
    "Item context:",
    buildItemContext(params.item),
    "",
    "Guidance document: etsy-listing-template-and-requirements.md",
    clipForPrompt(params.guidance.template),
    "",
    "Guidance document: How_to_Win_on_Etsy.md",
    clipForPrompt(params.guidance.listingTips),
    "",
    "Guidance document: Etsy_Photo_Guide.md",
    clipForPrompt(params.guidance.photoTips),
  ].join("\n");

  const content: Array<
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string; detail: "auto" }
  > = [
    { type: "input_text", text: userText },
    ...imageUrls.map((imageUrl) => ({
      type: "input_image" as const,
      image_url: imageUrl,
      detail: "auto" as const,
    })),
  ];

  const response = await openai.responses.create({
    model,
    max_output_tokens: config.tokenBudget,
    temperature: 0.2,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: "You are an Etsy listing assistant. Produce accurate, non-misleading listing content based on provided item context and images.",
          },
        ],
      },
      {
        role: "user",
        content,
      },
    ],
  });

  const outputText = response.output_text?.trim();
  if (!outputText) {
    throw new Error("AI returned empty output for listing generation");
  }

  const parsed = JSON.parse(cleanJsonResponse(outputText)) as {
    listing_title?: unknown;
    listing_description?: unknown;
    listing_tags?: unknown;
    listing_category_path?: unknown;
  };

  if (typeof parsed.listing_title !== "string" || parsed.listing_title.trim().length === 0) {
    throw new Error("AI response missing listing_title");
  }
  if (
    typeof parsed.listing_description !== "string" ||
    parsed.listing_description.trim().length === 0
  ) {
    throw new Error("AI response missing listing_description");
  }

  const listingCategoryPath =
    typeof parsed.listing_category_path === "string" &&
    parsed.listing_category_path.trim().length > 0
      ? parsed.listing_category_path.trim()
      : null;

  return {
    listing_title: parsed.listing_title.trim(),
    listing_description: parsed.listing_description.trim(),
    listing_tags: normalizeTags(parsed.listing_tags),
    listing_category_path: listingCategoryPath,
  };
}
