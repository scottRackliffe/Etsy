import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getDb } from "@/lib/sqlite";

async function getCustomerId(context: { params: Promise<{ id: string }> }): Promise<number> {
  const id = parsePositiveInt((await context.params).id);
  if (!id) {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid customer id",
      userMessage: "The customer id must be a positive integer.",
      actions: ["Check the URL and retry."],
      fields: { id: ["Must be a positive integer"] },
      canRetry: false,
    });
  }
  return id;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const customerId = await getCustomerId(context);
    const items = getDb()
      .prepare("SELECT * FROM addresses WHERE customer_id = ? ORDER BY is_default DESC, id DESC")
      .all(customerId);
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load addresses",
        userMessage: "We could not load customer addresses.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const customerId = await getCustomerId(context);
    const body = (await request.json().catch(() => ({}))) as {
      label?: unknown;
      first_line?: unknown;
      second_line?: unknown;
      city?: unknown;
      state?: unknown;
      postal_code?: unknown;
      country?: unknown;
      is_default?: unknown;
    };
    const firstLine = typeof body.first_line === "string" ? body.first_line.trim() : "";
    if (!firstLine) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid address payload",
        userMessage: "Address first line is required.",
        actions: ["Provide first_line and retry."],
        fields: { first_line: ["Required"] },
        canRetry: false,
      });
    }
    const now = new Date().toISOString();
    const result = getDb()
      .prepare(
        `
        INSERT INTO addresses(
          customer_id, label, first_line, second_line, city, state, postal_code, country, is_default, created_at, updated_at
        ) VALUES(
          @customer_id, @label, @first_line, @second_line, @city, @state, @postal_code, @country, @is_default, @created_at, @updated_at
        )
      `
      )
      .run({
        customer_id: customerId,
        label: typeof body.label === "string" ? body.label : null,
        first_line: firstLine,
        second_line: typeof body.second_line === "string" ? body.second_line : null,
        city: typeof body.city === "string" ? body.city : null,
        state: typeof body.state === "string" ? body.state : null,
        postal_code: typeof body.postal_code === "string" ? body.postal_code : null,
        country: typeof body.country === "string" ? body.country : null,
        is_default: body.is_default ? 1 : 0,
        created_at: now,
        updated_at: now,
      });
    const item = getDb()
      .prepare("SELECT * FROM addresses WHERE id = ?")
      .get(result.lastInsertRowid);
    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to create address",
        userMessage: "We could not create the customer address.",
        actions: ["Retry in a moment.", "Check request data and retry."],
      })
    );
  }
}
