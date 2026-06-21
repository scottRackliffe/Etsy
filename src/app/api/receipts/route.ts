import { NextRequest, NextResponse } from "next/server";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { getDb } from "@/lib/sqlite";
import { logActivity } from "@/lib/activity-log";

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const vendorName = request.nextUrl.searchParams.get("vendor_name");

    let rows;
    if (vendorName) {
      rows = db
        .prepare(
          `SELECT r.*,
            (SELECT COUNT(*) FROM receipt_items ri WHERE ri.receipt_id = r.id) AS total_items,
            (SELECT COUNT(*) FROM receipt_items ri WHERE ri.receipt_id = r.id AND ri.inventory_id IS NULL) AS unassigned_items
          FROM receipts r
          WHERE r.vendor_name = @vendor
          ORDER BY r.purchase_date DESC, r.created_at DESC`
        )
        .all({ vendor: vendorName });
    } else {
      rows = db
        .prepare(
          `SELECT r.*,
            (SELECT COUNT(*) FROM receipt_items ri WHERE ri.receipt_id = r.id) AS total_items,
            (SELECT COUNT(*) FROM receipt_items ri WHERE ri.receipt_id = r.id AND ri.inventory_id IS NULL) AS unassigned_items
          FROM receipts r
          ORDER BY r.purchase_date DESC, r.created_at DESC`
        )
        .all();
    }

    return NextResponse.json({ ok: true, receipts: rows });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load receipts",
        userMessage: "Could not load receipts.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export async function POST(request: Request) {
  try {
    const db = getDb();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    let vendorName = typeof body.vendor_name === "string" ? body.vendor_name.trim() : "";
    const vendorId = typeof body.vendor_id === "number" ? body.vendor_id : null;

    if (vendorId) {
      const vendor = db.prepare("SELECT name FROM vendors WHERE id = ?").get(vendorId) as
        | { name: string }
        | undefined;
      if (vendor) vendorName = vendor.name;
    }

    if (!vendorName) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "vendor_name is required" } },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const result = db
      .prepare(
        `INSERT INTO receipts (vendor_name, vendor_id, purchase_date, receipt_image, shipping_price, reference_number, notes, created_at, updated_at)
         VALUES (@vendor_name, @vendor_id, @purchase_date, @receipt_image, @shipping_price, @reference_number, @notes, @created_at, @updated_at)`
      )
      .run({
        vendor_name: vendorName,
        vendor_id: vendorId,
        purchase_date: typeof body.purchase_date === "string" ? body.purchase_date : null,
        receipt_image: typeof body.receipt_image === "string" ? body.receipt_image : null,
        shipping_price: typeof body.shipping_price === "number" ? body.shipping_price : null,
        reference_number: typeof body.reference_number === "string" ? body.reference_number : null,
        notes: typeof body.notes === "string" ? body.notes : null,
        created_at: now,
        updated_at: now,
      });

    const receiptId = Number(result.lastInsertRowid);

    const items = Array.isArray(body.items) ? body.items : [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const desc = typeof item.description === "string" ? item.description.trim() : "";
      if (!desc) continue;
      db.prepare(
        `INSERT INTO receipt_items (receipt_id, description, cost, inventory_id, created_at)
         VALUES (@receipt_id, @description, @cost, @inventory_id, @created_at)`
      ).run({
        receipt_id: receiptId,
        description: desc,
        cost: typeof item.cost === "number" ? item.cost : null,
        inventory_id: typeof item.inventory_id === "number" ? item.inventory_id : null,
        created_at: now,
      });
    }

    const receipt = db.prepare("SELECT * FROM receipts WHERE id = ?").get(receiptId);
    const receiptItems = db
      .prepare("SELECT * FROM receipt_items WHERE receipt_id = ? ORDER BY id")
      .all(receiptId);

    logActivity({ action: "receipt.created", entityType: "receipt", entityId: receiptId, entityLabel: vendorName });
    return NextResponse.json({ ok: true, receipt, items: receiptItems }, { status: 201 });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to create receipt",
        userMessage: "Could not create receipt.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
