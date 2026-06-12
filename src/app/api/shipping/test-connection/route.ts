import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { isEasyPostConfigured, testConnection } from "@/lib/easypost";

export async function POST() {
  try {
    requireEtsyAccessToken(await cookies());

    if (!isEasyPostConfigured()) {
      return NextResponse.json({
        ok: false,
        configured: false,
        error: "EasyPost API key not configured.",
      });
    }

    const result = await testConnection();
    return NextResponse.json({
      ok: result.ok,
      configured: true,
      error: result.error ?? undefined,
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "EasyPost connection test failed",
        userMessage: "Could not test the EasyPost connection.",
        actions: ["Check your API key and try again."],
      })
    );
  }
}
