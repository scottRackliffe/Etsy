/**
 * Picture storage and thumbnail generation (ADR-026)
 *
 * Handles validation, processing, storage, and thumbnail generation
 * for inventory pictures and condition pictures.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getDb } from "@/lib/sqlite";
import { getSetting } from "@/lib/settings-store";

const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "gif"]);
const FORMAT_TO_EXT: Record<string, string> = {
  jpeg: ".jpg",
  png: ".png",
  webp: ".webp",
  gif: ".gif",
};
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const MAX_DIMENSION = 4000;
const MIN_DIMENSION = 50;
const JPEG_QUALITY = 85;
const TARGET_DPI = 300;

const THUMBNAIL_QUALITY = 80;
const DEFAULT_THUMBNAIL_SIZE = 200;
const MIN_THUMBNAIL_SIZE = 100;
const MAX_THUMBNAIL_SIZE = 400;

export function getUploadsRootDir(): string {
  return getUploadsRoot();
}

function getUploadsRoot(): string {
  return process.env.UPLOADS_PATH || path.join(process.cwd(), "uploads");
}

function getItemDir(itemId: number): string {
  return path.join(getUploadsRoot(), "inventory", String(itemId));
}

function getPicturesDir(itemId: number): string {
  return path.join(getItemDir(itemId), "pictures");
}

function getConditionDir(itemId: number): string {
  return path.join(getItemDir(itemId), "condition");
}

function getThumbnailPath(itemId: number): string {
  return path.join(getItemDir(itemId), "thumbnail.jpg");
}

function getThumbnailSize(): number {
  const raw = getSetting("thumbnail_size");
  if (!raw) return DEFAULT_THUMBNAIL_SIZE;
  const val = parseInt(raw, 10);
  if (isNaN(val)) return DEFAULT_THUMBNAIL_SIZE;
  return Math.max(MIN_THUMBNAIL_SIZE, Math.min(MAX_THUMBNAIL_SIZE, val));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ValidationError = {
  slot: number;
  message: string;
};

export async function validateImageBuffer(
  buffer: Buffer,
  filename: string
): Promise<{ format: string; width: number; height: number } | ValidationError[]> {
  if (buffer.length > MAX_FILE_SIZE) {
    return [
      { slot: 0, message: `${filename}: Image exceeds 15 MB limit. Please use a smaller file.` },
    ];
  }

  try {
    const metadata = await sharp(buffer).metadata();
    if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
      return [
        {
          slot: 0,
          message: `${filename}: Unsupported image format. Please use JPEG, PNG, WebP, or GIF.`,
        },
      ];
    }
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
      return [
        {
          slot: 0,
          message: `${filename}: Image is too small (minimum 50×50 pixels).`,
        },
      ];
    }
    return { format: metadata.format, width, height };
  } catch {
    return [{ slot: 0, message: `${filename}: Could not read image file. It may be corrupt.` }];
  }
}

// ---------------------------------------------------------------------------
// Process and store a single picture
// ---------------------------------------------------------------------------

export async function processAndStorePicture(
  itemId: number,
  slot: number,
  buffer: Buffer,
  type: "main" | "condition" = "main"
): Promise<{ relativePath: string; format: string }> {
  const meta = await validateImageBuffer(buffer, `slot ${slot}`);
  if (Array.isArray(meta)) {
    throw new Error(meta[0]?.message ?? "Invalid image");
  }

  const dir = type === "main" ? getPicturesDir(itemId) : getConditionDir(itemId);
  await fsp.mkdir(dir, { recursive: true });

  const ext = FORMAT_TO_EXT[meta.format] ?? ".jpg";
  const filePath = path.join(dir, `${slot}${ext}`);

  // Remove existing file for this slot (collision handling)
  await removeSlotFile(dir, slot);

  // Process with Sharp: resize if needed, set DPI metadata
  let pipeline = sharp(buffer).rotate();

  if (meta.width > MAX_DIMENSION || meta.height > MAX_DIMENSION) {
    pipeline = pipeline.resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  if (meta.format === "jpeg") {
    pipeline = pipeline
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .withMetadata({ density: TARGET_DPI });
  } else if (meta.format === "png") {
    pipeline = pipeline.png({ compressionLevel: 9 }).withMetadata({ density: TARGET_DPI });
  } else if (meta.format === "webp") {
    pipeline = pipeline.webp({ quality: JPEG_QUALITY }).withMetadata({ density: TARGET_DPI });
  } else if (meta.format === "gif") {
    pipeline = pipeline.gif().withMetadata({ density: TARGET_DPI });
  }

  await pipeline.toFile(filePath);

  const relativePath = path.relative(process.cwd(), filePath);
  return { relativePath, format: meta.format };
}

// ---------------------------------------------------------------------------
// Thumbnail generation (ADR-026 §5)
// ---------------------------------------------------------------------------

export async function generateThumbnail(itemId: number): Promise<string | null> {
  const db = getDb();
  const item = db.prepare("SELECT * FROM inventory WHERE id = ?").get(itemId) as
    | Record<string, unknown>
    | undefined;
  if (!item) return null;

  // Find first non-null picture slot
  let sourcePath: string | null = null;
  for (let i = 1; i <= 10; i++) {
    const val = item[`picture_${i}`] as string | null;
    if (val && typeof val === "string" && val.trim()) {
      sourcePath = val.trim();
      break;
    }
  }

  const thumbnailFile = getThumbnailPath(itemId);

  if (!sourcePath) {
    // No pictures — remove thumbnail
    try {
      await fsp.unlink(thumbnailFile);
    } catch {
      // Already gone
    }
    db.prepare("UPDATE inventory SET thumbnail_path = NULL, updated_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      itemId
    );
    return null;
  }

  // Resolve source path (could be absolute, relative, or URL)
  if (/^https?:\/\//i.test(sourcePath)) {
    // URL-based picture — fetch and generate thumbnail
    try {
      const res = await fetch(sourcePath);
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return await writeThumbnailFromBuffer(buf, itemId, thumbnailFile);
    } catch {
      return null;
    }
  }

  const absolutePath = path.isAbsolute(sourcePath)
    ? sourcePath
    : path.join(process.cwd(), sourcePath);

  if (!fs.existsSync(absolutePath)) return null;

  const buf = await fsp.readFile(absolutePath);
  return writeThumbnailFromBuffer(buf, itemId, thumbnailFile);
}

async function writeThumbnailFromBuffer(
  buffer: Buffer,
  itemId: number,
  thumbnailFile: string
): Promise<string | null> {
  const size = getThumbnailSize();
  const dir = path.dirname(thumbnailFile);
  await fsp.mkdir(dir, { recursive: true });

  try {
    await sharp(buffer)
      .resize(size, size, { fit: "cover", position: "centre" })
      .jpeg({ quality: THUMBNAIL_QUALITY })
      .toFile(thumbnailFile);

    const relativePath = path.relative(process.cwd(), thumbnailFile);
    const db = getDb();
    db.prepare("UPDATE inventory SET thumbnail_path = ?, updated_at = ? WHERE id = ?").run(
      relativePath,
      new Date().toISOString(),
      itemId
    );
    return relativePath;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Remove a picture from a slot (ADR-026 §7)
// ---------------------------------------------------------------------------

export async function removePicture(
  itemId: number,
  slot: number,
  type: "main" | "condition" = "main"
): Promise<void> {
  const dir = type === "main" ? getPicturesDir(itemId) : getConditionDir(itemId);
  await removeSlotFile(dir, slot);

  const column = type === "main" ? `picture_${slot}` : `condition_picture_${slot}`;
  const db = getDb();
  db.prepare(`UPDATE inventory SET ${column} = NULL, updated_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    itemId
  );

  if (type === "main") {
    await generateThumbnail(itemId);
  }
}

async function removeSlotFile(dir: string, slot: number): Promise<void> {
  for (const ext of Object.values(FORMAT_TO_EXT)) {
    const filePath = path.join(dir, `${slot}${ext}`);
    try {
      await fsp.unlink(filePath);
    } catch {
      // File doesn't exist — fine
    }
  }
}

// ---------------------------------------------------------------------------
// Reorder pictures (ADR-026 §6)
// ---------------------------------------------------------------------------

export async function reorderPictures(itemId: number, newOrder: (string | null)[]): Promise<void> {
  const db = getDb();
  const dir = getPicturesDir(itemId);
  const now = new Date().toISOString();

  // Step 1: Rename existing files to tmp_ to avoid collisions
  const existingFiles: { slot: number; tmpPath: string; originalPath: string }[] = [];
  for (let i = 0; i < 10; i++) {
    const slotValue = newOrder[i];
    if (!slotValue || /^https?:\/\//i.test(slotValue)) continue;

    const absPath = path.isAbsolute(slotValue) ? slotValue : path.join(process.cwd(), slotValue);

    if (fs.existsSync(absPath)) {
      const ext = path.extname(absPath);
      const tmpPath = path.join(dir, `tmp_${i + 1}${ext}`);
      try {
        await fsp.copyFile(absPath, tmpPath);
        existingFiles.push({ slot: i + 1, tmpPath, originalPath: absPath });
      } catch {
        // Skip files that can't be copied
      }
    }
  }

  // Step 2: Remove old files
  for (let slot = 1; slot <= 10; slot++) {
    await removeSlotFile(dir, slot);
  }

  // Step 3: Move tmp files to final slot positions
  for (const { slot, tmpPath } of existingFiles) {
    const ext = path.extname(tmpPath);
    const finalPath = path.join(dir, `${slot}${ext}`);
    try {
      await fsp.rename(tmpPath, finalPath);
    } catch {
      // Best effort
    }
  }

  // Step 4: Update DB columns
  const params: Record<string, unknown> = { id: itemId, updated_at: now };
  const updates: string[] = [];
  for (let i = 0; i < 10; i++) {
    const key = `picture_${i + 1}`;
    const val = newOrder[i];
    params[key] = typeof val === "string" && val.trim() ? val.trim() : null;
    updates.push(`${key} = @${key}`);
  }
  db.prepare(
    `UPDATE inventory SET ${updates.join(", ")}, updated_at = @updated_at WHERE id = @id`
  ).run(params);

  // Step 5: Regenerate thumbnail from new picture_1
  await generateThumbnail(itemId);
}

// ---------------------------------------------------------------------------
// Cleanup on item delete (ADR-026 §9)
// ---------------------------------------------------------------------------

export async function cleanupItemUploads(itemId: number): Promise<void> {
  const dir = getItemDir(itemId);
  try {
    await fsp.rm(dir, { recursive: true, force: true });
  } catch {
    // Directory may not exist
  }
}

// ---------------------------------------------------------------------------
// Batch thumbnail regeneration (ADR-026 §5)
// ---------------------------------------------------------------------------

export async function regenerateAllThumbnails(): Promise<{ processed: number; errors: number }> {
  const db = getDb();
  const items = db
    .prepare("SELECT id FROM inventory WHERE picture_1 IS NOT NULL OR picture_2 IS NOT NULL")
    .all() as Array<{ id: number }>;

  let processed = 0;
  let errors = 0;

  for (const item of items) {
    try {
      await generateThumbnail(item.id);
      processed++;
    } catch {
      errors++;
    }
  }

  return { processed, errors };
}
