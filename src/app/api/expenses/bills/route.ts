import { NextRequest, NextResponse } from "next/server";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { listNonTaxBills } from "@/lib/bills";

export async function GET(request: NextRequest) {
  try {
    const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 25)));
    const items = listNonTaxBills(limit);
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to list bills",
        userMessage: "Could not load bills.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
