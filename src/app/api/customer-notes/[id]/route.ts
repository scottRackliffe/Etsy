import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { logActivity } from "@/lib/activity-log";
import { deleteCustomerNote, getCustomerNote } from "@/lib/customer-notes";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getCustomer } from "@/lib/records";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const id = parsePositiveInt((await context.params).id);
    if (!id) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid note id",
        userMessage: "The note id must be a positive integer.",
        actions: ["Check the URL and retry."],
        fields: { id: ["Must be a positive integer"] },
        canRetry: false,
      });
    }

    const existing = getCustomerNote(id);
    if (!existing) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Note not found",
        userMessage: "That note was not found.",
        actions: ["Refresh and retry."],
        canRetry: false,
      });
    }

    deleteCustomerNote(id);

    const customer = getCustomer(existing.customer_id) as Record<string, unknown> | null;
    const label = customer
      ? [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim()
      : "";
    logActivity({
      action: "customer.note_deleted",
      entityType: "customer",
      entityId: existing.customer_id,
      entityLabel: label || `Customer ${existing.customer_id}`,
      detail: { note_id: id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to delete customer note",
        userMessage: "We could not delete the note.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
