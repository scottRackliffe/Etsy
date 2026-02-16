import crypto from "node:crypto";
import { getDb } from "@/lib/sqlite";

function toStableJson(value: unknown): string {
  return JSON.stringify(value);
}

export function computePreviewHash(payload: unknown): string {
  return crypto.createHash("sha256").update(toStableJson(payload)).digest("hex");
}

export function savePublishPreview(params: {
  inventoryId: number;
  previewHash: string;
  payload: unknown;
}): { created_at: string } {
  const createdAt = new Date().toISOString();
  getDb()
    .prepare(
      `
      INSERT INTO listing_publish_previews(inventory_id, preview_hash, payload_json, created_at)
      VALUES(@inventory_id, @preview_hash, @payload_json, @created_at)
    `
    )
    .run({
      inventory_id: params.inventoryId,
      preview_hash: params.previewHash,
      payload_json: JSON.stringify(params.payload),
      created_at: createdAt,
    });
  return { created_at: createdAt };
}

export function getLatestPublishPreview(inventoryId: number): {
  preview_hash: string;
  payload_json: string;
  created_at: string;
} | null {
  const row = getDb()
    .prepare(
      `
      SELECT preview_hash, payload_json, created_at
      FROM listing_publish_previews
      WHERE inventory_id = ?
      ORDER BY id DESC
      LIMIT 1
    `
    )
    .get(inventoryId) as
    | {
        preview_hash: string;
        payload_json: string;
        created_at: string;
      }
    | undefined;
  return row ?? null;
}

export function getRecentPublishPreviews(
  inventoryId: number,
  limit = 10
): Array<{
  preview_hash: string;
  payload_json: string;
  created_at: string;
}> {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.floor(limit))) : 10;
  return getDb()
    .prepare(
      `
      SELECT preview_hash, payload_json, created_at
      FROM listing_publish_previews
      WHERE inventory_id = ?
      ORDER BY id DESC
      LIMIT ?
    `
    )
    .all(inventoryId, safeLimit) as Array<{
    preview_hash: string;
    payload_json: string;
    created_at: string;
  }>;
}
