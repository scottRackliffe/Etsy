import { NextRequest, NextResponse } from "next/server";
import { getExpense, listBillPayments, createBillPayment, deleteBillPayment } from "@/lib/records";
import { logActivity } from "@/lib/activity-log";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params;
  const expenseId = Number(id);
  if (!Number.isFinite(expenseId)) {
    return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid expense ID." } }, { status: 400 });
  }
  const expense = getExpense(expenseId);
  if (!expense) {
    return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Expense not found." } }, { status: 404 });
  }
  const payments = listBillPayments(expenseId);
  return NextResponse.json({ ok: true, items: payments });
}

export async function POST(request: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params;
  const expenseId = Number(id);
  if (!Number.isFinite(expenseId)) {
    return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid expense ID." } }, { status: 400 });
  }
  const expense = getExpense(expenseId);
  if (!expense) {
    return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Expense not found." } }, { status: 404 });
  }

  const body = await request.json();
  const { payment_date, amount, payment_method, reference_number, notes } = body;

  if (!payment_date || amount == null || amount <= 0) {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Payment date and a positive amount are required." } },
      { status: 400 }
    );
  }

  const payment = createBillPayment(expenseId, {
    payment_date,
    amount: Number(amount),
    payment_method: payment_method || null,
    reference_number: reference_number || null,
    notes: notes || null,
  });

  const updated = getExpense(expenseId) as { category?: string; vendor_name?: string } | null;
  logActivity({ action: "expense.payment_recorded", entityType: "expense", entityId: expenseId, entityLabel: updated?.category ?? updated?.vendor_name ?? undefined, detail: { amount: Number(amount) } });
  return NextResponse.json({ ok: true, item: payment, expense: updated }, { status: 201 });
}

export async function DELETE(request: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params;
  const expenseId = Number(id);

  const url = new URL(request.url);
  const paymentId = Number(url.searchParams.get("paymentId"));
  if (!Number.isFinite(expenseId) || !Number.isFinite(paymentId)) {
    return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid IDs." } }, { status: 400 });
  }

  const deleted = deleteBillPayment(expenseId, paymentId);
  if (!deleted) {
    return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Payment not found." } }, { status: 404 });
  }

  const updated = getExpense(expenseId);
  return NextResponse.json({ ok: true, expense: updated });
}
