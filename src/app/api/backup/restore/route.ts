import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { restoreBackup } from "@/lib/backup";
import { requireEtsyAccessToken } from "@/lib/auth-session";

export async function POST(request: Request) {
  try {
    requireEtsyAccessToken(await cookies());
    const body = (await request.json().catch(() => ({}))) as { filename?: string };
    const filename = typeof body.filename === "string" ? body.filename.trim() : "";
    if (!filename) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "filename required",
        userMessage: "Select a backup file to restore.",
        actions: ["Provide filename and retry."],
        fields: { filename: ["Required"] },
        canRetry: false,
      });
    }
    try {
      const result = await restoreBackup(filename);
      return NextResponse.json({ ok: true, ...result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("not found")) {
        throw new ApiRouteError({
          status: 404,
          code: "NOT_FOUND",
          message: msg,
          userMessage: "That backup file was not found.",
          actions: ["Refresh the backup list and retry."],
          canRetry: false,
        });
      }
      if (msg.includes("integrity")) {
        throw new ApiRouteError({
          status: 400,
          code: "VALIDATION_ERROR",
          message: msg,
          userMessage: "That backup file failed integrity check and cannot be restored.",
          actions: ["Choose a different backup file."],
          canRetry: false,
        });
      }
      throw err;
    }
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to restore backup",
        userMessage: "We could not restore from that backup.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
