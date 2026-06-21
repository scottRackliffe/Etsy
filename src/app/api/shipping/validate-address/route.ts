import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { isEasyPostConfigured, validateAddress } from "@/lib/easypost";

export async function POST(request: Request) {
  try {
    requireEtsyAccessToken(await cookies());

    if (!isEasyPostConfigured()) {
      throw new ApiRouteError({
        status: 400,
        code: "SHIPPING_NOT_CONFIGURED",
        message: "EasyPost is not configured",
        userMessage:
          "Shipping integration is not set up. Add your EasyPost API key in Settings → Shipping.",
        actions: ["Go to Settings → Shipping and enter your EasyPost API key."],
        canRetry: false,
      });
    }

    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      street1?: string;
      street2?: string;
      city?: string;
      state?: string;
      zip?: string;
      country?: string;
    };

    const requiredFields = ["name", "street1", "city", "state", "zip", "country"] as const;
    const missingFields: Record<string, string[]> = {};
    for (const field of requiredFields) {
      if (!body[field] || String(body[field]).trim() === "") {
        missingFields[field] = ["Required"];
      }
    }
    if (Object.keys(missingFields).length > 0) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Missing required address fields",
        userMessage: "Please fill in all required address fields.",
        actions: [`Missing: ${Object.keys(missingFields).join(", ")}.`],
        fields: missingFields,
        canRetry: false,
      });
    }

    const result = await validateAddress({
      name: body.name!,
      street1: body.street1!,
      street2: body.street2 || undefined,
      city: body.city!,
      state: body.state!,
      zip: body.zip!,
      country: body.country!,
    });

    return NextResponse.json({
      ok: true,
      valid: result.valid,
      original: result.original,
      verified: result.verified,
      corrections: result.corrections,
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to validate address",
        userMessage: "We could not validate the address.",
        actions: ["Check the address fields and try again."],
      })
    );
  }
}
