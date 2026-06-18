import { NextResponse } from "next/server";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { listExpenseCategories } from "@/lib/records";

export async function GET() {
  try {
    const options = listExpenseCategories();
    return NextResponse.json(options);
  } catch (error) {
    return errorResponse(fromUnknownError(error, {
      code: "INTERNAL_ERROR", message: "Failed to list expense categories",
      userMessage: "Could not load expense options.", actions: ["Retry in a moment."],
    }));
  }
}
