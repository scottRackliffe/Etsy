import { NextResponse } from "next/server";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { getDb } from "@/lib/sqlite";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;
    const receiptId = Number(id);
    const receiptItemId = Number(itemId);
    if (!Number.isFinite(receiptId) || !Number.isFinite(receiptItemId)) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid ID" } },
        { status: 400 }
      );
    }

    const db = getDb();
    const item = db
      .prepare("SELECT * FROM receipt_items WHERE id = ? AND receipt_id = ?")
      .get(receiptItemId, receiptId);
    if (!item) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Receipt item not found" } },
        { status: 404 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const inventoryId = typeof body.inventory_id === "number" ? body.inventory_id : null;

    db.prepare("UPDATE receipt_items SET inventory_id = ? WHERE id = ?").run(
      inventoryId,
      receiptItemId
    );

    const updated = db.prepare("SELECT * FROM receipt_items WHERE id = ?").get(receiptItemId);
    return NextResponse.json({ ok: true, item: updated });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to update receipt item",
        userMessage: "Could not update receipt item.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
