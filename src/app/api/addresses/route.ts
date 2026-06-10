import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePagination, parseOptionalString } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getDb } from "@/lib/sqlite";

export async function GET(request: NextRequest) {
  try {
    requireEtsyAccessToken(await cookies());
    const params = request.nextUrl.searchParams;
    const { limit, offset } = parsePagination(params);
    const customerIdRaw = parseOptionalString(params, "customer_id");
    const customerId = customerIdRaw ? parseInt(customerIdRaw, 10) : undefined;

    const db = getDb();
    const binds: Record<string, unknown> = { limit, offset };
    let where = "WHERE 1=1";
    if (customerId && Number.isFinite(customerId)) {
      where += " AND customer_id = @customer_id";
      binds.customer_id = customerId;
    }

    const total = (
      db.prepare(`SELECT COUNT(*) AS c FROM addresses ${where}`).get(binds) as { c: number }
    ).c;
    const items = db
      .prepare(
        `SELECT * FROM addresses ${where} ORDER BY is_default DESC, id DESC LIMIT @limit OFFSET @offset`
      )
      .all(binds);

    return NextResponse.json({
      ok: true,
      items,
      pagination: { limit, offset, total, has_more: offset + items.length < total },
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load addresses",
        userMessage: "We could not load addresses.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
