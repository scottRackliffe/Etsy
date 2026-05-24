/**
 * POST /api/inventory/[id]/pictures
 *
 * Upload a picture to a specific slot. Accepts either:
 * - multipart/form-data with `file` field and `slot` field
 * - JSON with `slot` and `path` (URL or local path reference)
 *
 * Processes image per ADR-026: validates type/size/dimensions,
 * resizes if needed, stores to canonical path, generates thumbnail.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getDb } from "@/lib/sqlite";
import {
  processAndStorePicture,
  generateThumbnail,
  validateImageBuffer,
} from "@/lib/picture-storage";

function validateSlot(slot: number): void {
  if (!Number.isInteger(slot) || slot < 1 || slot > 10) {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid picture slot",
      userMessage: "Picture slot must be between 1 and 10.",
      actions: ["Choose a slot from 1 to 10 and retry."],
      fields: { slot: ["Must be between 1 and 10"] },
      canRetry: false,
    });
  }
}

async function getInventoryId(context: { params: Promise<{ id: string }> }): Promise<number> {
  const id = parsePositiveInt((await context.params).id);
  if (!id) {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid inventory id",
      userMessage: "Inventory id must be a positive integer.",
      actions: ["Check the URL and retry."],
      fields: { id: ["Must be a positive integer"] },
      canRetry: false,
    });
  }
  return id;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const inventoryId = await getInventoryId(context);

    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      // File upload via FormData
      const formData = await request.formData();
      const slotRaw = formData.get("slot");
      const file = formData.get("file");

      const slot = Number(slotRaw);
      validateSlot(slot);

      if (!file || !(file instanceof File)) {
        throw new ApiRouteError({
          status: 400,
          code: "VALIDATION_ERROR",
          message: "No file provided",
          userMessage: "An image file is required.",
          actions: ["Select an image file and retry."],
          fields: { file: ["Required"] },
          canRetry: false,
        });
      }

      const buffer = Buffer.from(await file.arrayBuffer());

      // Validate before processing
      const validation = await validateImageBuffer(buffer, file.name);
      if (Array.isArray(validation)) {
        throw new ApiRouteError({
          status: 400,
          code: "VALIDATION_ERROR",
          message: validation[0]?.message ?? "Invalid image",
          userMessage: validation[0]?.message ?? "The image could not be processed.",
          actions: ["Check the file and retry."],
          canRetry: false,
        });
      }

      const result = await processAndStorePicture(inventoryId, slot, buffer, "main");

      // Update DB
      const column = `picture_${slot}`;
      const db = getDb();
      db.prepare(
        `UPDATE inventory SET ${column} = @path, updated_at = @updated_at WHERE id = @id`
      ).run({
        path: result.relativePath,
        updated_at: new Date().toISOString(),
        id: inventoryId,
      });

      // Regenerate thumbnail if slot 1 changed or no thumbnail exists
      await generateThumbnail(inventoryId);

      const item = db.prepare("SELECT * FROM inventory WHERE id = ?").get(inventoryId);
      return NextResponse.json({ ok: true, item });
    }

    // JSON path reference (URL or local path)
    const body = (await request.json().catch(() => ({}))) as { slot?: unknown; path?: unknown };
    const slot = Number(body.slot);
    const picturePath = typeof body.path === "string" ? body.path.trim() : "";

    validateSlot(slot);

    if (!picturePath) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid picture path",
        userMessage: "Picture path is required.",
        actions: ["Provide picture path and retry."],
        fields: { path: ["Required"] },
        canRetry: false,
      });
    }

    // If it's a local file path, read and process it
    if (!/^https?:\/\//i.test(picturePath)) {
      const fs = await import("node:fs/promises");
      const nodePath = await import("node:path");
      const absPath = nodePath.default.isAbsolute(picturePath)
        ? picturePath
        : nodePath.default.join(process.cwd(), picturePath);

      try {
        const buffer = await fs.readFile(absPath);
        const validation = await validateImageBuffer(buffer, picturePath);
        if (Array.isArray(validation)) {
          throw new ApiRouteError({
            status: 400,
            code: "VALIDATION_ERROR",
            message: validation[0]?.message ?? "Invalid image",
            userMessage: validation[0]?.message ?? "The image could not be processed.",
            actions: ["Check the file and retry."],
            canRetry: false,
          });
        }

        const result = await processAndStorePicture(inventoryId, slot, buffer, "main");
        const column = `picture_${slot}`;
        const db = getDb();
        db.prepare(
          `UPDATE inventory SET ${column} = @path, updated_at = @updated_at WHERE id = @id`
        ).run({
          path: result.relativePath,
          updated_at: new Date().toISOString(),
          id: inventoryId,
        });
        await generateThumbnail(inventoryId);
        const item = db.prepare("SELECT * FROM inventory WHERE id = ?").get(inventoryId);
        return NextResponse.json({ ok: true, item });
      } catch (err) {
        if (err instanceof ApiRouteError) throw err;
        throw new ApiRouteError({
          status: 400,
          code: "VALIDATION_ERROR",
          message: `Could not read file: ${picturePath}`,
          userMessage: "The file could not be found or read.",
          actions: ["Check the file path and retry."],
          canRetry: false,
        });
      }
    }

    // URL reference — store directly in DB without local processing
    const column = `picture_${slot}`;
    const db = getDb();
    db.prepare(
      `UPDATE inventory SET ${column} = @path, updated_at = @updated_at WHERE id = @id`
    ).run({
      path: picturePath,
      updated_at: new Date().toISOString(),
      id: inventoryId,
    });
    await generateThumbnail(inventoryId);
    const item = db.prepare("SELECT * FROM inventory WHERE id = ?").get(inventoryId);
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to add picture",
        userMessage: "We could not attach the picture to this item.",
        actions: ["Retry in a moment.", "Check picture path and retry."],
      })
    );
  }
}
