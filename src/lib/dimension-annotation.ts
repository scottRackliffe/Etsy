/**
 * AI dimension annotation (ADR-084 / WS-H2).
 *
 * 1. estimateDimensions(): vision model reads a reference-ruler photo and
 *    estimates length/width/height (+ confidence). Economy lane (WS-AICOST).
 * 2. renderAnnotatedImage(): copies `picture_1` and composites clean,
 *    dual-unit dimension callouts with Sharp, saved to a SECONDARY slot
 *    (never the hero), classified `measurement` (ADR-072).
 *
 * The confirm/correct step is mandatory and lives in the UI; rendering always
 * uses the values passed to renderAnnotatedImage(), never raw estimates.
 */
import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import sharp from "sharp";
import type { InventoryRecord } from "@/lib/inventory";
import { getAiConfig, resolveModelForTask } from "@/lib/ai-config";
import { logApiCall } from "@/lib/api-usage";
import { getDb } from "@/lib/sqlite";
import { processAndStorePicture } from "@/lib/picture-storage";
import { recomputeAndStoreListingPhase } from "@/lib/listing-phase";

export type DimensionUnit = "in" | "ft" | "mm" | "cm" | "m";

export type DimensionEstimate = {
  length: number | null;
  width: number | null;
  height: number | null;
  unit: DimensionUnit;
  confidence: { length: number | null; width: number | null; height: number | null };
};

export type ConfirmedDimensions = {
  length: number | null;
  width: number | null;
  height: number | null;
  unit: DimensionUnit;
};

export class DimensionError extends Error {
  code: "NO_PRIMARY_PHOTO" | "NO_RULER_PHOTO" | "NO_EMPTY_SLOT" | "RENDER_FAILED";
  constructor(code: DimensionError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

const VALID_UNITS: DimensionUnit[] = ["in", "ft", "mm", "cm", "m"];
const IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeUnit(value: unknown, fallback: DimensionUnit): DimensionUnit {
  const u = str(value).toLowerCase();
  return (VALID_UNITS as string[]).includes(u) ? (u as DimensionUnit) : fallback;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function bufferFromReference(reference: string): Promise<Buffer> {
  if (/^https?:\/\//i.test(reference)) {
    const res = await fetch(reference);
    if (!res.ok) throw new Error(`Could not fetch image: ${reference}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const abs = path.isAbsolute(reference) ? reference : path.join(process.cwd(), reference);
  return fs.readFile(abs);
}

function dataUrlFromBuffer(buffer: Buffer, reference: string): string {
  const mime = IMAGE_MIME_BY_EXT[path.extname(reference).toLowerCase()] ?? "image/jpeg";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

// ---------------------------------------------------------------------------
// 1. AI estimate
// ---------------------------------------------------------------------------

/**
 * Estimate dimensions from a ruler photo. Returns null on AI failure / no
 * config so the UI can fall back to fully-manual entry (estimate is a
 * convenience; the confirm step is the source of truth).
 */
export async function estimateDimensions(
  item: InventoryRecord,
  rulerBuffer: Buffer,
  rulerFilename: string
): Promise<DimensionEstimate | null> {
  const config = getAiConfig();
  if (!config) return null;

  const unit = normalizeUnit(
    (item as unknown as Record<string, unknown>).item_dimensions_unit,
    "in"
  );
  const rulerUrl = dataUrlFromBuffer(rulerBuffer, rulerFilename);

  const promptText = [
    "You are measuring a product for an online listing.",
    "The photo contains the item next to a reference ruler/tape measure.",
    "Use the ruler's scale to estimate the item's real-world dimensions.",
    `Report all values in '${unit}'.`,
    "Estimate length, width, and height. Use null for any dimension you cannot",
    "determine (e.g. depth is not visible in a flat photo).",
    "Provide a 0..1 confidence per dimension.",
    "",
    "Return STRICT JSON only:",
    '{ "length": <number|null>, "width": <number|null>, "height": <number|null>,',
    `  "unit": "${unit}", "confidence": { "length": <0..1|null>, "width": <0..1|null>, "height": <0..1|null> } }`,
  ].join("\n");

  let outputText: string | undefined;
  try {
    const openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl ?? undefined,
      timeout: config.timeoutMs,
      maxRetries: config.retryCount,
    });
    const response = await openai.responses.create({
      model: resolveModelForTask(config, "measure"),
      max_output_tokens: config.tokenBudget,
      temperature: 0.1,
      input: [
        {
          role: "system",
          content: [
            { type: "input_text", text: "You are a precise measuring assistant. Output strict JSON only." },
          ],
        },
        {
          role: "user",
          content: [
            { type: "input_text" as const, text: promptText },
            { type: "input_image" as const, image_url: rulerUrl, detail: "auto" as const },
          ],
        },
      ],
    });
    logApiCall("openai", "responses.create/measure", 200);
    outputText = response.output_text?.trim();
  } catch (err) {
    const status = err instanceof OpenAI.APIError ? (err.status ?? 500) : 500;
    logApiCall("openai", "responses.create/measure", status);
    return null;
  }

  if (!outputText) return null;
  let cleaned = outputText;
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }

  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const conf = (parsed.confidence ?? {}) as Record<string, unknown>;
    const clampConf = (v: unknown): number | null => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null;
    };
    return {
      length: num(parsed.length),
      width: num(parsed.width),
      height: num(parsed.height),
      unit: normalizeUnit(parsed.unit, unit),
      confidence: {
        length: clampConf(conf.length),
        width: clampConf(conf.width),
        height: clampConf(conf.height),
      },
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 2. Overlay rendering
// ---------------------------------------------------------------------------

const UNIT_TO_INCHES: Record<DimensionUnit, number> = {
  in: 1,
  ft: 12,
  mm: 1 / 25.4,
  cm: 1 / 2.54,
  m: 39.3700787,
};

function trimNum(n: number): string {
  return (Math.round(n * 10) / 10).toString().replace(/\.0$/, "");
}

/** Dual-unit label e.g. "12 in (30.5 cm)". */
function formatDual(value: number, unit: DimensionUnit): string {
  const inches = value * UNIT_TO_INCHES[unit];
  const cm = inches * 2.54;
  return `${trimNum(inches)} in (${trimNum(cm)} cm)`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type Callout = { edge: "vertical" | "horizontalBottom" | "horizontalTop"; text: string };

function buildOverlaySvg(w: number, h: number, callouts: Callout[]): string {
  const margin = Math.max(Math.round(Math.min(w, h) * 0.07), 24);
  const fontSize = Math.max(Math.round(Math.min(w, h) * 0.045), 16);
  const stroke = Math.max(Math.round(w * 0.004), 2);
  const dark = "#081a34";

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  const labelBox = (cx: number, cy: number, text: string): string => {
    const boxW = text.length * fontSize * 0.6 + fontSize;
    const boxH = fontSize * 1.7;
    const x = clamp(cx - boxW / 2, 4, w - boxW - 4);
    const y = clamp(cy - boxH / 2, 4, h - boxH - 4);
    return `
      <g>
        <rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="${boxH * 0.25}"
          fill="${dark}" fill-opacity="0.85" stroke="#FFCC00" stroke-width="${Math.max(stroke * 0.5, 1)}"/>
        <text x="${x + boxW / 2}" y="${y + boxH / 2}" font-family="Arial, Helvetica, sans-serif"
          font-size="${fontSize}" font-weight="700" fill="#ffffff" text-anchor="middle"
          dominant-baseline="central">${escapeXml(text)}</text>
      </g>`;
  };

  // A measurement line drawn twice (dark behind, white in front) for contrast.
  const measureLine = (x1: number, y1: number, x2: number, y2: number): string => `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${dark}" stroke-opacity="0.55"
      stroke-width="${stroke + 2}" stroke-linecap="round"/>
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ffffff" stroke-width="${stroke}"
      stroke-linecap="round" marker-start="url(#dimStart)" marker-end="url(#dimEnd)"/>`;

  const parts: string[] = [];
  for (const c of callouts) {
    if (c.edge === "vertical") {
      const x = margin;
      parts.push(measureLine(x, margin, x, h - margin));
      parts.push(labelBox(x + fontSize * 2.4, h / 2, c.text));
    } else if (c.edge === "horizontalBottom") {
      const y = h - margin;
      parts.push(measureLine(margin, y, w - margin, y));
      parts.push(labelBox(w / 2, y - fontSize * 1.4, c.text));
    } else {
      const y = margin;
      parts.push(measureLine(margin, y, w - margin, y));
      parts.push(labelBox(w / 2, y + fontSize * 1.4, c.text));
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <marker id="dimEnd" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L8,3 L0,6 Z" fill="#ffffff" stroke="${dark}" stroke-width="0.5"/>
      </marker>
      <marker id="dimStart" markerWidth="10" markerHeight="10" refX="1" refY="3" orient="auto" markerUnits="strokeWidth">
        <path d="M8,0 L0,3 L8,6 Z" fill="#ffffff" stroke="${dark}" stroke-width="0.5"/>
      </marker>
    </defs>
    ${parts.join("\n")}
  </svg>`;
}

function buildAltText(item: InventoryRecord, confirmed: ConfirmedDimensions): string {
  const label = str(item.description) || str(item.item_number) || "Item";
  const parts: string[] = [];
  if (confirmed.height) parts.push(`height ${formatDual(confirmed.height, confirmed.unit)}`);
  if (confirmed.width) parts.push(`width ${formatDual(confirmed.width, confirmed.unit)}`);
  if (confirmed.length) parts.push(`length ${formatDual(confirmed.length, confirmed.unit)}`);
  return parts.length ? `${label} shown with ${parts.join(" and ")}.` : `${label} measurement photo.`;
}

function findEmptyMainSlot(item: InventoryRecord, preferred?: number): number {
  const row = item as unknown as Record<string, unknown>;
  // Hero stays clean: never slot 1.
  if (preferred && preferred >= 2 && preferred <= 20) return preferred;
  for (let i = 2; i <= 20; i += 1) {
    if (!str(row[`picture_${i}`])) return i;
  }
  throw new DimensionError("NO_EMPTY_SLOT", "All picture slots are full. Free a slot and retry.");
}

function setMeasurementClassification(raw: string, slot: number): string {
  let arr: Array<{ photo_index: number; type: string; confidence: number }> = [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      arr = parsed
        .filter((e) => e && typeof e === "object")
        .map((e) => {
          const r = e as Record<string, unknown>;
          return {
            photo_index: Number(r.photo_index) || 0,
            type: str(r.type),
            confidence: Number(r.confidence) || 1,
          };
        });
    } else if (parsed && typeof parsed === "object") {
      arr = Object.entries(parsed as Record<string, unknown>).map(([k, v]) => ({
        photo_index: Number(k) || 0,
        type: str(v),
        confidence: 1,
      }));
    }
  } catch {
    /* start fresh */
  }
  arr = arr.filter((e) => e.photo_index !== slot && e.type);
  arr.push({ photo_index: slot, type: "measurement", confidence: 1 });
  return JSON.stringify(arr);
}

/**
 * Render an annotated copy of `picture_1` with the confirmed dimensions and
 * save it to a secondary slot, classified `measurement`. Optionally writes the
 * confirmed values back to the item's dimension fields.
 */
export async function renderAnnotatedImage(
  item: InventoryRecord,
  confirmed: ConfirmedDimensions,
  options: { targetSlot?: number; writeBack?: boolean; rulerReference?: string | null } = {}
): Promise<{ relativePath: string; slot: number; altText: string }> {
  const itemId = item.id;
  const heroRef = str((item as unknown as Record<string, unknown>).picture_1);
  if (!heroRef) {
    throw new DimensionError("NO_PRIMARY_PHOTO", "A primary photo is required to annotate dimensions.");
  }

  const slot = findEmptyMainSlot(item, options.targetSlot);

  const callouts: Callout[] = [];
  if (confirmed.height) callouts.push({ edge: "vertical", text: `H ${formatDual(confirmed.height, confirmed.unit)}` });
  if (confirmed.width) callouts.push({ edge: "horizontalBottom", text: `W ${formatDual(confirmed.width, confirmed.unit)}` });
  if (confirmed.length) callouts.push({ edge: "horizontalTop", text: `L ${formatDual(confirmed.length, confirmed.unit)}` });

  let outputBuffer: Buffer;
  try {
    const heroBuffer = await bufferFromReference(heroRef);
    const base = sharp(heroBuffer).rotate();
    const meta = await base.metadata();
    const flat = await base.toBuffer();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (!w || !h) throw new Error("Could not read primary photo dimensions");

    const svg = buildOverlaySvg(w, h, callouts);
    outputBuffer = await sharp(flat)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .jpeg({ quality: 88 })
      .toBuffer();
  } catch (err) {
    if (err instanceof DimensionError) throw err;
    throw new DimensionError("RENDER_FAILED", "We could not render the measurement image.");
  }

  const stored = await processAndStorePicture(itemId, slot, outputBuffer, "main");

  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`UPDATE inventory SET picture_${slot} = @path, updated_at = @now WHERE id = @id`).run({
    path: stored.relativePath,
    now,
    id: itemId,
  });

  const existingClass = str((item as unknown as Record<string, unknown>).picture_classifications);
  db.prepare("UPDATE inventory SET picture_classifications = ? WHERE id = ?").run(
    setMeasurementClassification(existingClass, slot),
    itemId
  );

  if (options.writeBack) {
    db.prepare(
      `UPDATE inventory SET item_length = @l, item_width = @w, item_height = @h,
        item_dimensions_unit = @u, updated_at = @now WHERE id = @id`
    ).run({
      l: confirmed.length,
      w: confirmed.width,
      h: confirmed.height,
      u: confirmed.unit,
      now,
      id: itemId,
    });
  }

  const altText = buildAltText(item, confirmed);
  db.prepare("UPDATE inventory SET dimension_annotation_json = ? WHERE id = ?").run(
    JSON.stringify({
      length: confirmed.length,
      width: confirmed.width,
      height: confirmed.height,
      unit: confirmed.unit,
      slot,
      alt_text: altText,
      ruler_reference: options.rulerReference ?? null,
      rendered_at: now,
    }),
    itemId
  );

  recomputeAndStoreListingPhase(itemId);

  return { relativePath: stored.relativePath, slot, altText };
}

export { VALID_UNITS, normalizeUnit, num as parsePositiveDimension };
