import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/sqlite";

export async function GET() {
  const rows = getDb()
    .prepare(
      `SELECT r.id, r.transaction_type, r.description,
              r.debit_acct, r.credit_acct,
              r.source_table, r.source_column,
              r.is_active, r.created_at, r.updated_at,
              da.account_name AS debit_account_name,
              ca.account_name AS credit_account_name
       FROM gl_transaction_rules r
       LEFT JOIN chart_of_accounts da ON da.acct_number = r.debit_acct
       LEFT JOIN chart_of_accounts ca ON ca.acct_number = r.credit_acct
       ORDER BY r.transaction_type ASC`
    )
    .all();

  return NextResponse.json({ ok: true, items: rows });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { transaction_type, description, debit_acct, credit_acct, source_table, source_column } = body;

  if (!transaction_type || !debit_acct || !credit_acct) {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Transaction type, debit account, and credit account are required." } },
      { status: 400 }
    );
  }

  const db = getDb();
  const debitExists = db.prepare("SELECT 1 FROM chart_of_accounts WHERE acct_number = ?").get(debit_acct);
  const creditExists = db.prepare("SELECT 1 FROM chart_of_accounts WHERE acct_number = ?").get(credit_acct);

  if (!debitExists) {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: `Debit account '${debit_acct}' not found in chart of accounts.` } },
      { status: 400 }
    );
  }
  if (!creditExists) {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: `Credit account '${credit_acct}' not found in chart of accounts.` } },
      { status: 400 }
    );
  }

  const result = db
    .prepare(
      `INSERT INTO gl_transaction_rules (transaction_type, description, debit_acct, credit_acct, source_table, source_column)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(transaction_type, description || null, debit_acct, credit_acct, source_table || null, source_column || null);

  const row = db.prepare("SELECT * FROM gl_transaction_rules WHERE id = ?").get(result.lastInsertRowid);
  return NextResponse.json({ ok: true, item: row }, { status: 201 });
}
