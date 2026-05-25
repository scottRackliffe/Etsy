import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { createBackup } from "@/lib/backup";
import { isScheduledBackupDue } from "@/lib/backup-schedule";
import { requireEtsyAccessToken } from "@/lib/auth-session";

export async function POST() {
  try {
    requireEtsyAccessToken(await cookies());
    if (!isScheduledBackupDue()) {
      return NextResponse.json({ ok: true, ran: false });
    }
    const result = await createBackup({ source: "system" });
    return NextResponse.json({ ok: true, ran: true, ...result });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Scheduled backup failed",
        userMessage: "We could not run the scheduled backup.",
        actions: ["Open Config and verify the backup path.", "Retry in a moment."],
      })
    );
  }
}
