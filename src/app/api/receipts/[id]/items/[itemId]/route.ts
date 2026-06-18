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
    const previousInventoryId = (item as { inventory_id?: number | null }).inventory_id ?? null;

    db.prepare("UPDATE receipt_items SET inventory_id = ? WHERE id = ?").run(
      inventoryId,
      receiptItemId
    );

    // When unlinking, remove the auto-created purchase record
    if (!inventoryId && previousInventoryId) {
      db.prepare(
        "DELETE FROM purchases WHERE inventory_id = ? AND notes LIKE ?"
      ).run(previousInventoryId, `Linked from scanned receipt #${receiptId}`);
    }

    if (inventoryId) {
      const receiptItem = item as { cost?: number | null; description?: string };
      const receipt = db.prepare("SELECT * FROM receipts WHERE id = ?").get(receiptId) as {
        vendor_name?: string;
        vendor_id?: number | null;
        purchase_date?: string | null;
        reference_number?: string | null;
        shipping_price?: number | null;
      } | undefined;

      const sets: string[] = [];
      const vals: unknown[] = [];

      if (receiptItem.cost != null) {
        sets.push("purchase_cost = ?");
        vals.push(receiptItem.cost);
      }
      if (receipt?.purchase_date) {
        sets.push("date_purchased = ?");
        vals.push(receipt.purchase_date);
      }

      if (sets.length > 0) {
        sets.push("updated_at = ?");
        vals.push(new Date().toISOString());
        vals.push(inventoryId);
        db.prepare(`UPDATE inventory SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
      }

      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO purchases (inventory_id, vendor_name, vendor_id, purchase_date, purchase_price, shipping_price, reference_number, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        inventoryId,
        receipt?.vendor_name ?? "Unknown",
        receipt?.vendor_id ?? null,
        receipt?.purchase_date ?? null,
        receiptItem.cost ?? null,
        receipt?.shipping_price ?? null,
        receipt?.reference_number ?? null,
        `Linked from scanned receipt #${receiptId}`,
        now,
        now
      );
    }

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
