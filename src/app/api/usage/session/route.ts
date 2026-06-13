import { NextResponse } from "next/server";
import {
  startSession,
  heartbeatSession,
  endSession,
} from "@/lib/connection-session";

/**
 * POST /api/usage/session
 * Body: { action: "start" | "heartbeat" | "end", service: "etsy" }
 *
 * Also accepts sendBeacon payloads (text/plain with JSON body).
 */
export async function POST(request: Request) {
  try {
    let body: { action?: string; service?: string };
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("text/plain")) {
      body = JSON.parse(await request.text()) as { action?: string; service?: string };
    } else {
      body = (await request.json()) as { action?: string; service?: string };
    }

    const { action, service } = body;
    if (!action || !service) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "action and service are required" } },
        { status: 400 }
      );
    }

    switch (action) {
      case "start": {
        const sessionId = startSession(service);
        return NextResponse.json({ ok: true, session_id: sessionId });
      }
      case "heartbeat":
        heartbeatSession(service);
        return NextResponse.json({ ok: true });
      case "end":
        endSession(service);
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json(
          { ok: false, error: { code: "VALIDATION_ERROR", message: `Unknown action: ${action}` } },
          { status: 400 }
        );
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Session tracking failed" } },
      { status: 500 }
    );
  }
}
