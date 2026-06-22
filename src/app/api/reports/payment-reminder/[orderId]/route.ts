import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { buildSingleOrderPaymentReminder } from "@/lib/reporting";
import { reportResponse, resolveReportFormat } from "@/lib/report-http";
import { logActivity } from "@/lib/activity-log";

export async function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    const orderId = parsePositiveInt((await context.params).orderId);
    if (!orderId) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid order id",
        userMessage: "The order id must be a positive integer.",
        actions: ["Check the URL and retry."],
        canRetry: false,
      });
    }
    const format = resolveReportFormat(request.url);
    if (format === "csv") {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "CSV not supported for payment reminder letters",
        userMessage: "Payment reminder letters are available in PDF format only.",
        actions: ["Use format=pdf or omit the format parameter."],
        canRetry: false,
      });
    }
    const report = buildSingleOrderPaymentReminder(orderId);
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
    logActivity({
      action: "report.generated",
      entityType: "report",
      entityLabel: `payment-reminder #${orderId}`,
      detail: { report_name: "payment-reminder", format },
    });
    return await reportResponse(report.report_name, report, format);
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to build payment reminder letter",
        userMessage: "We could not generate the payment reminder letter.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
