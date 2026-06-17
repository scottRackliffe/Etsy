import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/sqlite";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const row = getDb()
    .prepare(
      `SELECT r.*, da.account_name AS debit_account_name, ca.account_name AS credit_account_name
       FROM gl_transaction_rules r
       LEFT JOIN chart_of_accounts da ON da.acct_number = r.debit_acct
       LEFT JOIN chart_of_accounts ca ON ca.acct_number = r.credit_acct
       WHERE r.id = ?`
    )
    .get(id);

  if (!row) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Rule not found." } },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true, item: row });
}

export async function PUT(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const body = await request.json();
  const { transaction_type, description, debit_acct, credit_acct, source_table, source_column, is_active } = body;

  const existing = getDb().prepare("SELECT * FROM gl_transaction_rules WHERE id = ?").get(id);
  if (!existing) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Rule not found." } },
      { status: 404 }
    );
  }

  const db = getDb();
  if (debit_acct) {
    const debitExists = db.prepare("SELECT 1 FROM chart_of_accounts WHERE acct_number = ?").get(debit_acct);
    if (!debitExists) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: `Debit account '${debit_acct}' not found in chart of accounts.` } },
        { status: 400 }
      );
    }
  }
  if (credit_acct) {
    const creditExists = db.prepare("SELECT 1 FROM chart_of_accounts WHERE acct_number = ?").get(credit_acct);
    if (!creditExists) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: `Credit account '${credit_acct}' not found in chart of accounts.` } },
        { status: 400 }
      );
    }
  }

  db.prepare(
    `UPDATE gl_transaction_rules
     SET transaction_type = COALESCE(?, transaction_type),
         description = COALESCE(?, description),
         debit_acct = COALESCE(?, debit_acct),
         credit_acct = COALESCE(?, credit_acct),
         source_table = COALESCE(?, source_table),
         source_column = COALESCE(?, source_column),
         is_active = COALESCE(?, is_active),
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    transaction_type ?? null, description ?? null,
    debit_acct ?? null, credit_acct ?? null,
    source_table ?? null, source_column ?? null,
    is_active != null ? (is_active ? 1 : 0) : null, id
  );

  const row = db.prepare("SELECT * FROM gl_transaction_rules WHERE id = ?").get(id);
  return NextResponse.json({ ok: true, item: row });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const existing = getDb().prepare("SELECT * FROM gl_transaction_rules WHERE id = ?").get(id);
  if (!existing) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Rule not found." } },
      { status: 404 }
    );
  }

  getDb()
    .prepare("UPDATE gl_transaction_rules SET is_active = 0, updated_at = datetime('now') WHERE id = ?")
    .run(id);

  return NextResponse.json({ ok: true });
}
