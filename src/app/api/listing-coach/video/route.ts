import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { generateListingVideo } from "@/lib/video-generator";
import { getDb } from "@/lib/sqlite";

export async function POST(request: Request) {
  try {
    requireEtsyAccessToken(await cookies());

    const body = (await request.json()) as {
      item_id: number;
      photo_paths?: string[];
      classifications?: Array<{ photo_index: number; type: string; confidence: number }>;
    };

    const itemId = body.item_id;
    if (!itemId || typeof itemId !== "number") {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "item_id is required" } },
        { status: 400 }
      );
    }

    const db = getDb();
    const item = db.prepare("SELECT * FROM inventory WHERE id = ?").get(itemId) as Record<
      string,
      unknown
    > | undefined;

    if (!item) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Item not found" } },
        { status: 404 }
      );
    }

    let photoPaths: string[] = body.photo_paths ?? [];

    if (photoPaths.length === 0) {
      for (let i = 1; i <= 20; i++) {
        const picPath = item[`picture_${i}`];
        if (typeof picPath === "string" && picPath.trim()) {
          const fullPath = path.join(process.cwd(), picPath);
          if (fs.existsSync(fullPath)) {
            photoPaths.push(fullPath);
          }
        }
      }
      for (let i = 1; i <= 5; i++) {
        const condPath = item[`condition_picture_${i}`];
        if (typeof condPath === "string" && condPath.trim()) {
          const fullPath = path.join(process.cwd(), condPath);
          if (fs.existsSync(fullPath)) {
            photoPaths.push(fullPath);
          }
        }
      }
    }

    if (photoPaths.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "No photos found for this item",
            user_message: "This item has no photos to generate a video from.",
          },
        },
        { status: 400 }
      );
    }

    const videoDir = path.join(process.cwd(), "uploads", "inventory", String(itemId), "video");
    fs.mkdirSync(videoDir, { recursive: true });
    const outputPath = path.join(videoDir, "listing-video.mp4");

    let classificationsRaw = body.classifications;
    if (!classificationsRaw) {
      const stored = item.picture_classifications;
      if (typeof stored === "string" && stored.trim()) {
        try {
          classificationsRaw = JSON.parse(stored);
        } catch {
          /* ignore */
        }
      }
    }

    const result = await generateListingVideo({
      photoPaths,
      classifications: classificationsRaw,
      outputPath,
    });

    const relativePath = path.relative(process.cwd(), result.videoPath);
    db.prepare("UPDATE inventory SET video_path = ?, updated_at = datetime('now') WHERE id = ?").run(
      relativePath,
      itemId
    );

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
