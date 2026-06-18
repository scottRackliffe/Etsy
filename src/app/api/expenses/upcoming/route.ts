import { NextResponse } from "next/server";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { listUpcomingExpenses } from "@/lib/records";

export async function GET(request: Request) {
  try {
    const u = new URL(request.url);
    const days = Math.min(Math.max(parseInt(u.searchParams.get("days") ?? "30", 10) || 30, 1), 365);
    const items = listUpcomingExpenses(days);
    return NextResponse.json({ items });
  } catch (error) {
    return errorResponse(fromUnknownError(error, {
      code: "INTERNAL_ERROR", message: "Failed to list upcoming expenses",
      userMessage: "Could not load upcoming expenses.", actions: ["Retry in a moment."],
    }));
  }
}
