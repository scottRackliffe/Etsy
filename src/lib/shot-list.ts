/**
 * AI shot-list generation (ADR-083 / WS-H1).
 *
 * Given the primary photo (`picture_1`) + item context, generate a persisted,
 * checklist-style shot list tailored to the item, using the ADR-072 shot-type
 * taxonomy. Reuses the existing OpenAI Responses plumbing; honors the WS-AICOST
 * economy model lane.
 */
import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import type { InventoryRecord } from "@/lib/inventory";
import { getAiConfig, resolveModelForTask } from "@/lib/ai-config";
import { logApiCall } from "@/lib/api-usage";
import { parseShotTypeSet } from "@/lib/picture-classifications";

export const SHOT_TYPES = [
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
  "extra",
] as const;

export type ShotType = (typeof SHOT_TYPES)[number];

export type ShotListItem = {
  shot_type: ShotType;
  name: string;
  purpose: string;
  pass_spec: string;
  tips: string;
  required: boolean;
  captured: boolean;
};

export class ShotListError extends Error {
  code: "AI_NOT_CONFIGURED" | "NO_PRIMARY_PHOTO" | "GENERATION_FAILED";
  constructor(code: ShotListError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

async function toImageUrl(reference: string): Promise<string> {
  if (/^https?:\/\//i.test(reference)) return reference;
  const absolutePath = path.isAbsolute(reference) ? reference : path.join(process.cwd(), reference);
  const buffer = await fs.readFile(absolutePath);
  const mime = IMAGE_MIME_BY_EXT[path.extname(absolutePath).toLowerCase()];
  if (!mime) throw new Error(`Unsupported image type: ${absolutePath}`);
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function buildItemContext(item: InventoryRecord): string {
  const row = item as unknown as Record<string, unknown>;
  return JSON.stringify(
    {
      description: item.description,
      condition_code: item.condition_code,
      condition_notes: item.condition_notes,
      has_condition_issue: row.has_condition_issue ?? null,
      materials: item.materials,
      is_supply: row.is_supply ?? null,
      category_tags: item.category_tags,
      etsy_taxonomy_id: row.etsy_taxonomy_id ?? null,
      etsy_when_made: row.etsy_when_made ?? null,
      dimensions: {
        length: row.item_length ?? null,
        width: row.item_width ?? null,
        height: row.item_height ?? null,
        unit: row.item_dimensions_unit ?? null,
      },
    },
    null,
    2
  );
}

function normalizeShotType(value: unknown): ShotType {
  const t = str(value).toLowerCase();
  return (SHOT_TYPES as readonly string[]).includes(t) ? (t as ShotType) : "extra";
}

function parseShotListResponse(text: string): ShotListItem[] {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  const parsed = JSON.parse(cleaned) as unknown;
  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { shots?: unknown }).shots)
      ? (parsed as { shots: unknown[] }).shots
      : null;
  if (!arr) throw new Error("AI shot-list response was not an array");
  return arr
    .map((raw) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      return {
        shot_type: normalizeShotType(r.shot_type),
        name: str(r.name) || normalizeShotType(r.shot_type),
        purpose: str(r.purpose),
        pass_spec: str(r.pass_spec),
        tips: str(r.tips),
        required: r.required === true || r.required === "true",
        captured: false,
      } satisfies ShotListItem;
    })
    .filter((s) => s.name.length > 0);
}

function countMainPictures(item: InventoryRecord): number {
  const row = item as unknown as Record<string, unknown>;
  let n = 0;
  for (let i = 1; i <= 20; i += 1) if (str(row[`picture_${i}`])) n += 1;
  return n;
}

/** Derive `captured` per shot from existing pictures + their classifications. */
export function mergeCapturedFlags(list: ShotListItem[], item: InventoryRecord): ShotListItem[] {
  const row = item as unknown as Record<string, unknown>;
  const shotTypes = parseShotTypeSet(str(row.picture_classifications));
  const hasHero = str(row.picture_1).length > 0;
  const hasCondition = Array.from({ length: 5 }, (_, i) => str(row[`condition_picture_${i + 1}`]))
    .some((p) => p.length > 0);

  return list.map((shot) => {
    let captured = shotTypes.has(shot.shot_type);
    if (shot.shot_type === "hero") captured = captured || hasHero;
    if (shot.shot_type === "imperfection") captured = captured || hasCondition;
    return { ...shot, captured };
  });
}

/** Read + refresh the saved shot list (recomputes captured flags). */
export function getSavedShotList(item: InventoryRecord): ShotListItem[] | null {
  const raw = str((item as unknown as Record<string, unknown>).shot_list_json);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const list = parsed.map((raw2) => {
      const r = (raw2 ?? {}) as Record<string, unknown>;
      return {
        shot_type: normalizeShotType(r.shot_type),
        name: str(r.name),
        purpose: str(r.purpose),
        pass_spec: str(r.pass_spec),
        tips: str(r.tips),
        required: r.required === true,
        captured: false,
      } satisfies ShotListItem;
    });
    return mergeCapturedFlags(list, item);
  } catch {
    return null;
  }
}

/** Generate a shot list via AI from the primary photo + context. */
export async function generateShotList(item: InventoryRecord): Promise<ShotListItem[]> {
  const config = getAiConfig();
  if (!config) {
    throw new ShotListError("AI_NOT_CONFIGURED", "AI is not configured.");
  }
  const primary = str((item as unknown as Record<string, unknown>).picture_1);
  if (!primary) {
    throw new ShotListError("NO_PRIMARY_PHOTO", "A primary photo is required to generate a shot list.");
  }

  let imageUrl: string;
  try {
    imageUrl = await toImageUrl(primary);
  } catch {
    throw new ShotListError("NO_PRIMARY_PHOTO", "The primary photo could not be read.");
  }

  const promptText = [
    "You are an expert Etsy product photographer. From the primary photo and the item context,",
    "produce the COMPLETE shot list of photos (and an optional short video) this specific item",
    "needs for a top-rated listing.",
    "",
    "Use ONLY these shot_type values: " + SHOT_TYPES.join(", ") + ".",
    "Tailor to the item: e.g. a marked ceramic needs a 'backstamp'; an unmarked item does not.",
    "Always include 'hero'. Include 'imperfection' only if the item has condition issues.",
    "",
    "Return STRICT JSON only: an array; each element:",
    '{ "shot_type": <taxonomy>, "name": <short label>, "purpose": <why this shot>,',
    '  "pass_spec": <objective pass criteria>, "tips": <photography technique>,',
    '  "required": <true if needed for top rating, false if recommended> }',
    "",
    "Item context:",
    buildItemContext(item),
  ].join("\n");

  const userContent: Array<
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string; detail: "auto" }
  > = [
    { type: "input_text", text: promptText },
    { type: "input_image" as const, image_url: imageUrl, detail: "auto" as const },
  ];

  const maxTokens = Math.max(config.tokenBudget, 4000);

  function isTemperatureUnsupportedError(err: unknown): boolean {
    if (!(err instanceof OpenAI.APIError) || err.status !== 400) return false;
    const msg = (typeof err.message === "string" ? err.message : "").toLowerCase();
    return msg.includes("temperature") && msg.includes("unsupported");
  }

  const openai = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl ?? undefined,
    timeout: config.timeoutMs,
    maxRetries: config.retryCount,
  });
  const model = resolveModelForTask(config, "shot-list");
  const inputMessages = [
    {
      role: "system" as const,
      content: [
        {
          type: "input_text" as const,
          text: "You are a meticulous product-photography planner. Output strict JSON only.",
        },
      ],
    },
    { role: "user" as const, content: userContent },
  ];

  const makeRequest = async (withTemperature: boolean) =>
    openai.responses.create({
      model,
      max_output_tokens: maxTokens,
      ...(withTemperature ? { temperature: 0.3 } : {}),
      input: inputMessages,
    });

  let outputText: string | undefined;
  try {
    let response;
    try {
      response = await makeRequest(true);
    } catch (firstError) {
      if (isTemperatureUnsupportedError(firstError)) {
        logApiCall("openai", "responses.create/shot-list", 400);
        response = await makeRequest(false);
      } else {
        throw firstError;
      }
    }
    logApiCall("openai", "responses.create/shot-list", 200);
    outputText = response.output_text?.trim();
  } catch (err) {
    const status = err instanceof OpenAI.APIError ? (err.status ?? 500) : 500;
    logApiCall("openai", "responses.create/shot-list", status);
    throw new ShotListError("GENERATION_FAILED", "The AI shot-list request failed.");
  }

  if (!outputText) {
    throw new ShotListError(
      "GENERATION_FAILED",
      "The AI returned empty output for the shot list (token budget exhausted or model issue)."
    );
  }

  let list: ShotListItem[];
  try {
    list = parseShotListResponse(outputText);
  } catch {
    throw new ShotListError("GENERATION_FAILED", "The AI shot list could not be parsed.");
  }
  if (list.length === 0) {
    throw new ShotListError("GENERATION_FAILED", "The AI returned no shots.");
  }

  return mergeCapturedFlags(list, item);
}

/**
 * Merge previously-captured progress when regenerating: preserve nothing from
 * positions (the new list defines structure), but `captured` is always derived
 * fresh from current pictures (so regenerating never loses real progress).
 */
export function withFreshCaptured(list: ShotListItem[], item: InventoryRecord): ShotListItem[] {
  return mergeCapturedFlags(list, item);
}

export { countMainPictures };
