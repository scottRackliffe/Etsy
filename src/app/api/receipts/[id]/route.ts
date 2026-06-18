import { NextResponse } from "next/server";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { getDb } from "@/lib/sqlite";

type RouteParams = { params: Promise<{ id: string }> };

function parseReceiptId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const receiptId = parseReceiptId((await params).id);
    if (!receiptId) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid receipt ID" } },
        { status: 400 }
      );
    }

    const db = getDb();
    const receipt = db.prepare("SELECT * FROM receipts WHERE id = ?").get(receiptId);
    if (!receipt) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Receipt not found" } },
        { status: 404 }
      );
    }

    const items = db
      .prepare(
        `SELECT ri.*, i.item_number, i.description AS inventory_description
         FROM receipt_items ri
         LEFT JOIN inventory i ON i.id = ri.inventory_id
         WHERE ri.receipt_id = ?
         ORDER BY ri.id`
      )
      .all(receiptId);

    return NextResponse.json({ ok: true, receipt, items });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load receipt",
        userMessage: "Could not load receipt detail.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const receiptId = parseReceiptId((await params).id);
    if (!receiptId) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid receipt ID" } },
        { status: 400 }
      );
    }

    const db = getDb();
    const existing = db.prepare("SELECT * FROM receipts WHERE id = ?").get(receiptId);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Receipt not found" } },
        { status: 404 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const sets: string[] = [];
    const values: Record<string, unknown> = { id: receiptId };

    for (const key of ["vendor_name", "vendor_id", "purchase_date", "reference_number", "notes", "receipt_image", "shipping_price"] as const) {
      if (key in body) {
        sets.push(`${key} = @${key}`);
        values[key] = body[key] ?? null;
      }
    }

    if ("vendor_id" in body && typeof body.vendor_id === "number") {
      const vendor = db.prepare("SELECT name FROM vendors WHERE id = ?").get(body.vendor_id) as { name: string } | undefined;
      if (vendor) {
        if (!sets.includes("vendor_name = @vendor_name")) {
          sets.push("vendor_name = @vendor_name");
        }
        values.vendor_name = vendor.name;

        // Cascade to purchase records created from this receipt's linked items
        const linkedInventoryIds = db
          .prepare("SELECT inventory_id FROM receipt_items WHERE receipt_id = ? AND inventory_id IS NOT NULL")
          .all(receiptId) as Array<{ inventory_id: number }>;

        if (linkedInventoryIds.length > 0) {
          const updatePurchase = db.prepare(
            "UPDATE purchases SET vendor_id = ?, vendor_name = ?, updated_at = ? WHERE inventory_id = ? AND notes LIKE ?"
          );
          const now = new Date().toISOString();
          for (const row of linkedInventoryIds) {
            updatePurchase.run(
              body.vendor_id,
              vendor.name,
              now,
              row.inventory_id,
              `Linked from scanned receipt #${receiptId}`
            );
          }
        }
      }
    }

    if (sets.length > 0) {
      sets.push("updated_at = @updated_at");
      values.updated_at = new Date().toISOString();
      db.prepare(`UPDATE receipts SET ${sets.join(", ")} WHERE id = @id`).run(values);
    }

    if (Array.isArray(body.items)) {
      db.prepare("DELETE FROM receipt_items WHERE receipt_id = ? AND inventory_id IS NULL").run(receiptId);
      const now = new Date().toISOString();
      for (const item of body.items) {
        if (!item || typeof item !== "object") continue;
        const desc = typeof item.description === "string" ? item.description.trim() : "";
        if (!desc) continue;
        db.prepare(
          `INSERT INTO receipt_items (receipt_id, description, cost, inventory_id, created_at)
           VALUES (@receipt_id, @description, @cost, NULL, @created_at)`
        ).run({
          receipt_id: receiptId,
          description: desc,
          cost: typeof item.cost === "number" ? item.cost : null,
          created_at: now,
        });
      }
    }

    const receipt = db.prepare("SELECT * FROM receipts WHERE id = ?").get(receiptId);
    const items = db
      .prepare(
        `SELECT ri.*, i.item_number, i.description AS inventory_description
         FROM receipt_items ri
         LEFT JOIN inventory i ON i.id = ri.inventory_id
         WHERE ri.receipt_id = ?
         ORDER BY ri.id`
      )
      .all(receiptId);

    return NextResponse.json({ ok: true, receipt, items });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to update receipt",
        userMessage: "Could not update receipt.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const receiptId = parseReceiptId((await params).id);
    if (!receiptId) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid receipt ID" } },
        { status: 400 }
      );
    }

    const db = getDb();
    const existing = db.prepare("SELECT * FROM receipts WHERE id = ?").get(receiptId);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Receipt not found" } },
        { status: 404 }
      );
    }

    const linkedItems = db
      .prepare("SELECT COUNT(*) AS cnt FROM receipt_items WHERE receipt_id = ? AND inventory_id IS NOT NULL")
      .get(receiptId) as { cnt: number };

    if (linkedItems.cnt > 0) {
      return NextResponse.json(
        { ok: false, error: { code: "HAS_LINKED_ITEMS", message: "Receipt has items linked to inventory", userMessage: `This receipt has ${linkedItems.cnt} item(s) already linked to inventory. Remove those links first.`, actions: ["Unlink or delete the associated inventory items first."] } },
        { status: 409 }
      );
    }

    db.prepare("DELETE FROM receipt_items WHERE receipt_id = ?").run(receiptId);
    db.prepare("DELETE FROM receipts WHERE id = ?").run(receiptId);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to delete receipt",
        userMessage: "Could not delete receipt.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
