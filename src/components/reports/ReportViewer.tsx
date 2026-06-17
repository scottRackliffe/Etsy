"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

type ReportMetricValue = number | string;

type ReportSection = {
  title: string;
  rows: Array<Record<string, ReportMetricValue>>;
  compact?: boolean;
  no_totals?: boolean;
};

export type ReportData = {
  report_name: string;
  generated_at: string;
  summary: string;
  metrics: Record<string, ReportMetricValue>;
  sections: ReportSection[];
};

function formatMetricLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCellValue(value: ReportMetricValue): string {
  if (typeof value === "number") {
    if (
      String(value).includes(".") ||
      value > 100 ||
      value < 0
    ) {
      return value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
    return String(value);
  }
  return String(value);
}

function isNumericColumn(key: string, rows: Array<Record<string, number | string>>): boolean {
  return rows.some((r) => typeof r[key] === "number");
}

function formatColumnHeader(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const REPORT_DISPLAY_NAMES: Record<string, string> = {
  "sales": "Sales",
  "costs": "Costs",
  "profit-by-item": "Profit by Item",
  "outstanding-items": "Outstanding Items",
  "ar-aging": "Accounts Receivable Aging",
  "vendor-profitability": "Vendor Profitability",
  "sales-tax-summary": "Sales Tax Summary",
  "inventory-aging": "Inventory Aging",
  "accounting-export": "Accounting Export",
};

function displayReportName(name: string): string {
  return REPORT_DISPLAY_NAMES[name] ?? name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type ReportViewerProps = {
  report: ReportData;
  csvDownloadUrl: string;
  onClose: () => void;
  businessName?: string;
  appVersion?: string;
};

export function ReportViewer({ report, csvDownloadUrl, onClose, businessName, appVersion }: ReportViewerProps) {
  const shopName = businessName || "Business";
  const version = appVersion || "1.0";
  const printRef = useRef<HTMLDivElement>(null);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);

  const handlePrint = () => {
    window.print();
  };

  const handleExportCsv = () => {
    const filename = `${report.report_name}-${new Date().toISOString().slice(0, 10)}.csv`;
    setDownloadNotice(filename);
    window.open(csvDownloadUrl, "_blank");
    setTimeout(() => setDownloadNotice(null), 6000);
  };

  const isEmpty =
    report.sections.every((s) => s.rows.length === 0) &&
    Object.values(report.metrics).every((v) => v === 0 || v === "0" || v === "$0.00" || v === "All time");

  return (
    <div className="mt-4">
      {/* Action bar — hidden when printing */}
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="accent" size="lg" onClick={handlePrint}>
          Print
        </Button>
        <Button variant="secondary" size="lg" onClick={handleExportCsv}>
          Export CSV
        </Button>
        <Button variant="ghost" size="lg" onClick={onClose}>
          Close
        </Button>
      </div>

      {downloadNotice && (
        <div className="mb-4 rounded-lg border border-[var(--ui-accent)]/30 bg-[var(--ui-accent)]/5 px-4 py-3 print:hidden">
          <p className="text-sm text-[var(--ui-body)]">
            <span className="font-semibold">{downloadNotice}</span> saved to your browser&apos;s Downloads folder.
          </p>
        </div>
      )}

      {/* Report content — this is what prints */}
      <div
        ref={printRef}
        className="report-print-area rounded-xl border border-[var(--ui-border)] bg-white p-8 text-gray-900 shadow-sm"
      >
        {/* Brand header — banner | centered title+dates | generated date */}
        <div className="relative mb-4 flex items-center border-b-2 border-[#3D2B1F] pb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/banner.png"
            alt={shopName}
            width={360}
            height={80}
            className="h-20 w-auto shrink-0 object-contain"
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <h1 className="report-heading text-2xl font-bold leading-tight text-[#3D2B1F]">
              {displayReportName(report.report_name)}
            </h1>
            {report.metrics.date_range && (
              <p className="report-body mt-0.5 text-sm text-gray-500">
                {String(report.metrics.date_range)}
              </p>
            )}
          </div>
          <p className="report-body ml-auto shrink-0 text-right text-xs text-gray-400">
            {new Date(report.generated_at).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>

        {isEmpty ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-6 py-10 text-center">
            <p className="report-heading text-lg font-semibold text-gray-600">
              No data found for the selected criteria.
            </p>
            <p className="report-body mt-2 text-sm text-gray-500">
              Try adjusting the date range or filters, or check that relevant records exist.
            </p>
          </div>
        ) : (
          <>
            {/* Data sections — consecutive compact sections render side-by-side */}
            {(() => {
              const groups: Array<ReportSection[]> = [];
              for (const section of report.sections) {
                if (section.compact) {
                  const last = groups[groups.length - 1];
                  if (last && last[0]?.compact && last.length < 3) {
                    last.push(section);
                  } else {
                    groups.push([section]);
                  }
                } else {
                  groups.push([section]);
                }
              }
              return groups.map((group, gIdx) => {
                const cols = group.length;
                const gridClass =
                  cols === 3 ? "mb-6 grid grid-cols-3 gap-6" :
                  cols === 2 ? "mb-6 grid grid-cols-2 gap-6" : "";
                return (
                  <div
                    key={gIdx}
                    className={gridClass}
                  >
                    {group.map((section, sIdx) => (
                      <div key={sIdx} className={cols > 1 ? "" : "mb-6"}>
                        <h2 className="report-heading mb-3 border-b border-[#3D2B1F]/20 pb-1 text-base font-semibold text-[#3D2B1F]">
                          {section.title}
                        </h2>
                        {section.rows.length === 0 ? (
                          <p className="report-body py-3 text-sm italic text-gray-400">
                            No data in this section.
                          </p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="report-table w-full border-collapse text-sm">
                              <thead>
                                <tr className="border-b-2 border-[#3D2B1F]/30">
                                  {Object.keys(section.rows[0]).map((col) => (
                                    <th
                                      key={col}
                                      className={`report-body px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 ${
                                        isNumericColumn(col, section.rows) ? "text-right" : ""
                                      }`}
                                    >
                                      {formatColumnHeader(col)}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {section.rows.map((row, rIdx) => (
                                  <tr
                                    key={rIdx}
                                    className={`border-b border-gray-100 ${
                                      rIdx % 2 === 0 ? "bg-white" : "bg-[#FAF8F3]"
                                    }`}
                                  >
                                    {Object.entries(row).map(([col, val]) => (
                                      <td
                                        key={col}
                                        className={`report-body px-3 py-2 ${
                                          isNumericColumn(col, section.rows)
                                            ? "text-right font-mono tabular-nums"
                                            : ""
                                        }`}
                                      >
                                        {formatCellValue(val)}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                              {section.rows.length > 1 && !section.no_totals && (() => {
                                const cols = Object.keys(section.rows[0]);
                                const hasNumeric = cols.some((col, i) => i > 0 && section.rows.some((r) => typeof r[col] === "number"));
                                if (!hasNumeric) return null;
                                return (
                                  <tfoot>
                                    <tr className="border-t-2 border-[#3D2B1F]/30 bg-[#FAF8F3] font-semibold">
                                      {cols.map((col, i) => {
                                        if (i === 0) {
                                          return (
                                            <td key={col} className="report-body px-3 py-2 text-[#3D2B1F] uppercase text-xs tracking-wide">
                                              Total
                                            </td>
                                          );
                                        }
                                        const lower = col.toLowerCase();
                                        const isRatio = lower.includes("pct") || lower.includes("percent") || lower.includes("margin") || lower.includes("rate") || lower.includes("grade") || lower.includes("score");
                                        const isNum = !isRatio && section.rows.every((r) => typeof r[col] === "number");
                                        if (isNum) {
                                          const sum = section.rows.reduce((s, r) => s + (r[col] as number), 0);
                                          return (
                                            <td key={col} className="report-body px-3 py-2 text-right font-mono tabular-nums text-[#3D2B1F]">
                                              {formatCellValue(Number(sum.toFixed(2)))}
                                            </td>
                                          );
                                        }
                                        return <td key={col} className="px-3 py-2" />;
                                      })}
                                    </tr>
                                  </tfoot>
                                );
                              })()}
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              });
            })()}
            {/* Totals row */}
            {Object.keys(report.metrics).filter((k) => k !== "date_range").length > 0 && (
              <div className="mt-4 rounded-lg border-2 border-[#3D2B1F]/20 bg-[#FAF8F3] px-5 py-4">
                <h2 className="report-heading mb-2 text-sm font-semibold uppercase tracking-wide text-[#3D2B1F]">
                  Summary
                </h2>
                <div className="flex flex-wrap gap-x-8 gap-y-1">
                  {Object.entries(report.metrics)
                    .filter(([key]) => key !== "date_range")
                    .map(([key, value]) => (
                      <div key={key} className="report-body text-sm text-gray-700">
                        <span className="font-medium text-gray-500">{formatMetricLabel(key)}:</span>{" "}
                        <span className="font-semibold text-[#3D2B1F]">{formatCellValue(value)}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div className="mt-8 border-t border-gray-200 pt-3 flex items-center justify-between">
          <p className="report-body text-xs text-gray-400">
            {shopName}
          </p>
          <p className="report-body text-xs text-gray-400">
            Powered by AiCE v{version}
          </p>
        </div>
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Crimson+Text:wght@400;600;700&family=Raleway:wght@400;500;600;700&display=swap');

        .report-heading {
          font-family: 'Crimson Text', Georgia, serif;
        }

        .report-body {
          font-family: 'Raleway', 'Segoe UI', sans-serif;
        }

        .report-table th {
          font-family: 'Raleway', 'Segoe UI', sans-serif;
        }

        .report-table td {
          font-family: 'Raleway', 'Segoe UI', sans-serif;
        }

        @media print {
          @page {
            margin: 0.75in;
            size: letter;
          }

          body * {
            visibility: hidden;
          }

          .report-print-area,
          .report-print-area * {
            visibility: visible;
          }

          .report-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
            background: white !important;
          }

          .report-table {
            page-break-inside: auto;
          }

          .report-table tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }

          .report-table thead {
            display: table-header-group;
          }
        }
      `}</style>
    </div>
  );
}
