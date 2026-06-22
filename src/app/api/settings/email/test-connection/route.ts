import { NextResponse } from "next/server";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { testSmtpConnection } from "@/lib/email";

export async function POST() {
  try {
    const result = await testSmtpConnection();
    return NextResponse.json({
      ok: result.ok,
      message: result.ok ? "SMTP connection successful." : result.error,
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "SMTP connection test failed",
        userMessage: "Could not test the SMTP connection.",
        actions: ["Verify your SMTP settings and retry."],
      })
    );
  }
}
