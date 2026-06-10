import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { assertRecordNotStale, getIfMatchHeader } from "@/lib/if-match";
import { deleteCustomer, getCustomer, patchCustomer } from "@/lib/records";
import { getCustomerActiveOrderCount } from "@/lib/customer-orders";
import { logActivity } from "@/lib/activity-log";

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
    const id = await getCustomerId(context);
    const customer = getCustomer(id);
    if (!customer) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Customer not found",
        userMessage: "The requested customer was not found.",
        actions: ["Refresh and select another customer."],
        canRetry: false,
      });
    }
    return NextResponse.json({
      ok: true,
      customer: {
        ...(customer as Record<string, unknown>),
        order_count: getCustomerActiveOrderCount(id),
      },
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load customer",
        userMessage: "We could not load the customer.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const id = await getCustomerId(context);
    assertRecordNotStale("customers", id, getIfMatchHeader(request));
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const customer = patchCustomer(id, body);
    if (!customer) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Customer not found",
        userMessage: "The requested customer was not found.",
        actions: ["Refresh and retry."],
        canRetry: false,
      });
    }
    logActivity({
      action: "customer.updated",
      entityType: "customer",
      entityId: id,
      entityLabel: `${(customer as { first_name?: string }).first_name ?? ""} ${(customer as { last_name?: string }).last_name ?? ""}`.trim(),
    });
    return NextResponse.json({ ok: true, customer });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to update customer",
        userMessage: "We could not update the customer.",
        actions: ["Retry in a moment.", "Check request data and retry."],
      })
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const id = await getCustomerId(context);
    const existing = getCustomer(id);

    const { getDb } = await import("@/lib/sqlite");
    const orderCount = getDb()
      .prepare("SELECT COUNT(*) as count FROM orders WHERE customer_id = ?")
      .get(id) as { count: number };

    if (orderCount.count > 0) {
      throw new ApiRouteError({
        status: 409,
        code: "REFERENTIAL_INTEGRITY",
        message: "Cannot delete customer with orders",
        userMessage: "This customer has orders and cannot be deleted. You can deactivate them instead.",
        actions: ["Deactivate the customer instead of deleting.", "Void or reassign their orders first."],
        canRetry: false,
      });
    }

    const deleted = deleteCustomer(id);
    if (!deleted) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Customer not found",
        userMessage: "The requested customer was not found.",
        actions: ["Refresh and retry."],
        canRetry: false,
      });
    }
    logActivity({
      action: "customer.deleted",
      entityType: "customer",
      entityId: id,
      entityLabel: existing
        ? `${(existing as { first_name?: string }).first_name ?? ""} ${(existing as { last_name?: string }).last_name ?? ""}`.trim()
        : undefined,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to delete customer",
        userMessage: "We could not delete the customer.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
