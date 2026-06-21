/**
 * POST /api/inventory/[id]/annotate-dimensions  (ADR-084 / WS-H2)
 *
 * Body (JSON): confirmed { length, width, height, unit, target_slot?, write_back? }.
 * Renders an annotated copy of picture_1 into a secondary slot (classified
 * `measurement`), optionally writes the values back to the item's dimension
 * fields, and returns the new picture path + alt text.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getDb } from "@/lib/sqlite";
import { getInventoryById } from "@/lib/inventory";
import {
  DimensionError,
  normalizeUnit,
  parsePositiveDimension,
  renderAnnotatedImage,
} from "@/lib/dimension-annotation";
import { logActivity } from "@/lib/activity-log";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const id = parsePositiveInt((await context.params).id);
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

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const confirmed = {
      length: parsePositiveDimension(body.length),
      width: parsePositiveDimension(body.width),
      height: parsePositiveDimension(body.height),
      unit: normalizeUnit(
        body.unit,
        normalizeUnit((item as unknown as Record<string, unknown>).item_dimensions_unit, "in")
      ),
    };

    if (!confirmed.length && !confirmed.width && !confirmed.height) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "No dimensions provided",
        userMessage: "Enter at least one dimension to annotate.",
        actions: ["Provide a height, width, or length and retry."],
        fields: { dimensions: ["At least one of length/width/height is required"] },
        canRetry: false,
      });
    }

    const targetSlot =
      body.target_slot === undefined || body.target_slot === null
        ? undefined
        : Number(body.target_slot);
    if (targetSlot !== undefined && (!Number.isInteger(targetSlot) || targetSlot < 2 || targetSlot > 20)) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid target slot",
        userMessage: "The measurement photo must use slot 2–20 (the hero stays clean).",
        actions: ["Choose a slot from 2 to 20."],
        fields: { target_slot: ["Must be between 2 and 20"] },
        canRetry: false,
      });
    }

    let result;
    try {
      result = await renderAnnotatedImage(item, confirmed, {
        targetSlot,
        writeBack: body.write_back === true,
      });
    } catch (err) {
      if (err instanceof DimensionError) {
        const status = err.code === "NO_EMPTY_SLOT" ? 409 : err.code === "RENDER_FAILED" ? 500 : 400;
        throw new ApiRouteError({
          status,
          code: status === 409 ? "REFERENTIAL_INTEGRITY" : "VALIDATION_ERROR",
          message: err.message,
          userMessage: err.message,
          actions:
            err.code === "NO_EMPTY_SLOT"
              ? ["Remove a picture to free a slot, then retry."]
              : ["Check the primary photo and retry."],
          canRetry: err.code === "RENDER_FAILED",
        });
      }
      throw err;
    }

    const updated = getDb().prepare("SELECT * FROM inventory WHERE id = ?").get(id);

    logActivity({
      action: "inventory.dimensions_annotated",
      entityType: "inventory",
      entityId: id,
      entityLabel: item.item_number || item.description || `Item ${id}`,
      detail: {
        length: confirmed.length,
        width: confirmed.width,
        height: confirmed.height,
        unit: confirmed.unit,
        slot: result.slot,
      },
      source: "user",
    });

    return NextResponse.json({
      ok: true,
      slot: result.slot,
      picture_path: result.relativePath,
      alt_text: result.altText,
      item: updated,
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to annotate dimensions",
        userMessage: "We could not create the measurement photo.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
