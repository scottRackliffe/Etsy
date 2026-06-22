import { NextResponse } from "next/server";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { getCommunicationLog } from "@/lib/communications";

const PAGE_SIZE = 25;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get("type") ?? undefined;
    const orderIdStr = url.searchParams.get("order_id");
    const orderId = orderIdStr ? parseInt(orderIdStr, 10) : undefined;
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") ?? String(PAGE_SIZE), 10) || PAGE_SIZE,
      200
    );
    const offset = Math.max(
      parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
      0
    );

    const { items, total } = getCommunicationLog({
      type,
      orderId: orderId && Number.isFinite(orderId) ? orderId : undefined,
      limit,
      offset,
    });

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
        message: "Failed to load communication log",
        userMessage: "We could not load the communication history. Please try again.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
