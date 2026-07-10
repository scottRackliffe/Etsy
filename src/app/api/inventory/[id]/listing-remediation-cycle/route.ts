/**
 * POST /api/inventory/[id]/listing-remediation-cycle
 *
 * Runs the listing remediation engine (ADR-081/082/085). The scoring
 * engine (ADR-082 rubric) names what is wrong; the engine fixes every
 * NON-PICTURE shortcoming it can — listing text/price via a global AI refine
 * AND structured attributes (era, category, materials, dimensions, who-made)
 * via deterministic defaults + one focused AI attribute call — then re-scores.
 *
 * Body: { tier?: "standard" | "premium", mode?: "single" | "auto" }
 *   - tier "premium" ("Advance AI") uses ai.premium_model when configured.
 *   - mode "auto" loops passes until the gate passes, only picture/user items
 *     remain, or a pass stops improving. Default "single" (one observed pass).
 *
 * Attribute fields are ADR-081 hash inputs; the engine re-baselines
 * listing_source_hash after applying them, so a repair never bounces the item
 * back to `ready_to_generate` (no drift).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { runRemediation } from "@/lib/listing-remediation";

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

    const body = (await request.json().catch(() => ({}))) as { tier?: unknown; mode?: unknown };
    const tier: "standard" | "premium" = body.tier === "premium" ? "premium" : "standard";
    const mode: "single" | "auto" = body.mode === "auto" ? "auto" : "single";

    const result = await runRemediation(id, { tier, mode });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to run remediation",
        userMessage: "We could not run the listing repair.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
