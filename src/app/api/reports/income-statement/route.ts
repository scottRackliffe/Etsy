import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { buildReport, saveReportArtifact } from "@/lib/reporting";
import { reportResponse, resolveReportFormat, resolveReportParams } from "@/lib/report-http";
import { logActivity } from "@/lib/activity-log";

const REPORT_NAME = "income-statement";

export async function GET(request: Request) {
  try {
    const params = resolveReportParams(request.url);
    const report = buildReport(REPORT_NAME, params);
    const format = resolveReportFormat(request.url);
    logActivity({ action: "report.generated", entityType: "report", entityLabel: REPORT_NAME, detail: { report_name: REPORT_NAME, format } });
    return await reportResponse(REPORT_NAME, report, format);
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to build income statement",
        userMessage: "We could not build the income statement.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export async function POST(request: Request) {
  try {
    const params = resolveReportParams(request.url);
    const report = buildReport(REPORT_NAME, params);
    saveReportArtifact(REPORT_NAME, report);
    const format = resolveReportFormat(request.url);
    logActivity({ action: "report.generated", entityType: "report", entityLabel: REPORT_NAME, detail: { report_name: REPORT_NAME, format } });
    return await reportResponse(REPORT_NAME, report, format);
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to generate income statement",
        userMessage: "We could not generate the income statement.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
