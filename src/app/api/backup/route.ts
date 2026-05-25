import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { createBackup, listBackups } from "@/lib/backup";
import { requireEtsyAccessToken } from "@/lib/auth-session";

export async function GET() {
  try {
    requireEtsyAccessToken(await cookies());
    const { backups, total } = await listBackups();
    return NextResponse.json({ ok: true, backups, total });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to list backups",
        userMessage: "We could not list backups.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export async function POST() {
  try {
    requireEtsyAccessToken(await cookies());
    const result = await createBackup();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to create backup",
        userMessage: "We could not create a backup. Check that the backup directory is writable.",
        actions: ["Open Config and verify the backup path.", "Retry in a moment."],
      })
    );
  }
}
