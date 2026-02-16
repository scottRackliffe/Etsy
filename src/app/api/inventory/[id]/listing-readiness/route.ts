/**
 * GET /api/inventory/[id]/listing-readiness
 * Returns whether an item is ready for listing-generation request.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getAllPictureReferences,
  getInventoryById,
  validateItemForListingRequest,
} from "@/lib/inventory";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { requireEtsyAccessToken } from "@/lib/auth-session";

function parseInventoryId(idParam: string): number | null {
  const parsed = Number(idParam);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const cookieStore = await cookies();
    requireEtsyAccessToken(cookieStore);

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

    const validation = validateItemForListingRequest(item);
    const pictureReferences = getAllPictureReferences(item);

    return NextResponse.json(
      {
        ok: true,
        item_id: inventoryId,
        ready: validation.ok,
        missing_fields: validation.fields,
        checks: {
          item_number: Boolean(item.item_number?.trim()),
          description: Boolean(item.description?.trim()),
          condition_code: Boolean(item.condition_code?.trim()),
          sale_revenue: item.sale_revenue != null && Number(item.sale_revenue) > 0,
          pictures: pictureReferences.length > 0,
        },
        picture_count: pictureReferences.length,
      },
      { status: 200 }
    );
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to evaluate listing readiness",
        userMessage: "We could not evaluate listing readiness.",
        actions: [
          "Refresh and try again.",
          "If this continues, verify item data and API connection.",
        ],
      })
    );
  }
}
