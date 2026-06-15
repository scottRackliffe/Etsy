import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { refineListing, type RefineListingInput } from "@/lib/listing-coach";

export async function POST(request: Request) {
  try {
    requireEtsyAccessToken(await cookies());

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const mode = body.mode === "field" ? "field" : "global";
    const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
    if (!instruction) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "instruction is required" } },
        { status: 400 }
      );
    }

    const fieldName = typeof body.field_name === "string" ? body.field_name.trim() : undefined;
    const currentValue = typeof body.current_value === "string" ? body.current_value : undefined;

    const ctx = (body.context ?? {}) as Record<string, unknown>;
    const context: RefineListingInput["context"] = {
      identification: typeof ctx.identification === "string" ? ctx.identification : "",
      listing_title: typeof ctx.listing_title === "string" ? ctx.listing_title : "",
      listing_description: typeof ctx.listing_description === "string" ? ctx.listing_description : "",
      listing_tags: typeof ctx.listing_tags === "string" ? ctx.listing_tags : "",
      listing_category_path: typeof ctx.listing_category_path === "string" ? ctx.listing_category_path : null,
      listing_condition_clarity: typeof ctx.listing_condition_clarity === "string" ? ctx.listing_condition_clarity : "",
      listing_product_story: typeof ctx.listing_product_story === "string" ? ctx.listing_product_story : "",
      listing_attributes: typeof ctx.listing_attributes === "string" ? ctx.listing_attributes : "",
      listing_pricing_shipping_notes: typeof ctx.listing_pricing_shipping_notes === "string" ? ctx.listing_pricing_shipping_notes : "",
      listing_title_strategy: typeof ctx.listing_title_strategy === "string" ? ctx.listing_title_strategy : "",
      listing_quality_checklist: typeof ctx.listing_quality_checklist === "string" ? ctx.listing_quality_checklist : "",
      condition_code: typeof ctx.condition_code === "string" ? ctx.condition_code : "",
      condition_notes: typeof ctx.condition_notes === "string" ? ctx.condition_notes : "",
      materials: typeof ctx.materials === "string" ? ctx.materials : "",
      sale_price: typeof ctx.sale_price === "number" ? ctx.sale_price : null,
    };

    const result = await refineListing({
      mode,
      fieldName,
      currentValue,
      instruction,
      context,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "LISTING_ANALYZE_FAILED",
        message: "Failed to refine listing",
        userMessage: "The AI could not process your refinement request. Please try again.",
        actions: ["Rephrase your instruction and retry."],
      })
    );
  }
}
