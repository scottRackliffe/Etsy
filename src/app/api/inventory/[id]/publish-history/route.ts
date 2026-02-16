import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/sqlite";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { getInventoryById } from "@/lib/inventory";
import { parsePagination } from "@/lib/api-utils";
import { getRecentPublishPreviews } from "@/lib/listing-review";

function parseInventoryId(idParam: string): number | null {
  const parsed = Number(idParam);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());

    const params = await context.params;
    const inventoryId = parseInventoryId(params.id);
    if (!inventoryId) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid inventory id",
        userMessage: "The selected item id is invalid.",
        actions: ["Refresh and select the item again."],
        fields: { id: ["Must be a positive integer"] },
        canRetry: false,
      });
    }

    const item = getInventoryById(inventoryId);
    if (!item) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Inventory item not found",
        userMessage: "The selected item was not found.",
        actions: ["Refresh inventory and select another item."],
        canRetry: false,
      });
    }

    const { limit } = parsePagination(new URL(request.url).searchParams);
    const db = getDb();
    const previews = getRecentPublishPreviews(inventoryId, limit).map((row) => ({
      preview_hash: row.preview_hash,
      created_at: row.created_at,
      payload_preview: parseJson(row.payload_json),
    }));
    const imports = db
      .prepare(
        `
          SELECT id, export_id, source_label, created_at
          FROM listing_imports
          WHERE inventory_id = ?
          ORDER BY id DESC
          LIMIT ?
        `
      )
      .all(inventoryId, limit) as Array<{
      id: number;
      export_id: string | null;
      source_label: string | null;
      created_at: string;
    }>;
    const exports = db
      .prepare(
        `
          SELECT export_id, created_at
          FROM listing_exports
          WHERE inventory_id = ?
          ORDER BY id DESC
          LIMIT ?
        `
      )
      .all(inventoryId, limit) as Array<{ export_id: string; created_at: string }>;

    return NextResponse.json({
      ok: true,
      item: {
        id: item.id,
        listing_draft_state: item.listing_draft_state,
        listing_approved_at: item.listing_approved_at,
        listing_published_at: item.listing_published_at,
        is_listed: item.is_listed,
        etsy_listing_id: item.etsy_listing_id,
      },
      previews,
      imports,
      exports,
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load publish history",
        userMessage: "We could not load publish history for this item.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
