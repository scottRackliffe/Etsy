import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { computeListingScore } from "@/lib/listing-score";
import { getMinQualityScore } from "@/lib/settings-store";
import { getInventory } from "@/lib/records";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const id = parsePositiveInt((await context.params).id);
    if (!id) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid inventory id",
        userMessage: "The inventory id must be a positive integer.",
        actions: ["Check the item URL and retry."],
        fields: { id: ["Must be a positive integer"] },
        canRetry: false,
      });
    }

    const item = getInventory(id) as Record<string, unknown> | undefined;
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

    const minScore = getMinQualityScore();
    const result = computeListingScore(item, minScore);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to compute listing score",
        userMessage: "We could not compute the listing quality score.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
