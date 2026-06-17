import { NextResponse } from "next/server";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { buildAccountingExportCsv } from "@/lib/reporting";
import { resolveReportParams } from "@/lib/report-http";

const REPORT_NAME = "accounting-export";

export async function GET(request: Request) {
  try {
    const parsed = new URL(request.url);
    const format = (parsed.searchParams.get("format") ?? "csv").toLowerCase();
    if (format !== "csv") {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Accounting export supports format=csv only",
        userMessage: "Accounting export is CSV only.",
        actions: ["Use format=csv and retry."],
        canRetry: false,
      });
    }
    const params = resolveReportParams(request.url);
    const csv = buildAccountingExportCsv(params);
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${REPORT_NAME}-${stamp}.csv"`,
      },
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to build accounting export",
        userMessage: "We could not build the accounting export.",
        actions: ["Retry in a moment."],
      })
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
