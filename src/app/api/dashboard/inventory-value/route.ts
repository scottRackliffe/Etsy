import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { getInventoryValueSummary } from "@/lib/dashboard";
import { requireEtsyAccessToken } from "@/lib/auth-session";

export async function GET() {
  try {
    requireEtsyAccessToken(await cookies());
    return NextResponse.json({ ok: true, ...getInventoryValueSummary() });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load inventory value",
        userMessage: "We could not load inventory value.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
