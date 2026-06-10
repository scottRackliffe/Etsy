import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import fsp from "node:fs/promises";
import path from "node:path";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { deleteBackupFile, getBackupDirectory } from "@/lib/backup";
import { requireEtsyAccessToken } from "@/lib/auth-session";

export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> }
) {
  try {
    requireEtsyAccessToken(await cookies());
    const filename = decodeURIComponent((await context.params).filename ?? "");

    if (
      !filename.endsWith(".tar.gz") ||
      filename.includes("..") ||
      filename.includes("/") ||
      filename.includes("\\")
    ) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid backup filename",
        userMessage: "That backup filename is not valid.",
        actions: ["Choose a backup from the list."],
        canRetry: false,
      });
    }

    const filePath = path.join(getBackupDirectory(), filename);

    let stat;
    try {
      stat = await fsp.stat(filePath);
    } catch {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Backup file not found",
        userMessage: "The requested backup file does not exist.",
        actions: ["Refresh the backup list and try again."],
        canRetry: false,
      });
    }

    const fileBuffer = await fsp.readFile(filePath);
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(stat.size),
      },
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to download backup",
        userMessage: "We could not download the backup file.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

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
