/**
 * POST /api/inventory/[id]/listing-quality
 * Runs the listing quality review (ADR-081 §6, ADR-082).
 *
 * WS-G2: full deterministic ADR-082 rubric. Photos §8b is a provisional
 * sub-score (flagged) until WS-G3 injects AI-vision per-photo judgment. The
 * drift block, phase transition, persistence, and activity logging are final.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getMinQualityScore } from "@/lib/settings-store";
import { getDb } from "@/lib/sqlite";
import { getInventoryById } from "@/lib/inventory";
import { computeListingPhase, setQualityPhase } from "@/lib/listing-phase";
import { evaluateListingQuality, PHOTO_AI_PENDING_REF } from "@/lib/listing-rubric";
import { evaluatePhotoQuality } from "@/lib/listing-photo-vision";
import { logActivity } from "@/lib/activity-log";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
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

    // Drift / readiness block: only evaluate a current generated listing.
    const phase = computeListingPhase(item);
    if (phase === "needs_data" || phase === "ready_to_generate") {
      const userMessage =
        phase === "needs_data"
          ? "Complete the required item data and generate a listing before evaluating quality."
          : "This item's data changed since the listing was generated. Generate the listing again before evaluating quality.";
      throw new ApiRouteError({
        status: 409,
        code: "PUBLISH_NOT_READY",
        message: "Listing quality evaluation blocked: listing not current",
        userMessage,
        actions: ["Use the listing button to generate (or regenerate) first, then evaluate quality."],
        canRetry: false,
      });
    }

    const minScore = getMinQualityScore();
    // AI per-photo vision (ADR-082 §8b); null on any failure → provisional sub-score.
    const photoQuality = (await evaluatePhotoQuality(item, id)) ?? undefined;
    const result = evaluateListingQuality(item, { minScore, itemId: id, photoQuality });

    // The AI-pending placeholder is informational and must not block readiness.
    const blocking = result.quality_remediation.filter((r) => r.ref !== PHOTO_AI_PENDING_REF);
    const ready = result.passed && blocking.length === 0;
    const listingPhase = setQualityPhase(id, ready);

    getDb()
      .prepare("UPDATE inventory SET listing_quality_json = ? WHERE id = ?")
      .run(JSON.stringify(result), id);

    logActivity({
      action: "listing.quality_evaluated",
      entityType: "inventory",
      entityId: id,
      entityLabel: item.item_number || item.description || `Item ${id}`,
      detail: { score: result.score, issue_count: blocking.length },
      source: "user",
    });

    return NextResponse.json({
      ok: true,
      ...result,
      listing_phase: listingPhase,
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to evaluate listing quality",
        userMessage: "We could not evaluate listing quality.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
