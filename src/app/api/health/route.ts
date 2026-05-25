import { NextResponse } from "next/server";
import { isIntegrityWarningActive } from "@/lib/sqlite-integrity";
import { getDb } from "@/lib/sqlite";
import { logger } from "@/lib/logging";

export async function GET() {
  try {
    const db = getDb();
    db.prepare("SELECT 1").get();

    return NextResponse.json(
      {
        ok: true,
        status: "healthy",
        checks: {
          app: true,
          sqlite: true,
          integrity_warning: isIntegrityWarningActive(),
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error("Health check failed", { error: String(error) });
    return NextResponse.json(
      {
        ok: false,
        status: "unhealthy",
        checks: {
          app: true,
          sqlite: false,
        },
        error: {
          code: "HEALTHCHECK_FAILED",
          message: "Healthcheck failed",
          user_message: "The service is temporarily unavailable.",
          actions: ["Try again in a few seconds.", "Contact support if this persists."],
          can_retry: true,
        },
      },
      { status: 503 }
    );
  }
}
