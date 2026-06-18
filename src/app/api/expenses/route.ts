import { NextResponse } from "next/server";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { listExpenses, createExpense } from "@/lib/records";

export async function GET(request: Request) {
  try {
    const u = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(u.searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
    const offset = Math.max(parseInt(u.searchParams.get("offset") ?? "0", 10) || 0, 0);
    const search = u.searchParams.get("search") ?? undefined;
    const category = u.searchParams.get("category") ?? undefined;
    const from_date = u.searchParams.get("from_date") ?? undefined;
    const to_date = u.searchParams.get("to_date") ?? undefined;
    const is_recurring_raw = u.searchParams.get("is_recurring");
    const is_recurring = is_recurring_raw === "0" || is_recurring_raw === "1" ? parseInt(is_recurring_raw, 10) : undefined;
    const sortBy = u.searchParams.get("sortBy") ?? undefined;
    const sortDir = (u.searchParams.get("sortDir") ?? undefined) as "asc" | "desc" | undefined;

    const { items, total } = listExpenses({ limit, offset, search, category, from_date, to_date, is_recurring, sortBy, sortDir });
    return NextResponse.json({
      items,
      pagination: { limit, offset, total, has_more: offset + limit < total },
    });
  } catch (error) {
    return errorResponse(fromUnknownError(error, {
      code: "INTERNAL_ERROR",
      message: "Failed to list expenses",
      userMessage: "Could not load expenses.",
      actions: ["Retry in a moment."],
    }));
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.expense_date?.trim()) {
      throw new ApiRouteError({ status: 400, code: "VALIDATION_ERROR", message: "expense_date is required", userMessage: "Please enter a date.", actions: [], canRetry: false });
    }
    if (body.amount === undefined || body.amount === null || isNaN(Number(body.amount))) {
      throw new ApiRouteError({ status: 400, code: "VALIDATION_ERROR", message: "amount is required", userMessage: "Please enter an amount.", actions: [], canRetry: false });
    }
    if (!body.category?.trim()) {
      throw new ApiRouteError({ status: 400, code: "VALIDATION_ERROR", message: "category is required", userMessage: "Please select a category.", actions: [], canRetry: false });
    }
    const expense = createExpense(body);
    return NextResponse.json(expense, { status: 201 });
  } catch (error) {
    return errorResponse(fromUnknownError(error, {
      code: "INTERNAL_ERROR",
      message: "Failed to create expense",
      userMessage: "Could not create the expense.",
      actions: ["Retry in a moment."],
    }));
  }
}
