import { NextResponse } from "next/server";
import {
  ReportResult,
  ReportFormat,
  ReportParams,
  buildReportCsv,
  parseReportFormat,
} from "@/lib/reporting";

export function resolveReportFormat(url: string): ReportFormat {
  const parsed = new URL(url);
  return parseReportFormat(parsed.searchParams.get("format"));
}

export function resolveReportParams(url: string): ReportParams {
  const parsed = new URL(url);
  const from_date =
    parsed.searchParams.get("from_date") ?? parsed.searchParams.get("start_date") ?? undefined;
  const to_date =
    parsed.searchParams.get("to_date") ?? parsed.searchParams.get("end_date") ?? undefined;
  return { from_date: from_date ?? undefined, to_date: to_date ?? undefined };
}

export async function reportResponse(
  reportName: string,
  report: ReportResult,
  format: ReportFormat
): Promise<NextResponse> {
  const safeName = reportName.replace(/\s+/g, "-").toLowerCase();

  if (format === "json") {
    return NextResponse.json({ ok: true, report });
  }

  if (format === "csv") {
    return new NextResponse(buildReportCsv(report), {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${safeName}.csv"`,
      },
    });
  }

  // Default: return JSON (PDF generation removed — browser handles print-to-PDF)
  return NextResponse.json({ ok: true, report });
}
