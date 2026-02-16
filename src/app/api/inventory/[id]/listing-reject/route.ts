import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getInventoryById } from "@/lib/inventory";
import { getDb } from "@/lib/sqlite";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const id = parsePositiveInt((await context.params).id);
    if (!id) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid inventory id",
        userMessage: "Inventory id must be a positive integer.",
        actions: ["Check the URL and retry."],
        fields: { id: ["Must be a positive integer"] },
        canRetry: false,
      });
    }

    const item = getInventoryById(id);
    if (!item) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Inventory item not found",
        userMessage: "The selected inventory item was not found.",
        actions: ["Refresh and retry."],
        canRetry: false,
      });
    }

    const now = new Date().toISOString();
    getDb()
      .prepare(
        `
      UPDATE inventory
      SET listing_draft_state = 'draft',
          listing_approved_at = NULL,
          listing_published_at = NULL,
          is_listed = 0,
          updated_at = @updated_at
      WHERE id = @id
    `
      )
      .run({ id, updated_at: now });

    return NextResponse.json({ ok: true, item: getInventoryById(id) });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to reject listing draft",
        userMessage: "We could not reject this draft.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
