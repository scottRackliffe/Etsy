import { NextRequest, NextResponse } from "next/server";
import { ApiRouteError, errorResponse } from "@/lib/api-error";
import { batchCustomers } from "@/lib/batch-operations";
import { parseBatchIdList, type BatchRequestBody } from "@/lib/batch-request";

const VALID = new Set(["delete"]);

export async function POST(request: NextRequest) {
  let body: BatchRequestBody;
  try {
    body = (await request.json()) as BatchRequestBody;
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
        actions: ["Use delete."],
        canRetry: false,
      })
    );
  }
  let idList: number[];
  try {
    idList = parseBatchIdList("customers", body);
  } catch (err) {
    if (err instanceof Error && err.message === "EMPTY_IDS") {
      return errorResponse(
        new ApiRouteError({
          status: 400,
          code: "VALIDATION_ERROR",
          message: "ids or filter required",
          userMessage: "Select at least one item.",
          actions: ["Provide one or more IDs or a filter."],
          canRetry: false,
        })
      );
    }
    if (err instanceof Error && err.message === "BATCH_TOO_LARGE") {
      return errorResponse(
        new ApiRouteError({
          status: 400,
          code: "BATCH_TOO_LARGE",
          message: "Maximum 100 items per batch operation",
          userMessage: "Select 100 or fewer items at a time.",
          actions: ["Split the selection into smaller batches.", "Narrow your filters."],
          canRetry: false,
        })
      );
    }
    throw err;
  }
  try {
    const result = batchCustomers(action, idList);
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
