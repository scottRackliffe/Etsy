import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { buildReport, buildSingleOrderThankYou, saveReportArtifact } from "@/lib/reporting";
import { reportResponse, resolveReportFormat } from "@/lib/report-http";
import { logActivity } from "@/lib/activity-log";

const REPORT_NAME = "thank-you-note";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const orderIdRaw = url.searchParams.get("order_id");
    const format = resolveReportFormat(request.url);

    if (orderIdRaw) {
      const orderId = parseInt(orderIdRaw, 10);
      if (!Number.isFinite(orderId) || orderId <= 0) {
        throw new ApiRouteError({
          status: 400,
          code: "VALIDATION_ERROR",
          message: "Invalid order_id",
          userMessage: "The order_id must be a positive integer.",
          actions: ["Check the order_id and retry."],
          canRetry: false,
        });
      }
      if (format === "csv") {
        throw new ApiRouteError({
          status: 400,
          code: "VALIDATION_ERROR",
          message: "CSV not supported for thank-you notes",
          userMessage: "Thank-you notes are available in PDF format only.",
          actions: ["Use format=pdf or omit the format parameter."],
          canRetry: false,
        });
      }
      const report = buildSingleOrderThankYou(orderId);
      if (!report) {
        throw new ApiRouteError({
          status: 404,
          code: "NOT_FOUND",
          message: "Order not found",
          userMessage: "That order was not found or is not active.",
          actions: ["Refresh the order list and retry."],
          canRetry: false,
        });
      }
      logActivity({ action: "report.generated", entityType: "report", entityLabel: `${REPORT_NAME} #${orderId}`, detail: { report_name: REPORT_NAME, format } });
      return await reportResponse(report.report_name, report, format);
    }

    const report = buildReport(REPORT_NAME);
    logActivity({ action: "report.generated", entityType: "report", entityLabel: REPORT_NAME, detail: { report_name: REPORT_NAME, format } });
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
    const report = buildReport(REPORT_NAME);
    saveReportArtifact(REPORT_NAME, report);
    const format = resolveReportFormat(request.url);
    logActivity({ action: "report.generated", entityType: "report", entityLabel: REPORT_NAME, detail: { report_name: REPORT_NAME, format } });
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
