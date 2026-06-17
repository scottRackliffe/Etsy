import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/sqlite";

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

  getDb().prepare("DELETE FROM tax_payments WHERE id = ?").run(numId);
  return new NextResponse(null, { status: 204 });
}
