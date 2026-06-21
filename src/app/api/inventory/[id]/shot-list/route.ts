/**
 * GET  /api/inventory/[id]/shot-list  — read the saved shot list (captured flags refreshed).
 * POST /api/inventory/[id]/shot-list  — generate (or regenerate) the shot list via AI.
 *
 * ADR-083 / WS-H1. Persisted in inventory.shot_list_json.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getDb } from "@/lib/sqlite";
import { getInventoryById } from "@/lib/inventory";
import { generateShotList, getSavedShotList, ShotListError } from "@/lib/shot-list";
import { logActivity } from "@/lib/activity-log";

function loadItemOrThrow(id: number | null) {
  if (!id) {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid inventory id",
      userMessage: "The inventory id must be a positive integer.",
      actions: ["Check the item and retry."],
      fields: { id: ["Must be a positive integer"] },
      canRetry: false,
    });
  }
  const item = getInventoryById(id);
  if (!item) {
    throw new ApiRouteError({
      status: 404,
      code: "NOT_FOUND",
      message: "Inventory item not found",
      userMessage: "The requested inventory item was not found.",
      actions: ["Refresh inventory and select another item."],
      canRetry: false,
    });
  }
  return item;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const id = parsePositiveInt((await context.params).id);
    const item = loadItemOrThrow(id);
    return NextResponse.json({ ok: true, shot_list: getSavedShotList(item) });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to read shot list",
        userMessage: "We could not load the shot list.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const id = parsePositiveInt((await context.params).id);
    const item = loadItemOrThrow(id);

    let shotList;
    try {
      shotList = await generateShotList(item);
    } catch (err) {
      if (err instanceof ShotListError) {
        if (err.code === "AI_NOT_CONFIGURED") {
          throw new ApiRouteError({
            status: 400,
            code: "AI_NOT_CONFIGURED",
            message: "AI is not configured",
            userMessage: "Add an AI API key in Settings to generate a shot list.",
            actions: ["Open Settings → AI and add an API key."],
            canRetry: false,
          });
        }
        if (err.code === "NO_PRIMARY_PHOTO") {
          throw new ApiRouteError({
            status: 400,
            code: "VALIDATION_ERROR",
            message: "No primary photo",
            userMessage: "Add a primary photo before generating a shot list.",
            actions: ["Upload at least one photo, then try again."],
            canRetry: false,
          });
        }
        throw new ApiRouteError({
          status: 502,
          code: "LISTING_GENERATION_FAILED",
          message: "Shot-list generation failed",
          userMessage: "We could not generate a shot list right now.",
          actions: ["Try again in a moment.", "Verify AI configuration if this keeps failing."],
          canRetry: true,
        });
      }
      throw err;
    }

    getDb()
      .prepare("UPDATE inventory SET shot_list_json = ? WHERE id = ?")
      .run(JSON.stringify(shotList), id!);

    logActivity({
      action: "listing.shot_list_generated",
      entityType: "inventory",
      entityId: id!,
      entityLabel: item.item_number || item.description || `Item ${id}`,
      detail: { shot_count: shotList.length },
      source: "user",
    });

    return NextResponse.json({ ok: true, shot_list: shotList });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "LISTING_GENERATION_FAILED",
        message: "Failed to generate shot list",
        userMessage: "We could not generate a shot list.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
