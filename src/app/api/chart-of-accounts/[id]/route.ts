import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/sqlite";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const row = getDb().prepare("SELECT * FROM chart_of_accounts WHERE id = ?").get(id);
  if (!row) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Account not found." } },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true, item: row });
}

export async function PUT(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const body = await request.json();
  const { acct_number, account_name, account_type, normal_balance, description, is_active } = body;

  const existing = getDb().prepare("SELECT * FROM chart_of_accounts WHERE id = ?").get(id);
  if (!existing) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Account not found." } },
      { status: 404 }
    );
  }

  const validTypes = ["Asset", "Liability", "Equity", "Revenue", "Contra-Revenue", "COGS", "Expense"];
  if (account_type && !validTypes.includes(account_type)) {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: `Account type must be one of: ${validTypes.join(", ")}` } },
      { status: 400 }
    );
  }

  if (normal_balance && !["debit", "credit"].includes(normal_balance)) {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Normal balance must be 'debit' or 'credit'." } },
      { status: 400 }
    );
  }

  try {
    getDb()
      .prepare(
        `UPDATE chart_of_accounts
         SET acct_number = COALESCE(?, acct_number),
             account_name = COALESCE(?, account_name),
             account_type = COALESCE(?, account_type),
             normal_balance = COALESCE(?, normal_balance),
             description = COALESCE(?, description),
             is_active = COALESCE(?, is_active),
             updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(
        acct_number ?? null, account_name ?? null, account_type ?? null,
        normal_balance ?? null, description ?? null,
        is_active != null ? (is_active ? 1 : 0) : null, id
      );

    const row = getDb().prepare("SELECT * FROM chart_of_accounts WHERE id = ?").get(id);
    return NextResponse.json({ ok: true, item: row });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return NextResponse.json(
        { ok: false, error: { code: "CONFLICT", message: `Account number '${acct_number}' already exists.` } },
        { status: 409 }
      );
    }
    throw err;
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const existing = getDb().prepare("SELECT * FROM chart_of_accounts WHERE id = ?").get(id);
  if (!existing) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Account not found." } },
      { status: 404 }
    );
  }

  getDb()
    .prepare("UPDATE chart_of_accounts SET is_active = 0, updated_at = datetime('now') WHERE id = ?")
    .run(id);

  return NextResponse.json({ ok: true });
}
