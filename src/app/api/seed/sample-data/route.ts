import { NextResponse } from "next/server";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { hasSampleData, loadSampleData, removeSampleData } from "@/lib/seed-sample-data";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, loaded: hasSampleData() });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to check sample data status",
        userMessage: "We could not check sample data status.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export async function POST() {
  try {
    if (hasSampleData()) {
      throw new ApiRouteError({
        status: 409,
        code: "SAMPLE_DATA_EXISTS",
        message: "Sample data is already loaded",
        userMessage:
          "Sample data has already been loaded. Remove it first from Config if you want to reload.",
        actions: ["Remove sample data first, then load again."],
        canRetry: false,
      });
    }

    const counts = loadSampleData();
    return NextResponse.json({ ok: true, ...counts }, { status: 201 });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load sample data",
        userMessage: "We could not load sample data.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export async function DELETE() {
  try {
    if (!removeSampleData()) {
      throw new ApiRouteError({
        status: 404,
        code: "NO_SAMPLE_DATA",
        message: "No sample data found",
        userMessage: "No sample data was found to remove.",
        actions: ["Load sample data first if you want demo records."],
        canRetry: false,
      });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to remove sample data",
        userMessage: "We could not remove sample data.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
