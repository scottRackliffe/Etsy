import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getSetting, setSetting } from "@/lib/settings-store";

function normalizeKey(raw: string): string {
  return raw.trim();
}

export async function GET(_request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const key = normalizeKey((await context.params).key);
    if (!key) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid key",
        userMessage: "A setting key is required.",
        actions: ["Provide a valid key in the request URL."],
        fields: { key: ["Key is required"] },
        canRetry: false,
      });
    }

    const value = getSetting(key);
    if (value == null) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Setting not found",
        userMessage: "The requested setting was not found.",
        actions: ["Check the key name and retry."],
        canRetry: false,
      });
    }

    return NextResponse.json({ ok: true, key, value });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load setting",
        userMessage: "We could not load the setting.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export async function PUT(request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const key = normalizeKey((await context.params).key);
    if (!key) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid key",
        userMessage: "A setting key is required.",
        actions: ["Provide a valid key in the request URL."],
        fields: { key: ["Key is required"] },
        canRetry: false,
      });
    }

    const body = (await request.json().catch(() => ({}))) as { value?: unknown };
    if (typeof body.value !== "string") {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid setting value",
        userMessage: "Setting value must be a string.",
        actions: ['Send a JSON body like {"value":"..."}.'],
        fields: { value: ["Must be a string"] },
        canRetry: false,
      });
    }

    setSetting(key, body.value);
    return NextResponse.json({ ok: true, key, value: body.value });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to update setting",
        userMessage: "We could not update the setting.",
        actions: ["Retry in a moment.", "Check the request format and try again."],
      })
    );
  }
}
