import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePagination, parsePositiveInt } from "@/lib/api-utils";
import { logActivity } from "@/lib/activity-log";
import { CUSTOMER_NOTE_TYPES, createCustomerNote, listCustomerNotes } from "@/lib/customer-notes";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getCustomer } from "@/lib/records";

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

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const customerId = await getCustomerId(context);
    const customer = getCustomer(customerId);
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
    const { limit, offset } = parsePagination(request.nextUrl.searchParams);
    const { items, total } = listCustomerNotes(customerId, limit, offset);
    return NextResponse.json({
      ok: true,
      items,
      pagination: { limit, offset, total, has_more: offset + items.length < total },
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load customer notes",
        userMessage: "We could not load customer notes.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const customerId = await getCustomerId(context);
    const customer = getCustomer(customerId) as Record<string, unknown> | null;
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

    const body = (await request.json().catch(() => ({}))) as {
      note_text?: string;
      note_type?: string;
    };
    const noteText = typeof body.note_text === "string" ? body.note_text.trim() : "";
    if (!noteText) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "note_text required",
        userMessage: "Note text is required.",
        actions: ["Enter note text and retry."],
        fields: { note_text: ["Required"] },
        canRetry: false,
      });
    }
    if (noteText.length > 2000) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "note_text too long",
        userMessage: "Note text must be 2000 characters or fewer.",
        actions: ["Shorten the note and retry."],
        fields: { note_text: ["Maximum 2000 characters"] },
        canRetry: false,
      });
    }

    const noteType =
      typeof body.note_type === "string" && CUSTOMER_NOTE_TYPES.has(body.note_type)
        ? body.note_type
        : "general";

    const note = createCustomerNote(customerId, noteText, noteType);
    const label = [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim();
    logActivity({
      action: "customer.note_added",
      entityType: "customer",
      entityId: customerId,
      entityLabel: label || `Customer ${customerId}`,
      detail: { note_type: noteType },
    });

    return NextResponse.json({ ok: true, note }, { status: 201 });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to create customer note",
        userMessage: "We could not save the note.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
