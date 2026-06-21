import { NextResponse } from "next/server";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { getBillPaymentSummary } from "@/lib/bills";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...getBillPaymentSummary() });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to get bill summary",
        userMessage: "Could not load bill payment summary.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
