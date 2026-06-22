import { NextResponse } from "next/server";
import { errorResponse, fromUnknownError, ApiRouteError } from "@/lib/api-error";
import { getCandidates, MESSAGE_TYPES, type MessageType } from "@/lib/communications";

const PAGE_SIZE = 50;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get("type") as MessageType | null;

    if (!type || !MESSAGE_TYPES[type]) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Missing or invalid type parameter",
        userMessage: "Specify a valid message type: payment_reminder or thank_you.",
        actions: ["Add ?type=payment_reminder or ?type=thank_you to the request."],
        canRetry: false,
      });
    }

    const limit = Math.min(
      parseInt(url.searchParams.get("limit") ?? String(PAGE_SIZE), 10) || PAGE_SIZE,
      200
    );
    const offset = Math.max(
      parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
      0
    );

    const { items, total } = getCandidates(type, { limit, offset });

    return NextResponse.json({
      ok: true,
      items,
      pagination: {
        limit,
        offset,
        total,
        has_more: offset + items.length < total,
      },
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load communication candidates",
        userMessage: "We could not load the candidate list. Please try again.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
