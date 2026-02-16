import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getDb } from "@/lib/sqlite";

async function inventoryIdFromContext(context: {
  params: Promise<{ id: string }>;
}): Promise<number> {
  const id = parsePositiveInt((await context.params).id);
  if (!id) {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid inventory id",
      userMessage: "The inventory id must be a positive integer.",
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
    const inventoryId = await inventoryIdFromContext(context);
    const db = getDb();
    const items = db
      .prepare("SELECT * FROM other_costs WHERE inventory_id = ? ORDER BY id DESC")
      .all(inventoryId);
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load other costs",
        userMessage: "We could not load other costs for this item.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const inventoryId = await inventoryIdFromContext(context);
    const body = (await request.json().catch(() => ({}))) as {
      cost_type?: unknown;
      amount?: unknown;
      note?: unknown;
    };
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid other cost amount",
        userMessage: "Amount must be a number greater than or equal to 0.",
        actions: ["Correct the amount and retry."],
        fields: { amount: ["Must be >= 0"] },
        canRetry: false,
      });
    }
    const db = getDb();
    const now = new Date().toISOString();
    const result = db
      .prepare(
        `
        INSERT INTO other_costs(inventory_id, cost_type, amount, note, created_at, updated_at)
        VALUES(@inventory_id, @cost_type, @amount, @note, @created_at, @updated_at)
      `
      )
      .run({
        inventory_id: inventoryId,
        cost_type: typeof body.cost_type === "string" ? body.cost_type : null,
        amount,
        note: typeof body.note === "string" ? body.note : null,
        created_at: now,
        updated_at: now,
      });

    const item = db.prepare("SELECT * FROM other_costs WHERE id = ?").get(result.lastInsertRowid);
    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to create other cost",
        userMessage: "We could not create the other cost record.",
        actions: ["Retry in a moment.", "Check request data and retry."],
      })
    );
  }
}
