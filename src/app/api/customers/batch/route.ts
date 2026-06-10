import { NextRequest, NextResponse } from "next/server";
import { ApiRouteError, errorResponse } from "@/lib/api-error";
import { batchCustomers, type BatchResult } from "@/lib/batch-operations";
import { parseBatchIdList, type BatchRequestBody } from "@/lib/batch-request";

const VALID = new Set(["delete"]);
const CHUNK_SIZE = 100;

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
    throw err;
  }
  try {
    const aggregated: BatchResult = { succeeded: 0, failed: [], total: idList.length };
    for (let i = 0; i < idList.length; i += CHUNK_SIZE) {
      const chunk = idList.slice(i, i + CHUNK_SIZE);
      const result = batchCustomers(action, chunk);
      aggregated.succeeded += result.succeeded;
      aggregated.failed.push(...result.failed);
    }
    return NextResponse.json({ ok: true, ...aggregated });
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
