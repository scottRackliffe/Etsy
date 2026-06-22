import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { assertRecordNotStale, getIfMatchHeader } from "@/lib/if-match";
import { getDb } from "@/lib/sqlite";
import { logActivity } from "@/lib/activity-log";

async function getAddressId(context: { params: Promise<{ id: string }> }): Promise<number> {
  const id = parsePositiveInt((await context.params).id);
  if (!id) {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid address id",
      userMessage: "The address id must be a positive integer.",
      actions: ["Check the URL and retry."],
      fields: { id: ["Must be a positive integer"] },
      canRetry: false,
    });
  }
  return id;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const id = await getAddressId(context);
    assertRecordNotStale("addresses", id, getIfMatchHeader(request));
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const allowed = [
      "label",
      "first_line",
      "second_line",
      "city",
      "state",
      "postal_code",
      "country",
      "is_default",
    ] as const;

    const updates: string[] = [];
    const params: Record<string, unknown> = { id, updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (!(key in body)) continue;
      updates.push(`${key} = @${key}`);
      if (key === "is_default") {
        params[key] = body[key] ? 1 : 0;
      } else {
        params[key] = typeof body[key] === "string" ? body[key] : null;
      }
    }
    if (updates.length === 0) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "No fields to update",
        userMessage: "Provide at least one address field to update.",
        actions: ["Include one or more editable fields and retry."],
        canRetry: false,
      });
    }

    const db = getDb();

    if (params.is_default === 1) {
      const addr = db.prepare("SELECT customer_id FROM addresses WHERE id = ?").get(id) as { customer_id: number } | undefined;
      if (addr) {
        db.prepare("UPDATE addresses SET is_default = 0 WHERE customer_id = ? AND id != ?").run(addr.customer_id, id);
      }
    }

    db.prepare(
        `UPDATE addresses SET ${updates.join(", ")}, updated_at = @updated_at WHERE id = @id`
      )
      .run(params);
    const item = db.prepare("SELECT * FROM addresses WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!item) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Address not found",
        userMessage: "The requested address was not found.",
        actions: ["Refresh and retry."],
        canRetry: false,
      });
    }
    // entityId = customer_id so activityEntityHref can deep-link to the customer (ADR-037 §A3).
    logActivity({
      action: "address.updated",
      entityType: "address",
      entityId: item.customer_id as number,
      entityLabel: (item.label as string) ?? undefined,
      detail: { address_id: id },
    });
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to update address",
        userMessage: "We could not update the address.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const id = await getAddressId(context);
    const db = getDb();
    // Capture customer_id before deletion so we can log it (REMOVAL_ACTIONS returns no link anyway).
    const existing = db.prepare("SELECT customer_id FROM addresses WHERE id = ?").get(id) as { customer_id: number } | undefined;
    const result = db.prepare("DELETE FROM addresses WHERE id = ?").run(id);
    if (result.changes === 0) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Address not found",
        userMessage: "The requested address was not found.",
        actions: ["Refresh and retry."],
        canRetry: false,
      });
    }
    // entityId = customer_id (consistent with PATCH); REMOVAL_ACTIONS blocks the link anyway.
    logActivity({
      action: "address.deleted",
      entityType: "address",
      entityId: existing?.customer_id ?? undefined,
      detail: { address_id: id },
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to delete address",
        userMessage: "We could not delete the address.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
