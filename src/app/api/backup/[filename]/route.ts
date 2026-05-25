import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { deleteBackupFile } from "@/lib/backup";
import { requireEtsyAccessToken } from "@/lib/auth-session";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ filename: string }> }
) {
  try {
    requireEtsyAccessToken(await cookies());
    const filename = decodeURIComponent((await context.params).filename ?? "");
    try {
      await deleteBackupFile(filename);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Invalid")) {
        throw new ApiRouteError({
          status: 400,
          code: "VALIDATION_ERROR",
          message: msg,
          userMessage: "That backup filename is not valid.",
          actions: ["Choose a backup from the list."],
          canRetry: false,
        });
      }
      throw err;
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to delete backup",
        userMessage: "We could not delete the backup file.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
