import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePagination, parsePositiveInt } from "@/lib/api-utils";
import { listActivity } from "@/lib/activity-log";
import { requireEtsyAccessToken } from "@/lib/auth-session";

export async function GET(request: NextRequest) {
  try {
    requireEtsyAccessToken(await cookies());
    const params = request.nextUrl.searchParams;
    const { limit, offset } = parsePagination(params);
    const entityType = params.get("entity_type")?.trim() || undefined;
    const entityId = parsePositiveInt(params.get("entity_id"));
    const action = params.get("action")?.trim() || undefined;
    const fromDate = params.get("from_date")?.trim() || undefined;
    const toDate = params.get("to_date")?.trim() || undefined;
    const search = params.get("search")?.trim() || undefined;

    const { items, total } = listActivity({
      limit,
      offset,
      entityType,
      entityId: entityId ?? undefined,
      action,
      fromDate,
      toDate,
      search,
    });

    return NextResponse.json({
      ok: true,
      items,
      pagination: { limit, offset, total, has_more: offset + items.length < total },
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load activity log",
        userMessage: "We could not load recent activity.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
