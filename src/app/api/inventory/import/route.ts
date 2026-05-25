import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { importInventoryCsv, MAX_FILE_BYTES } from "@/lib/inventory-csv-import";

export async function POST(request: Request) {
  try {
    requireEtsyAccessToken(await cookies());
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Missing CSV file",
        userMessage: "Choose a CSV file to import.",
        actions: ["Select a .csv file and try again."],
        canRetry: false,
      });
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new ApiRouteError({
        status: 413,
        code: "VALIDATION_ERROR",
        message: "CSV file too large",
        userMessage: "The CSV file exceeds the 5 MB limit.",
        actions: ["Split the file into smaller imports."],
        canRetry: false,
      });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = importInventoryCsv(buffer, file.name);
    if ("error" in result) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: result.error,
        userMessage: result.error,
        actions: ["Fix the CSV header and try again."],
        canRetry: false,
      });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "CSV import failed",
        userMessage: "We could not import the CSV file.",
        actions: ["Check the file format and retry."],
      })
    );
  }
}
