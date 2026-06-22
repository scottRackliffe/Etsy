import { NextResponse } from "next/server";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { getSetting, setSetting } from "@/lib/settings-store";
import { encryptSmtpPassword } from "@/lib/email";

// ---------------------------------------------------------------------------
// GET — return masked email settings (password never returned)
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    const hasPassword = !!getSetting("email.smtp_pass_encrypted");
    return NextResponse.json({
      ok: true,
      config: {
        smtp_host: getSetting("email.smtp_host") ?? "",
        smtp_port: getSetting("email.smtp_port") ?? "587",
        smtp_secure: getSetting("email.smtp_secure") ?? "false",
        smtp_user: getSetting("email.smtp_user") ?? "",
        smtp_pass_set: hasPassword,   // boolean — password never returned in plaintext
        from_name: getSetting("email.from_name") ?? "",
        from_address: getSetting("email.from_address") ?? "",
        enabled: getSetting("email.enabled") ?? "false",
      },
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load email settings",
        userMessage: "We could not load email settings.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

// ---------------------------------------------------------------------------
// PUT — save SMTP settings (encrypt password if provided)
// ---------------------------------------------------------------------------
export async function PUT(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      smtp_host?: unknown;
      smtp_port?: unknown;
      smtp_secure?: unknown;
      smtp_user?: unknown;
      smtp_pass?: unknown;      // plaintext — encrypted on save, never stored raw
      from_name?: unknown;
      from_address?: unknown;
      enabled?: unknown;
    };

    if (typeof body.smtp_host === "string") setSetting("email.smtp_host", body.smtp_host);
    if (typeof body.smtp_port === "string") setSetting("email.smtp_port", body.smtp_port);
    if (typeof body.smtp_secure === "string") setSetting("email.smtp_secure", body.smtp_secure);
    if (typeof body.smtp_user === "string") setSetting("email.smtp_user", body.smtp_user);
    if (typeof body.smtp_pass === "string" && body.smtp_pass.trim()) {
      setSetting("email.smtp_pass_encrypted", encryptSmtpPassword(body.smtp_pass));
    }
    if (typeof body.from_name === "string") setSetting("email.from_name", body.from_name);
    if (typeof body.from_address === "string") setSetting("email.from_address", body.from_address);
    if (typeof body.enabled === "string") setSetting("email.enabled", body.enabled);

    const hasPassword = !!getSetting("email.smtp_pass_encrypted");
    return NextResponse.json({
      ok: true,
      config: {
        smtp_host: getSetting("email.smtp_host") ?? "",
        smtp_port: getSetting("email.smtp_port") ?? "587",
        smtp_secure: getSetting("email.smtp_secure") ?? "false",
        smtp_user: getSetting("email.smtp_user") ?? "",
        smtp_pass_set: hasPassword,
        from_name: getSetting("email.from_name") ?? "",
        from_address: getSetting("email.from_address") ?? "",
        enabled: getSetting("email.enabled") ?? "false",
      },
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "VALIDATION_ERROR",
        message: "Failed to save email settings",
        userMessage: "We could not save email settings.",
        actions: ["Check the fields and retry."],
        canRetry: false,
      })
    );
  }
}
