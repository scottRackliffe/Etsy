import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getMaskedAiConfig, saveAiConfig } from "@/lib/ai-config";

export async function GET() {
  try {
    requireEtsyAccessToken(await cookies());
    return NextResponse.json({ ok: true, config: getMaskedAiConfig() });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load AI settings",
        userMessage: "We could not load AI settings.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export async function PUT(request: Request) {
  try {
    requireEtsyAccessToken(await cookies());
    const body = (await request.json().catch(() => ({}))) as {
      provider?: unknown;
      model?: unknown;
      economy_model?: unknown;
      premium_model?: unknown;
      api_key?: unknown;
      base_url?: unknown;
      timeout_ms?: unknown;
      retry_count?: unknown;
      token_budget?: unknown;
    };
    saveAiConfig({
      provider: typeof body.provider === "string" ? body.provider : undefined,
      model: typeof body.model === "string" ? body.model : undefined,
      economyModel: typeof body.economy_model === "string" ? body.economy_model : undefined,
      premiumModel: typeof body.premium_model === "string" ? body.premium_model : undefined,
      apiKey: typeof body.api_key === "string" ? body.api_key : undefined,
      baseUrl: typeof body.base_url === "string" ? body.base_url : undefined,
      timeoutMs: body.timeout_ms === undefined ? undefined : Number(body.timeout_ms),
      retryCount: body.retry_count === undefined ? undefined : Number(body.retry_count),
      tokenBudget: body.token_budget === undefined ? undefined : Number(body.token_budget),
    });
    return NextResponse.json({ ok: true, config: getMaskedAiConfig() });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "VALIDATION_ERROR",
        message: "Failed to save AI settings",
        userMessage: "We could not save AI settings.",
        actions: ["Check the AI configuration fields and retry."],
        canRetry: false,
      })
    );
  }
}

export async function POST() {
  return errorResponse(
    new ApiRouteError({
      status: 405,
      code: "VALIDATION_ERROR",
      message: "Method not allowed",
      userMessage: "Use GET or PUT for AI settings.",
      actions: ["Retry with GET or PUT."],
      canRetry: false,
    })
  );
}
