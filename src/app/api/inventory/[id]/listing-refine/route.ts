/**
 * POST /api/inventory/[id]/listing-refine
 * Thin wrapper over refineListing() from listing-ai.ts (ADR-085 §3, WS-L3).
 * Body: { mode: "field"|"global", field_name?, current_value?, instruction, context? }
 * Auto-populates context from the DB item; body.context fields override.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { refineListing } from "@/lib/listing-ai";
import { getDb } from "@/lib/sqlite";

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function materializeField(
  ctx: Record<string, unknown>,
  item: Record<string, unknown>,
  key: string
): string {
  if (typeof ctx[key] === "string") return ctx[key] as string;
  if (typeof item[key] === "string") return item[key] as string;
  return "";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireEtsyAccessToken(await cookies());

    const { id } = await params;
    const inventoryId = parseId(id);
    if (!inventoryId) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid inventory id",
        userMessage: "Invalid item ID.",
        actions: ["Retry with a valid item ID."],
        canRetry: false,
      });
    }

    const db = getDb();
    const item = db
      .prepare("SELECT * FROM inventory WHERE id = ?")
      .get(inventoryId) as Record<string, unknown> | undefined;
    if (!item) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Item not found",
        userMessage: "Item not found.",
        actions: [],
        canRetry: false,
      });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const mode = body.mode === "field" ? "field" : "global";
    const instruction =
      typeof body.instruction === "string" ? body.instruction.trim() : "";
    if (!instruction) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "instruction is required",
        userMessage: "Please provide an instruction for the AI.",
        actions: ["Describe what to change and try again."],
        canRetry: false,
      });
    }

    const fieldName =
      typeof body.field_name === "string" ? body.field_name.trim() || undefined : undefined;
    const currentValue =
      typeof body.current_value === "string" ? body.current_value : undefined;

    // Build context from DB item; body.context overrides per-field.
    const ctx = (body.context ?? {}) as Record<string, unknown>;
    const mat = (key: string) => materializeField(ctx, item, key);

    const salePrice = (() => {
      if (typeof ctx.sale_price === "number") return ctx.sale_price;
      const raw = item.sale_revenue;
      if (typeof raw === "number") return raw;
      if (typeof raw === "string") {
        const n = parseFloat(raw);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    })();

    const refineContext = {
      identification: mat("description"),
      listing_title: mat("listing_title"),
      listing_description: mat("listing_description"),
      listing_tags: mat("listing_tags"),
      listing_category_path: mat("listing_category_path") || null,
      listing_condition_clarity: mat("listing_condition_clarity"),
      listing_product_story: mat("listing_product_story"),
      listing_attributes: mat("listing_attributes"),
      listing_pricing_shipping_notes: mat("listing_pricing_shipping_notes"),
      listing_title_strategy: mat("listing_title_strategy"),
      listing_quality_checklist: mat("listing_quality_checklist"),
      condition_code: mat("condition_code"),
      condition_notes: mat("condition_notes"),
      materials: mat("materials"),
      sale_price: salePrice,
    };

    const result = await refineListing({
      mode,
      fieldName,
      currentValue,
      instruction,
      context: refineContext,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "LISTING_ANALYZE_FAILED",
        message: "Failed to refine listing",
        userMessage: "The AI could not process your refinement request.",
        actions: ["Rephrase your instruction and retry."],
      })
    );
  }
}
