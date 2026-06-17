import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/sqlite";

export async function GET() {
  const rows = getDb()
    .prepare(
      `SELECT id, acct_number, account_name, account_type, normal_balance,
              description, is_active, created_at, updated_at
       FROM chart_of_accounts
       ORDER BY acct_number ASC`
    )
    .all();

  return NextResponse.json({ ok: true, items: rows });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { acct_number, account_name, account_type, normal_balance, description } = body;

  if (!acct_number || !account_name || !account_type || !normal_balance) {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Account number, name, type, and normal balance are required." } },
      { status: 400 }
    );
  }

  const validTypes = ["Asset", "Liability", "Equity", "Revenue", "Contra-Revenue", "COGS", "Expense"];
  if (!validTypes.includes(account_type)) {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: `Account type must be one of: ${validTypes.join(", ")}` } },
      { status: 400 }
    );
  }

  if (!["debit", "credit"].includes(normal_balance)) {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Normal balance must be 'debit' or 'credit'." } },
      { status: 400 }
    );
  }

  try {
    const result = getDb()
      .prepare(
        `INSERT INTO chart_of_accounts (acct_number, account_name, account_type, normal_balance, description)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(acct_number, account_name, account_type, normal_balance, description || null);

    const row = getDb().prepare("SELECT * FROM chart_of_accounts WHERE id = ?").get(result.lastInsertRowid);
    return NextResponse.json({ ok: true, item: row }, { status: 201 });
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
