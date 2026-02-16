import { NextResponse } from "next/server";
import {
  ReportResult,
  ReportFormat,
  buildReportCsv,
  buildReportPdf,
  parseReportFormat,
} from "@/lib/reporting";

export function resolveReportFormat(url: string): ReportFormat {
  const parsed = new URL(url);
  return parseReportFormat(parsed.searchParams.get("format"));
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

  const pdf = await buildReportPdf(report);
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${safeName}.pdf"`,
    },
  });
}
