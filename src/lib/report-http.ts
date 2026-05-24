import { NextResponse } from "next/server";
import {
  ReportResult,
  ReportFormat,
  ReportParams,
  buildReportCsv,
  buildReportPdf,
  parseReportFormat,
} from "@/lib/reporting";

export function resolveReportFormat(url: string): ReportFormat {
  const parsed = new URL(url);
  return parseReportFormat(parsed.searchParams.get("format"));
}

export function resolveReportParams(url: string): ReportParams {
  const parsed = new URL(url);
  const from_date = parsed.searchParams.get("from_date") ?? undefined;
  const to_date = parsed.searchParams.get("to_date") ?? undefined;
  return { from_date, to_date };
}

export async function reportResponse(
  reportName: string,
  report: ReportResult,
  format: ReportFormat
): Promise<NextResponse> {
  const safeName = reportName.replace(/\s+/g, "-").toLowerCase();
  if (format === "csv") {
    return new NextResponse(buildReportCsv(report), {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${safeName}.csv"`,
      },
    });
  }

  try {
    const pdf = await buildReportPdf(report);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${safeName}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "PDF generation failed",
          user_message: "Report generation failed. Please try again.",
          actions: ["Try again.", "Export as CSV instead."],
          can_retry: true,
        },
      },
      { status: 500 }
    );
  }
}
