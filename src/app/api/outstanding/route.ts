/**
 * GET /api/outstanding
 *
 * Returns all outstanding items per ADR-020: paid-not-shipped, unpaid,
 * in-stock-not-listed, missing-address, and missing-shipping-cost.
 * Each item includes type, label, target tab, and record id.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { queryOutstandingItems } from "@/lib/outstanding";

export type { OutstandingItem } from "@/lib/outstanding";

export async function GET() {
  try {
    requireEtsyAccessToken(await cookies());
    const items = queryOutstandingItems();

    items.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    });

    const counts: Record<string, number> = {};
    for (const item of items) {
      counts[item.type] = (counts[item.type] ?? 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      items,
      total: items.length,
      counts,
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load outstanding items",
        userMessage: "We could not load outstanding items.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
