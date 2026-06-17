import { NextResponse } from "next/server";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import {
  buildPrintQueuePdf,
  parsePrintQueueRequestItems,
  validatePrintQueueItems,
} from "@/lib/print-queue-pdf";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    let items;
    try {
      items = parsePrintQueueRequestItems(body);
    } catch {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid print queue request",
        userMessage: "Send between 1 and 50 print queue items with type and orderId.",
        actions: ["Check the print queue and try again."],
        canRetry: false,
      });
    }

    const failures = validatePrintQueueItems(items);
    if (failures.length > 0) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Print queue items failed validation",
        userMessage: failures.join(" "),
        actions: ["Remove invalid items from the queue and try again."],
        canRetry: false,
      });
    }

    const pdf = await buildPrintQueuePdf(items);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": 'inline; filename="print-queue.pdf"',
      },
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to build print queue PDF",
        userMessage: "We could not generate the combined print document.",
        actions: ["Retry in a moment.", "Try printing fewer items at once."],
      })
    );
  }
}
