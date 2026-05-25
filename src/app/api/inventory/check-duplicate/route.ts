import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { findInventoryDuplicates } from "@/lib/duplicate-detection";
import { requireEtsyAccessToken } from "@/lib/auth-session";

export async function GET(request: NextRequest) {
  try {
    requireEtsyAccessToken(await cookies());
    const description = request.nextUrl.searchParams.get("description")?.trim() ?? "";
    const duplicates = findInventoryDuplicates(description);
    return NextResponse.json({ ok: true, duplicates });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Duplicate check failed",
        userMessage: "We could not check for similar inventory items.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
