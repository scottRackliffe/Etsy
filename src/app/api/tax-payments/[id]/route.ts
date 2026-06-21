import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/sqlite";
import { logActivity } from "@/lib/activity-log";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid ID." } },
      { status: 400 }
    );
  }

  const db = getDb();
  const existing = db.prepare("SELECT payee, reason FROM tax_payments WHERE id = ?").get(numId) as { payee?: string; reason?: string } | undefined;
  db.prepare("DELETE FROM tax_payments WHERE id = ?").run(numId);
  logActivity({ action: "tax_payment.deleted", entityType: "tax_payment", entityId: numId, entityLabel: existing?.payee ?? existing?.reason ?? undefined });
  return new NextResponse(null, { status: 204 });
}
