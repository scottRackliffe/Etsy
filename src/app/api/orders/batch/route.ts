import { NextRequest, NextResponse } from "next/server";
import { ApiRouteError, errorResponse } from "@/lib/api-error";
import { batchOrders } from "@/lib/batch-operations";

const VALID = new Set(["mark_paid", "mark_shipped", "void"]);

export async function POST(request: NextRequest) {
  let body: { action?: string; ids?: unknown; params?: Record<string, unknown> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse(
      new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid JSON body",
        userMessage: "The request body was not valid JSON.",
        actions: ["Retry with valid JSON."],
        canRetry: false,
      })
    );
  }
  const action = body.action?.trim() ?? "";
  if (!VALID.has(action)) {
    return errorResponse(
      new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid batch action",
        userMessage: "Choose a valid batch action.",
        actions: ["Use mark_paid, mark_shipped, or void."],
        canRetry: false,
      })
    );
  }
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return errorResponse(
      new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "ids must be a non-empty array",
        userMessage: "Select at least one item.",
        actions: ["Provide one or more IDs."],
        canRetry: false,
      })
    );
  }
  try {
    const result = batchOrders(action, body.ids, body.params ?? {});
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof Error && err.message === "BATCH_TOO_LARGE") {
      return errorResponse(
        new ApiRouteError({
          status: 400,
          code: "BATCH_TOO_LARGE",
          message: "Maximum 100 items per batch operation",
          userMessage: "Select 100 or fewer items at a time.",
          actions: ["Split the selection into smaller batches."],
          canRetry: false,
        })
      );
    }
    throw err;
  }
}
