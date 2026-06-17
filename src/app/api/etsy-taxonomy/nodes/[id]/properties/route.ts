import { NextRequest, NextResponse } from "next/server";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import {
  getTaxonomyProperties,
  syncTaxonomyProperties,
  getTaxonomyNode,
} from "@/lib/etsy-taxonomy";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const taxonomyId = parseInt(id, 10);
    if (isNaN(taxonomyId)) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid taxonomy ID",
            user_message: "Invalid category ID.",
          },
        },
        { status: 400 }
      );
    }

    const node = getTaxonomyNode(taxonomyId);
    if (!node) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: "Taxonomy node not found",
            user_message:
              "Category not found. Try syncing categories from Config first.",
          },
        },
        { status: 404 }
      );
    }

    let properties = getTaxonomyProperties(taxonomyId);

    if (properties.length === 0) {
      await syncTaxonomyProperties(taxonomyId);
      properties = getTaxonomyProperties(taxonomyId);
    }

    const parsed = properties.map((p) => ({
      ...p,
      possible_values: JSON.parse(p.possible_values_json || "[]"),
      scales: JSON.parse(p.scales_json || "[]"),
    }));

    return NextResponse.json({ ok: true, items: parsed, node });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "TAXONOMY_PROPERTIES_FAILED",
        message: "Failed to load taxonomy properties",
        userMessage:
          "Could not load category attributes. Check your Etsy API credentials and try again.",
        actions: ["Verify Etsy API credentials in Config.", "Try again later."],
        canRetry: true,
      })
    );
  }
}
