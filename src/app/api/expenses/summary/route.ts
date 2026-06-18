import { NextResponse } from "next/server";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { getExpenseSummary } from "@/lib/records";

export async function GET(request: Request) {
  try {
    const u = new URL(request.url);
    const from_date = u.searchParams.get("from_date") ?? undefined;
    const to_date = u.searchParams.get("to_date") ?? undefined;
    const summary = getExpenseSummary(from_date, to_date);
    return NextResponse.json(summary);
  } catch (error) {
    return errorResponse(fromUnknownError(error, {
      code: "INTERNAL_ERROR", message: "Failed to get expense summary",
      userMessage: "Could not load expense summary.", actions: ["Retry in a moment."],
    }));
  }
}
