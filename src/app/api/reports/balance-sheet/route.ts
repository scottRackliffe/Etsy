import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { buildReport, saveReportArtifact } from "@/lib/reporting";
import { reportResponse, resolveReportFormat, resolveReportParams } from "@/lib/report-http";
import { logActivity } from "@/lib/activity-log";

const REPORT_NAME = "balance-sheet";

export async function GET(request: Request) {
  try {
    const u = new URL(request.url);
    const asOf = u.searchParams.get("as_of") ?? undefined;
    const params = resolveReportParams(request.url);
    if (asOf) params.to_date = asOf;
    const report = buildReport(REPORT_NAME, params);
    const format = resolveReportFormat(request.url);
    logActivity({ action: "report.generated", entityType: "report", entityLabel: REPORT_NAME, detail: { report_name: REPORT_NAME, format } });
    return await reportResponse(REPORT_NAME, report, format);
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to build balance sheet",
        userMessage: "We could not build the balance sheet.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export async function POST(request: Request) {
  try {
    const u = new URL(request.url);
    const asOf = u.searchParams.get("as_of") ?? undefined;
    const params = resolveReportParams(request.url);
    if (asOf) params.to_date = asOf;
    const report = buildReport(REPORT_NAME, params);
    saveReportArtifact(REPORT_NAME, report);
    const format = resolveReportFormat(request.url);
    logActivity({ action: "report.generated", entityType: "report", entityLabel: REPORT_NAME, detail: { report_name: REPORT_NAME, format } });
    return await reportResponse(REPORT_NAME, report, format);
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to generate balance sheet",
        userMessage: "We could not generate the balance sheet.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
