import { NextRequest, NextResponse } from "next/server";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { listTaxonomyNodes, searchTaxonomyNodes } from "@/lib/etsy-taxonomy";

export async function GET(request: NextRequest) {
  try {
    const parentId = request.nextUrl.searchParams.get("parent_id");
    const query = request.nextUrl.searchParams.get("q")?.trim();

    if (query) {
      const results = searchTaxonomyNodes(query);
      return NextResponse.json({ ok: true, items: results });
    }

    const pid = parentId ? parseInt(parentId, 10) : null;
    const items = listTaxonomyNodes(pid);
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to list taxonomy nodes",
        userMessage:
          "Could not load Etsy categories. Try syncing categories from Settings first.",
        actions: ["Sync categories from Settings.", "Try again later."],
      })
    );
  }
}
