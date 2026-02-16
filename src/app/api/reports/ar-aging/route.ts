import { cookies } from "next/headers";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { buildReport, saveReportArtifact } from "@/lib/reporting";
import { reportResponse, resolveReportFormat } from "@/lib/report-http";

const REPORT_NAME = "ar-aging";

export async function GET(request: Request) {
  try {
    requireEtsyAccessToken(await cookies());
    const report = buildReport(REPORT_NAME);
    const format = resolveReportFormat(request.url);
    return await reportResponse(REPORT_NAME, report, format);
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to build report",
        userMessage: "We could not build this report.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export async function POST(request: Request) {
  try {
    requireEtsyAccessToken(await cookies());
    const report = buildReport(REPORT_NAME);
    saveReportArtifact(REPORT_NAME, report);
    const format = resolveReportFormat(request.url);
    return await reportResponse(REPORT_NAME, report, format);
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to generate report artifact",
        userMessage: "We could not generate the report artifact.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
