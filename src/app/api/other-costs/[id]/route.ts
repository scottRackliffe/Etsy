import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getDb } from "@/lib/sqlite";

async function getOtherCostId(context: { params: Promise<{ id: string }> }): Promise<number> {
  const id = parsePositiveInt((await context.params).id);
  if (!id) {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid other cost id",
      userMessage: "The other cost id must be a positive integer.",
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
    const id = await getOtherCostId(context);
    const body = (await request.json().catch(() => ({}))) as {
      cost_type?: unknown;
      amount?: unknown;
      note?: unknown;
    };
    const updates: string[] = [];
    const params: Record<string, unknown> = { id, updated_at: new Date().toISOString() };

    if (body.cost_type !== undefined) {
      updates.push("cost_type = @cost_type");
      params.cost_type = typeof body.cost_type === "string" ? body.cost_type : null;
    }
    if (body.amount !== undefined) {
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        throw new ApiRouteError({
          status: 400,
          code: "VALIDATION_ERROR",
          message: "Invalid amount",
          userMessage: "Amount must be a number greater than or equal to 0.",
          actions: ["Correct the amount and retry."],
          fields: { amount: ["Must be >= 0"] },
          canRetry: false,
        });
      }
      updates.push("amount = @amount");
      params.amount = amount;
    }
    if (body.note !== undefined) {
      updates.push("note = @note");
      params.note = typeof body.note === "string" ? body.note : null;
    }
    if (updates.length === 0) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "No fields to update",
        userMessage: "Provide at least one field to update.",
        actions: ["Include cost_type, amount, or note and retry."],
        canRetry: false,
      });
    }

    const db = getDb();
    const sql = `UPDATE other_costs SET ${updates.join(", ")}, updated_at = @updated_at WHERE id = @id`;
    db.prepare(sql).run(params);
    const item = db.prepare("SELECT * FROM other_costs WHERE id = ?").get(id);
    if (!item) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Other cost not found",
        userMessage: "The requested other cost record was not found.",
        actions: ["Refresh and retry."],
        canRetry: false,
      });
    }
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to update other cost",
        userMessage: "We could not update the other cost.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const id = await getOtherCostId(context);
    const db = getDb();
    const result = db.prepare("DELETE FROM other_costs WHERE id = ?").run(id);
    if (result.changes === 0) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Other cost not found",
        userMessage: "The requested other cost record was not found.",
        actions: ["Refresh and retry."],
        canRetry: false,
      });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to delete other cost",
        userMessage: "We could not delete the other cost.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
