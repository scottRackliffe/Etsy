/**
 * POST /api/inventory/[id]/listing-remediation-cycle
 *
 * One user-observed remediation pass (ADR-089). The scoring engine names what is
 * wrong (ADR-082 deterministic rubric); the AI fixes the AI-fixable items in a
 * single global refine; we re-score and return the score delta + remaining items.
 * The UI drives this with three controls: Stop / Cycle again (tier="standard") /
 * Advance AI (tier="premium" → uses ai.premium_model when configured, ADR-086 §1a).
 *
 * Only listing OUTPUT fields (+ price) are auto-applied — never ADR-081 hash
 * inputs — so a cycle improves the listing in place without causing drift.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getMinQualityScore, getSetting } from "@/lib/settings-store";
import { getAiConfig } from "@/lib/ai-config";
import { getDb } from "@/lib/sqlite";
import { getInventoryById } from "@/lib/inventory";
import { computeListingPhase, setQualityPhase } from "@/lib/listing-phase";
import {
  evaluateListingQuality,
  PHOTO_AI_PENDING_REF,
  type QualityRemediationItem,
} from "@/lib/listing-rubric";
import { refineListing } from "@/lib/listing-ai";
import { logActivity } from "@/lib/activity-log";

/** Rubric refs the AI can fix by rewriting listing text/price (the cycle targets these). */
const AI_FIXABLE_REFS = new Set(["listing_title", "listing_description", "listing_tags", "sale_revenue"]);

/**
 * Refine output field → inventory column. Only listing OUTPUT fields and price are
 * applied (none are ADR-081 `HASH_FIELDS`, so applying them never triggers drift).
 * condition_notes / identification are deliberately NOT applied (hash inputs / user-owned facts).
 */
const APPLY_COLUMN_MAP: Record<string, string> = {
  listing_title: "listing_title",
  listing_description: "listing_description",
  listing_tags: "listing_tags",
  listing_category_path: "listing_category_path",
  listing_title_strategy: "listing_title_strategy",
  listing_product_story: "listing_product_story",
  listing_condition_clarity: "listing_condition_clarity",
  listing_attributes: "listing_attributes",
  listing_pricing_shipping_notes: "listing_pricing_shipping_notes",
  listing_quality_checklist: "listing_quality_checklist",
  sale_price: "sale_revenue",
};

function isUserAction(item: QualityRemediationItem): boolean {
  return !AI_FIXABLE_REFS.has(item.ref);
}

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

    const body = (await request.json().catch(() => ({}))) as { tier?: unknown };
    const tier: "standard" | "premium" = body.tier === "premium" ? "premium" : "standard";

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

    // Only run on a current, generated listing (same gate as Evaluate Quality).
    const phase = computeListingPhase(item);
    if (phase === "needs_data" || phase === "ready_to_generate") {
      throw new ApiRouteError({
        status: 409,
        code: "PUBLISH_NOT_READY",
        message: "Remediation cycle blocked: listing not current",
        userMessage:
          phase === "needs_data"
            ? "Complete the required item data and generate a listing before running a remediation cycle."
            : "This item's data changed since the listing was generated. Generate the listing again first.",
        actions: ["Generate (or regenerate) the listing, then run a cycle."],
        canRetry: false,
      });
    }

    const minScore = getMinQualityScore();

    // 1) Score BEFORE (deterministic — free; photo AI sub-score is unaffected by text refine).
    const before = evaluateListingQuality(item, { minScore, itemId: id });
    const beforeScore = before.score;

    // 2) Partition the remediation list.
    const actionable = before.quality_remediation.filter((r) => r.ref !== PHOTO_AI_PENDING_REF);
    const aiFixable = actionable.filter((r) => AI_FIXABLE_REFS.has(r.ref));
    const userActionItems = actionable.filter(isUserAction);

    // Nothing the AI can do this pass — hand back to the user (photos / data).
    if (aiFixable.length === 0) {
      return NextResponse.json({
        ok: true,
        tier,
        no_ai_action: true,
        previous_score: beforeScore,
        new_score: beforeScore,
        delta: 0,
        improved: false,
        passed: before.passed,
        remediation: before.quality_remediation,
        user_action_items: userActionItems,
        applied_fields: [],
        message:
          "Nothing left for the AI to fix this pass. Add the required photos / data listed, then re-evaluate.",
      });
    }

    // 3) Resolve the model for this tier (ADR-086 §1a). "Advance AI" uses ai.premium_model when set.
    const config = getAiConfig();
    const premiumModel = (getSetting("ai.premium_model") ?? "").trim();
    const premiumConfigured = premiumModel.length > 0;
    const model = tier === "premium" && premiumConfigured ? premiumModel : undefined;
    const modelUsed = model ?? config?.model ?? null;

    // 4) Build one global instruction from the scoring engine's own shortcomings + mitigations.
    const instruction = [
      "Fix the following issues the quality review identified. Address each precisely; change only what is needed.",
      ...aiFixable.map((r) => `- [${r.ref}] ${r.shortcoming} → ${r.mitigation}`),
    ].join("\n");

    // 5) Refine context from the item (mirrors /listing-refine).
    const str = (v: unknown): string => (typeof v === "string" ? v : "");
    const row = item as unknown as Record<string, unknown>;
    const salePrice =
      typeof row.sale_revenue === "number"
        ? row.sale_revenue
        : typeof row.sale_revenue === "string" && row.sale_revenue.trim()
          ? Number(row.sale_revenue) || null
          : null;

    const refined = await refineListing({
      mode: "global",
      instruction,
      model,
      context: {
        identification: str(row.description),
        listing_title: str(row.listing_title),
        listing_description: str(row.listing_description),
        listing_tags: str(row.listing_tags),
        listing_category_path: str(row.listing_category_path) || null,
        listing_condition_clarity: str(row.listing_condition_clarity),
        listing_product_story: str(row.listing_product_story),
        listing_attributes: str(row.listing_attributes),
        listing_pricing_shipping_notes: str(row.listing_pricing_shipping_notes),
        listing_title_strategy: str(row.listing_title_strategy),
        listing_quality_checklist: str(row.listing_quality_checklist),
        condition_code: str(row.condition_code),
        condition_notes: str(row.condition_notes),
        materials: str(row.materials),
        sale_price: salePrice,
      },
    });

    // 6) Apply ONLY whitelisted listing-output fields (+ price). No hash inputs → no drift.
    const applied: string[] = [];
    const sets: string[] = [];
    const values: Record<string, unknown> = { id };
    for (const [field, value] of Object.entries(refined.fields)) {
      const column = APPLY_COLUMN_MAP[field];
      if (!column || typeof value !== "string" || !value.trim()) continue;
      if (column === "sale_revenue") {
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0) continue;
        sets.push(`sale_revenue = @sale_revenue`);
        values.sale_revenue = n;
      } else {
        sets.push(`${column} = @${column}`);
        values[column] = value;
      }
      applied.push(column);
    }

    if (sets.length > 0) {
      sets.push("updated_at = @updated_at");
      values.updated_at = new Date().toISOString();
      getDb().prepare(`UPDATE inventory SET ${sets.join(", ")} WHERE id = @id`).run(values);
    }

    // 7) Re-read + score AFTER; persist quality + phase (mirrors /listing-quality).
    const updated = getInventoryById(id) ?? item;
    const after = evaluateListingQuality(updated, { minScore, itemId: id });
    const blocking = after.quality_remediation.filter((r) => r.ref !== PHOTO_AI_PENDING_REF);
    const ready = after.passed && blocking.length === 0;
    const listingPhase = setQualityPhase(id, ready);
    getDb()
      .prepare("UPDATE inventory SET listing_quality_json = ? WHERE id = ?")
      .run(JSON.stringify({ ...after, listing_source_hash: updated.listing_source_hash ?? null }), id);

    const delta = Number((after.score - beforeScore).toFixed(2));
    logActivity({
      action: "listing.remediation_cycle",
      entityType: "inventory",
      entityId: id,
      entityLabel: item.item_number || item.description || `Item ${id}`,
      detail: { tier, model: modelUsed, previous_score: beforeScore, new_score: after.score, delta, applied },
      source: "user",
    });

    return NextResponse.json({
      ok: true,
      tier,
      model_used: modelUsed,
      premium_configured: premiumConfigured,
      previous_score: beforeScore,
      new_score: after.score,
      delta,
      improved: delta > 0,
      passed: after.passed,
      listing_phase: listingPhase,
      remediation: after.quality_remediation,
      user_action_items: after.quality_remediation.filter(isUserAction),
      applied_fields: applied,
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to run remediation cycle",
        userMessage: "We could not run the remediation cycle.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
