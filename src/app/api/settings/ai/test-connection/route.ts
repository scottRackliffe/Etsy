import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getAiConfig, testAiConnection } from "@/lib/ai-config";

export async function POST() {
  try {
    requireEtsyAccessToken(await cookies());
    const config = getAiConfig();
    if (!config) {
      throw new Error("AI settings are not configured");
    }
    const result = await testAiConnection(config);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "AI connection test failed",
        userMessage: "We could not connect to the configured AI provider.",
        actions: ["Verify API key/model settings and retry."],
      })
    );
  }
}
