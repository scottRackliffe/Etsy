import { cookies } from "next/headers";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { buildReport, buildSingleOrderInvoice, saveReportArtifact } from "@/lib/reporting";
import { reportResponse, resolveReportFormat } from "@/lib/report-http";

const REPORT_NAME = "invoice";

export async function GET(request: Request) {
  try {
    requireEtsyAccessToken(await cookies());
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
      const report = buildSingleOrderInvoice(orderId);
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
      return await reportResponse(report.report_name, report, format);
    }

    const report = buildReport(REPORT_NAME);
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
