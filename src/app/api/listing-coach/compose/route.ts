import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { composeListingCoach, type ConfirmAnswer } from "@/lib/listing-coach";
import { parseCoachJsonField, parseCoachMultipartPhotos } from "@/lib/listing-coach-multipart";

function parseConfirmAnswers(raw: unknown): ConfirmAnswer[] {
  if (!Array.isArray(raw)) {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "confirm_answers must be an array",
      userMessage: "Confirm answers were missing or invalid.",
      actions: ["Go back to the confirm step and retry."],
      fields: { confirm_answers: ["Required array"] },
      canRetry: false,
    });
  }
  const REQUIRED_IDS = ["what_is_it", "included", "condition", "buyer"];
  const MAX_ANSWER_LENGTH = 500;
  const answers: ConfirmAnswer[] = [];
  const fieldErrors: Record<string, string[]> = {};

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const id = typeof obj.id === "string" ? obj.id.trim() : "";
    const answer = typeof obj.answer === "string" ? obj.answer.trim() : "";
    if (!id) continue;
    if (answer.length > MAX_ANSWER_LENGTH) {
      fieldErrors[id] = [`Answer must be ${MAX_ANSWER_LENGTH} characters or fewer`];
    }
    answers.push({ id, answer: answer.slice(0, MAX_ANSWER_LENGTH) });
  }

  const presentIds = new Set(answers.map((a) => a.id));
  for (const reqId of REQUIRED_IDS) {
    if (!presentIds.has(reqId)) {
      fieldErrors[reqId] = ["This confirm card is required"];
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Confirm answers have validation errors",
      userMessage: "Some confirm answers need fixing. Please go back and check.",
      actions: ["Go back to the confirm step and retry."],
      fields: fieldErrors,
      canRetry: false,
    });
  }

  if (answers.length === 0) {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "confirm_answers is empty",
      userMessage: "Please confirm at least one answer before composing.",
      actions: ["Go back to the confirm step and retry."],
      fields: { confirm_answers: ["At least one answer required"] },
      canRetry: false,
    });
  }
  return answers;
}

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
        actions: ["Retry from the Listing Coach confirm step."],
        canRetry: false,
      });
    }

    const formData = await request.formData();
    const photos = await parseCoachMultipartPhotos(formData);
    const confirmAnswersRaw = parseCoachJsonField<unknown>(
      formData,
      "confirm_answers",
      "Confirm answers"
    );
    const confirmAnswers = parseConfirmAnswers(confirmAnswersRaw);
    const price =
      parseCoachJsonField<{ sale_revenue?: number | null; accept_offer_note?: string }>(
        formData,
        "price",
        "Price"
      ) ?? {};
    const identificationOverrideRaw = formData.get("identification_override");
    const identificationOverride =
      typeof identificationOverrideRaw === "string" && identificationOverrideRaw.trim()
        ? identificationOverrideRaw.trim()
        : undefined;
    const suggestedConditionRaw = formData.get("suggested_condition_code");
    const suggestedConditionCode =
      typeof suggestedConditionRaw === "string" && suggestedConditionRaw.trim()
        ? suggestedConditionRaw.trim()
        : undefined;

    const result = await composeListingCoach({
      ...photos,
      confirmAnswers,
      price,
      identificationOverride,
      suggestedConditionCode,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "LISTING_COMPOSE_FAILED",
        message: "Failed to compose listing coach content",
        userMessage: "We could not compose your listing right now.",
        actions: [
          "Try again in a moment.",
          "Verify AI configuration in Config if this keeps failing.",
        ],
      })
    );
  }
}
