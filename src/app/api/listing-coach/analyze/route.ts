import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { researchAndCompose } from "@/lib/listing-coach";
import { parseCoachMultipartPhotos } from "@/lib/listing-coach-multipart";

export async function POST(request: Request) {
  try {
    requireEtsyAccessToken(await cookies());

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Expected multipart form data",
        userMessage: "Photo upload format was invalid.",
        actions: ["Retry from the photo step."],
        canRetry: false,
      });
    }

    const formData = await request.formData();
    const photos = await parseCoachMultipartPhotos(formData);
    const result = await researchAndCompose(photos);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return errorResponse(
      fromUnknownError(error, {
        code: "LISTING_ANALYZE_FAILED",
        message: `Failed to analyze listing coach photos: ${detail}`,
        userMessage: `We could not analyze your photos right now. (${detail})`,
        actions: [
          "Try again in a moment.",
          "Verify AI configuration in Config if this keeps failing.",
        ],
      })
    );
  }
}
