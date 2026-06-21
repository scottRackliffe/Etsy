import { NextResponse } from "next/server";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { getExpense, patchExpense, deleteExpense } from "@/lib/records";
import { logActivity } from "@/lib/activity-log";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const expense = getExpense(parseInt(id, 10));
    if (!expense) {
      throw new ApiRouteError({ status: 404, code: "NOT_FOUND", message: "Expense not found", userMessage: "Expense not found.", actions: [], canRetry: false });
    }
    return NextResponse.json({ ok: true, item: expense });
  } catch (error) {
    return errorResponse(fromUnknownError(error, {
      code: "INTERNAL_ERROR", message: "Failed to get expense",
      userMessage: "Could not load this expense.", actions: ["Retry in a moment."],
    }));
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const numId = parseInt(id, 10);
    const existing = getExpense(numId);
    if (!existing) {
      throw new ApiRouteError({ status: 404, code: "NOT_FOUND", message: "Expense not found", userMessage: "Expense not found.", actions: [], canRetry: false });
    }
    const body = await request.json();
    const updated = patchExpense(numId, body) as { category?: string; vendor_name?: string } | null;
    logActivity({ action: "expense.updated", entityType: "expense", entityId: numId, entityLabel: updated?.category ?? updated?.vendor_name ?? undefined });
    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(fromUnknownError(error, {
      code: "INTERNAL_ERROR", message: "Failed to update expense",
      userMessage: "Could not update this expense.", actions: ["Retry in a moment."],
    }));
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const numId = parseInt(id, 10);
    const toDelete = getExpense(numId) as { category?: string; vendor_name?: string } | null;
    if (!toDelete) {
      throw new ApiRouteError({ status: 404, code: "NOT_FOUND", message: "Expense not found", userMessage: "Expense not found.", actions: [], canRetry: false });
    }
    const deleted = deleteExpense(numId);
    if (!deleted) {
      throw new ApiRouteError({ status: 404, code: "NOT_FOUND", message: "Expense not found", userMessage: "Expense not found.", actions: [], canRetry: false });
    }
    logActivity({ action: "expense.deleted", entityType: "expense", entityId: numId, entityLabel: toDelete.category ?? toDelete.vendor_name ?? undefined });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(fromUnknownError(error, {
      code: "INTERNAL_ERROR", message: "Failed to delete expense",
      userMessage: "Could not delete this expense.", actions: ["Retry in a moment."],
    }));
  }
}
