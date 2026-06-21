import { NextResponse } from "next/server";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { syncTaxonomyNodes, getTaxonomySyncStatus } from "@/lib/etsy-taxonomy";

export async function POST() {
  try {
    const result = await syncTaxonomyNodes();
    const status = getTaxonomySyncStatus();

    return NextResponse.json({
      ok: true,
      nodesInserted: result.nodesInserted,
      durationMs: result.durationMs,
      lastSyncAt: status.lastSyncAt,
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "TAXONOMY_SYNC_FAILED",
        message: "Failed to sync Etsy taxonomy",
        userMessage:
          "Could not sync Etsy categories. Check your Etsy API credentials and try again.",
        actions: ["Verify Etsy API credentials in Settings.", "Try again later."],
        canRetry: true,
      })
    );
  }
}

export async function GET() {
  try {
    const status = getTaxonomySyncStatus();
    return NextResponse.json({ ok: true, ...status });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to read taxonomy sync status",
        userMessage: "Could not read taxonomy sync status.",
        actions: ["Try again later."],
      })
    );
  }
}
