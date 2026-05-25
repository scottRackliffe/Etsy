import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { findCustomerDuplicateGroups } from "@/lib/duplicate-detection";

export async function GET() {
  try {
    requireEtsyAccessToken(await cookies());
    const groups = findCustomerDuplicateGroups();
    return NextResponse.json({ ok: true, groups });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to find duplicate customers",
        userMessage: "We could not scan for duplicate customers.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
