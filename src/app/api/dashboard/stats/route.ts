import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { getDashboardStats } from "@/lib/dashboard";
import { requireEtsyAccessToken } from "@/lib/auth-session";

export async function GET() {
  try {
    requireEtsyAccessToken(await cookies());
    return NextResponse.json({ ok: true, ...getDashboardStats() });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load dashboard stats",
        userMessage: "We could not load dashboard stats.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
