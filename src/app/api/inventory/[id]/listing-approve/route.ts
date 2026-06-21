import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { logActivity } from "@/lib/activity-log";
import { getInventoryById, validateItemForListingRequest } from "@/lib/inventory";
import { getDb } from "@/lib/sqlite";
import { computeListingScore } from "@/lib/listing-score";
import { getMinQualityScore } from "@/lib/settings-store";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
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
    const item = getInventoryById(id);
    if (!item) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Inventory item not found",
        userMessage: "The selected inventory item was not found.",
        actions: ["Refresh and retry."],
        canRetry: false,
      });
    }
    const readiness = validateItemForListingRequest(item);
    if (!readiness.ok) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Approval blocked by readiness requirements",
        userMessage: "Complete required item data before approval.",
        actions: ["Fix missing fields and retry approval."],
        fields: readiness.fields,
        canRetry: false,
      });
    }
    if (!item.listing_title || !item.listing_description || !item.listing_tags) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Approval blocked by missing listing draft content",
        userMessage: "Draft title, description, and tags are required before approval.",
        actions: ["Generate, import, or complete manual fields then retry."],
        canRetry: false,
      });
    }
    const minScore = getMinQualityScore();
    if (minScore > 0) {
      const scoreResult = computeListingScore(item, minScore);
      if (scoreResult.score < minScore) {
        throw new ApiRouteError({
          status: 400,
          code: "QUALITY_SCORE_TOO_LOW",
          message: `Listing quality score ${scoreResult.score} is below the minimum ${minScore}`,
          userMessage: `This listing's quality score is ${scoreResult.score}/100 — the minimum for approval is ${minScore}. Improve the listing or use AI to boost the score.`,
          actions: [
            ...scoreResult.tips,
            "Or use the 'Improve with AI' button to automatically enhance weak areas.",
          ],
          canRetry: true,
        });
      }
    }
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `
      UPDATE inventory
      SET listing_draft_state = 'approved', listing_approved_at = @approved_at, updated_at = @updated_at
      WHERE id = @id
    `
      )
      .run({ id, approved_at: now, updated_at: now });
    logActivity({
      action: "listing.approved",
      entityType: "inventory",
      entityId: id,
      entityLabel: item.item_number || item.description || `Item ${id}`,
      source: "user",
    });

    const updated = getInventoryById(id);
    return NextResponse.json({ ok: true, item: updated });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to approve listing draft",
        userMessage: "We could not approve this listing draft.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
