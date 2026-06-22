/**
 * POST /api/inventory/[id]/listing-video
 * Thin wrapper over generateListingVideo() (ADR-085 §3, WS-L3).
 * Reads photos from the inventory record; no body required.
 */
import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { generateListingVideo } from "@/lib/video-generator";
import { getDb } from "@/lib/sqlite";
import { logActivity } from "@/lib/activity-log";

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireEtsyAccessToken(await cookies());

    const { id } = await params;
    const inventoryId = parseId(id);
    if (!inventoryId) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid inventory id",
        userMessage: "Invalid item ID.",
        actions: ["Retry with a valid item ID."],
        canRetry: false,
      });
    }

    const db = getDb();
    const item = db
      .prepare("SELECT * FROM inventory WHERE id = ?")
      .get(inventoryId) as Record<string, unknown> | undefined;
    if (!item) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Item not found",
        userMessage: "Item not found.",
        actions: [],
        canRetry: false,
      });
    }

    // Collect photo paths from inventory record
    const photoPaths: string[] = [];
    for (let i = 1; i <= 20; i++) {
      const picPath = item[`picture_${i}`];
      if (typeof picPath === "string" && picPath.trim()) {
        const fullPath = path.join(process.cwd(), picPath);
        if (fs.existsSync(fullPath)) photoPaths.push(fullPath);
      }
    }
    for (let i = 1; i <= 5; i++) {
      const condPath = item[`condition_picture_${i}`];
      if (typeof condPath === "string" && condPath.trim()) {
        const fullPath = path.join(process.cwd(), condPath);
        if (fs.existsSync(fullPath)) photoPaths.push(fullPath);
      }
    }

    if (photoPaths.length === 0) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "No photos found for this item",
        userMessage: "This item has no photos to generate a video from.",
        actions: ["Add at least one photo first, then try again."],
        canRetry: false,
      });
    }

    const videoDir = path.join(
      process.cwd(),
      "uploads",
      "inventory",
      String(inventoryId),
      "video"
    );
    fs.mkdirSync(videoDir, { recursive: true });
    const outputPath = path.join(videoDir, "listing-video.mp4");

    // Use stored picture classifications if available
    let classifications:
      | Array<{ photo_index: number; type: string; confidence: number }>
      | undefined;
    const stored = item.picture_classifications;
    if (typeof stored === "string" && stored.trim()) {
      try {
        classifications = JSON.parse(stored) as typeof classifications;
      } catch {
        /* ignore */
      }
    }

    const result = await generateListingVideo({ photoPaths, classifications, outputPath });

    const relativePath = path.relative(process.cwd(), result.videoPath);
    db.prepare(
      "UPDATE inventory SET video_path = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(relativePath, inventoryId);

    logActivity({
      action: "listing.video_generated",
      entityType: "inventory",
      entityId: inventoryId,
      entityLabel:
        (item.item_number as string | undefined) || `Item ${inventoryId}`,
      source: "user",
    });

    return NextResponse.json({
      ok: true,
      video_path: relativePath,
      duration_seconds: result.durationSeconds,
      photo_count: result.photoCount,
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "VIDEO_GENERATION_FAILED",
        message: "Failed to generate listing video",
        userMessage: "We could not generate the listing video.",
        actions: ["Try again in a moment."],
      })
    );
  }
}
