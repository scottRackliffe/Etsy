import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { MERGE_CUSTOMER_FIELDS, mergeCustomers, type MergeCustomerField } from "@/lib/customer-merge";

export async function POST(request: NextRequest) {
  try {
    requireEtsyAccessToken(await cookies());
    const body = (await request.json().catch(() => ({}))) as {
      primary_id?: number | string;
      secondary_id?: number | string;
      field_overrides?: Record<string, unknown>;
    };

    const primaryId = parsePositiveInt(body.primary_id != null ? String(body.primary_id) : null);
    const secondaryId = parsePositiveInt(body.secondary_id != null ? String(body.secondary_id) : null);

    if (!primaryId || !secondaryId) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "primary_id and secondary_id required",
        userMessage: "Choose both a primary and secondary customer to merge.",
        actions: ["Select two customers and try again."],
        fields: {
          primary_id: primaryId ? [] : ["Required"],
          secondary_id: secondaryId ? [] : ["Required"],
        },
        canRetry: false,
      });
    }

    const fieldOverrides: Partial<Record<MergeCustomerField, string | null>> = {};
    if (body.field_overrides && typeof body.field_overrides === "object") {
      for (const key of MERGE_CUSTOMER_FIELDS) {
        if (key in body.field_overrides) {
          const raw = body.field_overrides[key];
          fieldOverrides[key] =
            raw == null ? null : typeof raw === "string" ? raw : String(raw);
        }
      }
    }

    const result = mergeCustomers({
      primaryId,
      secondaryId,
      fieldOverrides: Object.keys(fieldOverrides).length > 0 ? fieldOverrides : undefined,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to merge customers",
        userMessage: "We could not merge those customers.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
