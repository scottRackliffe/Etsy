import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getDb } from "@/lib/sqlite";

const SENSITIVE_KEY_PATTERNS = [
  /^etsy_access_token/,
  /^etsy_refresh_token/,
  /^etsy\.oauth\./,
  /^app\.session\./,
  /secret/i,
  /password/i,
];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((p) => p.test(key));
}

const WIZARD_SAFE_PREFIXES = [
  "setup.",
  "business_",
  "ui.",
  "shipping.",
  "default_",
  "date_format",
  "first_day_of_week",
];

function isWizardSafeKey(key: string): boolean {
  return WIZARD_SAFE_PREFIXES.some((p) => key.startsWith(p));
}

export async function GET(request: NextRequest) {
  try {
    const isWizard = request.nextUrl.searchParams.get("wizard") === "1";
    if (!isWizard) {
      requireEtsyAccessToken(await cookies());
    }
    const db = getDb();
    const rows = db
      .prepare("SELECT key, value, updated_at FROM settings ORDER BY key")
      .all() as Array<{ key: string; value: string | null; updated_at: string }>;
    const items: Array<{ key: string; value: string | null; updated_at: string }> = [];
    for (const row of rows) {
      if (isSensitiveKey(row.key)) continue;
      if (isWizard && !isWizardSafeKey(row.key)) continue;
      items.push(row);
    }
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load settings",
        userMessage: "We could not load settings.",
        actions: ["Retry in a moment.", "Reconnect Etsy if your session expired."],
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
      userMessage: "Use PUT /api/settings/[key] to update a setting.",
      actions: ["Retry with the correct endpoint."],
      canRetry: false,
    })
  );
}
