import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getDb } from "@/lib/sqlite";
import { getSetting, setSetting } from "@/lib/settings-store";
import { logActivity } from "@/lib/activity-log";
import { setEasyPostApiKey } from "@/lib/easypost";

function normalizeKey(raw: string): string {
  return raw.trim();
}

const SENSITIVE_KEY_PATTERNS = [
  /^etsy_access_token/,
  /^etsy_refresh_token/,
  /^etsy\.oauth\./,
  /^app\.session\./,
  /^easypost\.api_key_encrypted$/,
  /secret/i,
  /password/i,
];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((p) => p.test(key));
}

function isWizardExemptKey(key: string): boolean {
  return (
    key === "setup.completed" ||
    key === "business_name" ||
    key === "business_phone" ||
    key === "business_email" ||
    key.startsWith("business_address_") ||
    key.startsWith("ui.") ||
    key.startsWith("shipping.") ||
    key === "default_shipper" ||
    key === "date_format" ||
    key === "first_day_of_week"
  );
}

export async function GET(_request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    const key = normalizeKey((await context.params).key);
    if (!isWizardExemptKey(key)) {
      requireEtsyAccessToken(await cookies());
    }
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

    if (isSensitiveKey(key)) {
      throw new ApiRouteError({
        status: 403,
        code: "FORBIDDEN",
        message: "Access denied to sensitive setting",
        userMessage: "This setting cannot be read through the API.",
        actions: [],
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
    const key = normalizeKey((await context.params).key);
    if (!isWizardExemptKey(key)) {
      requireEtsyAccessToken(await cookies());
    }
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

    if (key !== "easypost.api_key" && isSensitiveKey(key)) {
      throw new ApiRouteError({
        status: 403,
        code: "FORBIDDEN",
        message: "Cannot write sensitive setting via API",
        userMessage: "This setting cannot be modified through the API.",
        actions: [],
        canRetry: false,
      });
    }

    const ifMatch = request.headers.get("If-Match");
    if (ifMatch) {
      const db = getDb();
      const row = db.prepare("SELECT updated_at FROM settings WHERE key = ?").get(key) as
        | { updated_at: string }
        | undefined;
      if (row && row.updated_at !== ifMatch) {
        throw new ApiRouteError({
          status: 409,
          code: "CONCURRENT_EDIT",
          message: "Setting was modified",
          userMessage: "This setting was modified since you loaded it. Reload and try again.",
          actions: ["Reload the page to see the latest value."],
          canRetry: true,
        });
      }
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

    if (key === "easypost.api_key") {
      setEasyPostApiKey(body.value);
      logActivity({
        action: "settings.updated",
        entityType: "setting",
        detail: { key: "easypost.api_key_encrypted" },
      });
      return NextResponse.json({ ok: true, key, value: "(encrypted)" });
    }

    setSetting(key, body.value);
    const isSensitive = /key|token|secret/i.test(key);
    logActivity({
      action: "settings.updated",
      entityType: "setting",
      detail: isSensitive ? { key } : { key, value: body.value },
    });
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
