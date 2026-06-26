/**
 * AI-vision per-photo quality evaluation (ADR-082 §8b / WS-G3).
 *
 * Reuses the existing AI plumbing pattern (OpenAI Responses API, image data
 * URLs, api-usage logging). Produces the 24-point Photos §8b sub-score plus
 * per-photo remediation. Degrades gracefully: returns `null` on any failure
 * (missing config, unreadable image, AI/parse error) so the deterministic
 * rubric falls back to its provisional sub-score.
 *
 * WS-CR18: app-level retry on unusable-200 paths (empty output / parse error /
 * zero judgments). The OpenAI client retries transport errors; it does NOT retry
 * a 200 whose body is empty/malformed. We retry once here before giving up.
 * On final fallback, `lastPhotoVisionFailureReason` records the specific cause.
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import OpenAI from "openai";
import type { InventoryRecord } from "@/lib/inventory";
import { getAiConfig, resolveModelForTask } from "@/lib/ai-config";
import { logApiCall } from "@/lib/api-usage";
import type { PhotoQualitySubresult, QualityRemediationItem } from "@/lib/listing-rubric";

/**
 * Side-channel for the most recent failure reason (WS-CR18 / WS-CR10).
 * Set whenever `evaluatePhotoQuality` returns null (except no-config / no-photos
 * early exits, which are intentional non-failures). Reset to null on each call.
 * Does not affect the return type; callers can read this for diagnostics.
 */
export let lastPhotoVisionFailureReason: string | null = null;

const PHOTO_SUBSCORE_MAX = 24;
const MAX_PHOTOS = 10;
const MIN_LONG_EDGE_PX = 1000; // Etsy recommends ≥2000px; below 1000 is poor.

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

type PhotoInput = { slot: number; reference: string };

function collectMainPhotos(item: InventoryRecord): PhotoInput[] {
  const row = item as unknown as Record<string, unknown>;
  const photos: PhotoInput[] = [];
  for (let slot = 1; slot <= 20; slot += 1) {
    const ref = row[`picture_${slot}`];
    if (typeof ref === "string" && ref.trim()) {
      photos.push({ slot, reference: ref.trim() });
    }
  }
  return photos.slice(0, MAX_PHOTOS);
}

async function readImage(reference: string): Promise<{ dataUrl: string; longEdge: number | null }> {
  if (/^https?:\/\//i.test(reference)) {
    // Remote reference: cannot measure locally; let the model judge.
    return { dataUrl: reference, longEdge: null };
  }
  const absolutePath = path.isAbsolute(reference)
    ? reference
    : path.join(process.cwd(), reference);
  const buffer = await fs.readFile(absolutePath);
  const ext = path.extname(absolutePath).toLowerCase();
  const mime = IMAGE_MIME_BY_EXT[ext];
  if (!mime) {
    throw new Error(`Unsupported image type: ${absolutePath}`);
  }
  let longEdge: number | null = null;
  try {
    const meta = await sharp(buffer).metadata();
    if (meta.width && meta.height) {
      longEdge = Math.max(meta.width, meta.height);
    }
  } catch {
    longEdge = null;
  }
  return { dataUrl: `data:${mime};base64,${buffer.toString("base64")}`, longEdge };
}

type PhotoJudgment = {
  photo_index: number;
  focus: number; // 0..2
  lighting: number; // 0..2
  background: number; // 0..2
  framing: number; // 0..2
  color_accuracy: number; // 0..1
  issues: string[];
};

function clamp(value: unknown, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, n));
}

function parseJudgments(text: string): PhotoJudgment[] {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  const parsed = JSON.parse(cleaned) as unknown;
  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { photos?: unknown }).photos)
      ? (parsed as { photos: unknown[] }).photos
      : null;
  if (!arr) throw new Error("AI photo response was not an array");
  return arr.map((raw, idx) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    return {
      photo_index: Number.isFinite(Number(r.photo_index)) ? Number(r.photo_index) : idx,
      focus: clamp(r.focus, 2),
      lighting: clamp(r.lighting, 2),
      background: clamp(r.background, 2),
      framing: clamp(r.framing, 2),
      color_accuracy: clamp(r.color_accuracy, 1),
      issues: Array.isArray(r.issues) ? r.issues.map((i) => String(i)).filter(Boolean) : [],
    };
  });
}

/** Quality fraction (0..1) for one photo from its AI dimensions. */
function judgmentFraction(j: PhotoJudgment): number {
  // focus+lighting+background+framing (max 8) + color_accuracy (max 1) → max 9
  const raw = j.focus + j.lighting + j.background + j.framing + j.color_accuracy;
  return Math.max(0, Math.min(1, raw / 9));
}

/**
 * Evaluate per-photo quality with AI vision. Returns `null` on any failure so
 * the caller falls back to the deterministic provisional sub-score.
 */
export async function evaluatePhotoQuality(
  item: InventoryRecord,
  itemId: number
): Promise<PhotoQualitySubresult | null> {
  const config = getAiConfig();
  if (!config) return null;

  const photos = collectMainPhotos(item);
  if (photos.length === 0) return null;

  let images: Array<{ slot: number; dataUrl: string; longEdge: number | null }>;
  try {
    images = await Promise.all(
      photos.map(async (p) => {
        const { dataUrl, longEdge } = await readImage(p.reference);
        return { slot: p.slot, dataUrl, longEdge };
      })
    );
  } catch {
    return null;
  }

  const link = `/inventory?itemId=${itemId}#pictures`;
  const promptText = [
    "You are evaluating Etsy product photos for quality. The images are provided in order; photo_index is 0-based in that order.",
    "For EACH photo return an object with integer/decimal scores:",
    "- focus (0-2): sharpness, no blur",
    "- lighting (0-2): even, bright, no harsh shadows/blowouts",
    "- background (0-2): clean, non-distracting",
    "- framing (0-2): item fills frame, level, not cropped awkwardly",
    "- color_accuracy (0-1): natural, true-to-life color",
    "- issues: short array of specific problems (e.g. 'soft focus', 'busy background')",
    "Return STRICT JSON only: an array of these objects, one per photo, in order.",
  ].join("\n");

  const content: Array<
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string; detail: "auto" }
  > = [
    { type: "input_text", text: promptText },
    ...images.map((img) => ({
      type: "input_image" as const,
      image_url: img.dataUrl,
      detail: "auto" as const,
    })),
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
  const model = resolveModelForTask(config, "photo-quality");
  const inputMessages = [
    {
      role: "system" as const,
      content: [
        {
          type: "input_text" as const,
          text: "You are a meticulous product-photography reviewer. Score objectively and concisely.",
        },
      ],
    },
    { role: "user" as const, content },
  ];

  const makeRequest = async (withTemperature: boolean) =>
    openai.responses.create({
      model,
      max_output_tokens: maxTokens,
      ...(withTemperature ? { temperature: 0.1 } : {}),
      input: inputMessages,
    });

  // WS-CR18: attempt the OpenAI call + parse + validate up to MAX_ATTEMPTS times.
  // The client already retries transport errors; here we retry unusable-200 responses
  // (empty output, malformed JSON, zero judgments) which the client never sees as errors.
  const MAX_ATTEMPTS = 2;

  type AttemptOk = { ok: true; judgments: PhotoJudgment[] };
  type AttemptFail = { ok: false; reason: string };
  type AttemptResult = AttemptOk | AttemptFail;

  const tryOnce = async (): Promise<AttemptResult> => {
    let outputText: string | undefined;
    try {
      let response;
      try {
        response = await makeRequest(true);
      } catch (firstError) {
        if (isTemperatureUnsupportedError(firstError)) {
          logApiCall("openai", "responses.create/listing-photo-quality", 400);
          response = await makeRequest(false);
        } else {
          throw firstError;
        }
      }
      logApiCall("openai", "responses.create/listing-photo-quality", 200);
      outputText = response.output_text?.trim();
    } catch (err) {
      const status = err instanceof OpenAI.APIError ? (err.status ?? 500) : 500;
      logApiCall("openai", "responses.create/listing-photo-quality", status);
      return { ok: false, reason: `api_error_${status}` };
    }

    if (!outputText) {
      return { ok: false, reason: "empty_output" };
    }

    let judgments: PhotoJudgment[];
    try {
      judgments = parseJudgments(outputText);
    } catch {
      return { ok: false, reason: "parse_error" };
    }

    if (judgments.length === 0) {
      return { ok: false, reason: "zero_judgments" };
    }

    return { ok: true, judgments };
  };

  let lastReason = "unknown";
  let judgments: PhotoJudgment[] | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const result = await tryOnce();
    if (result.ok) {
      judgments = result.judgments;
      break;
    }
    lastReason = result.reason;
    // Only retry the unusable-200 paths; genuine transport errors already had the
    // client's own retries — a second app-level attempt is unlikely to help.
    const isRetryable = result.reason === "empty_output" || result.reason === "parse_error" || result.reason === "zero_judgments";
    if (!isRetryable || attempt + 1 >= MAX_ATTEMPTS) break;
    console.warn(
      `[listing-photo-vision] attempt ${attempt + 1} unusable (${result.reason}); retrying once`
    );
  }

  if (!judgments) {
    lastPhotoVisionFailureReason = lastReason;
    console.warn(
      `[listing-photo-vision] all attempts failed (${lastReason}) — falling back to provisional sub-score`
    );
    return null;
  }

  // Narrow to non-null for use in closures below.
  const resolvedJudgments: PhotoJudgment[] = judgments;

  const remediation: QualityRemediationItem[] = [];
  let fractionSum = 0;
  let counted = 0;

  images.forEach((img, idx) => {
    const j = resolvedJudgments.find((x) => x.photo_index === idx) ?? resolvedJudgments[idx];
    if (!j) return;
    let fraction = judgmentFraction(j);

    // Deterministic resolution gate folds into the per-photo fraction.
    const lowRes = img.longEdge != null && img.longEdge < MIN_LONG_EDGE_PX;
    if (lowRes) fraction = Math.min(fraction, 0.5);

    fractionSum += fraction;
    counted += 1;

    const weakAspects: string[] = [];
    if (j.focus < 1) weakAspects.push("soft/blurry focus");
    if (j.lighting < 1) weakAspects.push("poor lighting");
    if (j.background < 1) weakAspects.push("distracting background");
    if (j.framing < 1) weakAspects.push("weak framing/crop");
    if (j.color_accuracy < 0.5) weakAspects.push("off color");
    if (lowRes) weakAspects.push(`low resolution (${img.longEdge}px)`);
    const extra = j.issues.slice(0, 2);

    if (weakAspects.length > 0 || extra.length > 0) {
      const problems = [...new Set([...weakAspects, ...extra])].join(", ");
      remediation.push({
        category: "photos",
        ref: `picture_${img.slot}`,
        shortcoming: `Photo ${img.slot}: ${problems}.`,
        mitigation:
          "Reshoot with sharp focus, even lighting, a clean background, and ≥2000px resolution.",
        weight: Math.max(1, Math.round((1 - fraction) * 3)),
        resolution_link: link,
      });
    }
  });

  if (counted === 0) return null;

  const earned = Math.round(PHOTO_SUBSCORE_MAX * (fractionSum / counted));

  return {
    earned: Math.max(0, Math.min(PHOTO_SUBSCORE_MAX, earned)),
    remediation,
    photo_ai_evaluated: true,
  };
}
