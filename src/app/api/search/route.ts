import { NextRequest, NextResponse } from "next/server";
import { ApiRouteError, errorResponse } from "@/lib/api-error";
import { globalSearch } from "@/lib/global-search";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return errorResponse(
      new ApiRouteError({
        status: 400,
        code: "QUERY_TOO_SHORT",
        message: "Search term must be at least 2 characters",
        userMessage: "Type at least 2 characters to search.",
        actions: ["Enter a longer search term."],
        canRetry: false,
      })
    );
  }
  const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? 5);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(20, Math.floor(limitRaw))) : 5;
  const result = globalSearch(q, limit);
  return NextResponse.json({ ok: true, ...result });
}
