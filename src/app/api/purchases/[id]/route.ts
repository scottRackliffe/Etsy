import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getPurchase, patchPurchase } from "@/lib/records";

async function getPurchaseId(context: { params: Promise<{ id: string }> }): Promise<number> {
  const id = parsePositiveInt((await context.params).id);
  if (!id) {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid purchase id",
      userMessage: "The purchase id must be a positive integer.",
      actions: ["Check the URL and retry."],
      fields: { id: ["Must be a positive integer"] },
      canRetry: false,
    });
  }
  return id;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const id = await getPurchaseId(context);
    const purchase = getPurchase(id);
    if (!purchase) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Purchase not found",
        userMessage: "The requested purchase was not found.",
        actions: ["Refresh and retry."],
        canRetry: false,
      });
    }
    return NextResponse.json({ ok: true, purchase });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load purchase",
        userMessage: "We could not load the purchase.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const id = await getPurchaseId(context);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const purchase = patchPurchase(id, body);
    if (!purchase) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Purchase not found",
        userMessage: "The requested purchase was not found.",
        actions: ["Refresh and retry."],
        canRetry: false,
      });
    }
    return NextResponse.json({ ok: true, purchase });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to update purchase",
        userMessage: "We could not update the purchase.",
        actions: ["Retry in a moment.", "Check request data and retry."],
      })
    );
  }
}
