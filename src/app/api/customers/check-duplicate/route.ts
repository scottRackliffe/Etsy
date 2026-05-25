import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { findCustomerDuplicates } from "@/lib/duplicate-detection";
import { requireEtsyAccessToken } from "@/lib/auth-session";

export async function GET(request: NextRequest) {
  try {
    requireEtsyAccessToken(await cookies());
    const params = request.nextUrl.searchParams;
    const duplicates = findCustomerDuplicates({
      first_name: params.get("first_name") ?? undefined,
      last_name: params.get("last_name") ?? undefined,
      email: params.get("email") ?? undefined,
    });
    return NextResponse.json({ ok: true, duplicates });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Duplicate check failed",
        userMessage: "We could not check for similar customers.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
