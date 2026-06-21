/**
 * POST /api/inventory/[id]/measure  (ADR-084 / WS-H2)
 *
 * Body: multipart/form-data with a `ruler` image field (item shown next to a
 * ruler/tape). Returns estimated { length, width, height, unit, confidence }.
 * No rendering happens here — the confirm/correct step is mandatory in the UI.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getInventoryById } from "@/lib/inventory";
import { estimateDimensions } from "@/lib/dimension-annotation";
import { validateImageBuffer } from "@/lib/picture-storage";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());
    const id = parsePositiveInt((await context.params).id);
    if (!id) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid inventory id",
        userMessage: "The inventory id must be a positive integer.",
        actions: ["Check the item and retry."],
        fields: { id: ["Must be a positive integer"] },
        canRetry: false,
      });
    }

    const item = getInventoryById(id);
    if (!item) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Inventory item not found",
        userMessage: "The requested inventory item was not found.",
        actions: ["Refresh inventory and select another item."],
        canRetry: false,
      });
    }

    if (!(item as unknown as Record<string, unknown>).picture_1) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "No primary photo",
        userMessage: "Add a primary photo before measuring; the annotation is drawn on it.",
        actions: ["Upload a hero photo first, then try again."],
        canRetry: false,
      });
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Expected multipart/form-data",
        userMessage: "Upload the ruler photo as a file.",
        actions: ["Attach the ruler photo and retry."],
        canRetry: false,
      });
    }

    const formData = await request.formData();
    const file = formData.get("ruler");
    if (!file || !(file instanceof File)) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "No ruler photo provided",
        userMessage: "A photo with a ruler/tape in frame is required.",
        actions: ["Attach the ruler photo and retry."],
        fields: { ruler: ["Required"] },
        canRetry: false,
      });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const validation = await validateImageBuffer(buffer, file.name);
    if (Array.isArray(validation)) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: validation[0]?.message ?? "Invalid image",
        userMessage: validation[0]?.message ?? "The ruler photo could not be processed.",
        actions: ["Check the file and retry."],
        canRetry: false,
      });
    }

    const estimate = await estimateDimensions(item, buffer, file.name);

    return NextResponse.json({
      ok: true,
      ai_available: estimate !== null,
      estimate,
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to estimate dimensions",
        userMessage: "We could not estimate dimensions. You can enter them manually.",
        actions: ["Enter dimensions manually and continue."],
      })
    );
  }
}
