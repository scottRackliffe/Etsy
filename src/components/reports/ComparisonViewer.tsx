"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

type ComparisonData = {
  reportType?: "sales" | "costs";
  labels: [string, string, string];
  metrics: [
    Record<string, number | string>,
    Record<string, number | string>,
    Record<string, number | string>,
  ];
};

type ComparisonViewerProps = {
  data: ComparisonData;
  businessName?: string;
  appVersion?: string;
  onClose: () => void;
};

function formatMetricLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const COST_DIRECTION_KEYS = new Set(["total_costs", "total_item_purchases", "total_shipping_costs", "other_costs_total", "avg_cost_per_item"]);

function fmt(value: number | string): string {
  if (typeof value === "number") {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return String(value);
}

function diff(a: number | string, b: number | string): string {
  if (typeof a !== "number" || typeof b !== "number") return "—";
  const d = b - a;
  const sign = d >= 0 ? "+" : "";
  return `${sign}${d.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function diffClass(a: number | string, b: number | string, invert = false): string {
  if (typeof a !== "number" || typeof b !== "number") return "text-gray-400";
  const d = b - a;
  if (d === 0) return "text-gray-500";
  const positive = invert ? d < 0 : d > 0;
  return positive ? "text-green-700" : "text-red-600";
}

export function ComparisonViewer({ data, businessName, appVersion, onClose }: ComparisonViewerProps) {
  const shopName = businessName || "Business";
  const version = appVersion || "1.0";
  const [m1, m2, m3] = data.metrics;
  const [l1, l2, l3] = data.labels;
  const rType = data.reportType || "sales";
  const title = rType === "costs" ? "Cost Comparison" : "Sales Comparison";

  const allKeys = Object.keys(m1);
  const numericKeys = allKeys.filter((k) => typeof m1[k] === "number");
  const textKeys = allKeys.filter((k) => typeof m1[k] !== "number");

  const isCostMetric = (key: string) => COST_DIRECTION_KEYS.has(key);

  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);

  const exportCsv = () => {
    const headers = ["Metric", l1, l2, l3, `${l1} → ${l2}`, `${l2} → ${l3}`, `${l1} → ${l3}`];
    const rows = [...numericKeys, ...textKeys].map((key) => {
      const label = formatMetricLabel(key);
      const isNum = typeof m1[key] === "number";
      return [
        label,
        fmt(m1[key]),
        fmt(m2[key]),
        fmt(m3[key]),
        isNum ? diff(m1[key], m2[key]) : "—",
        isNum ? diff(m2[key], m3[key]) : "—",
        isNum ? diff(m1[key], m3[key]) : "—",
      ];
    });
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const filename = `${rType}-comparison-${l1}-${l2}-${l3}.csv`.replace(/\s+/g, "-");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setDownloadNotice(filename);
    setTimeout(() => setDownloadNotice(null), 6000);
  };

  return (
    <div className="mt-4">
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="accent" size="lg" onClick={() => window.print()}>
          Print
        </Button>
        <Button variant="secondary" size="lg" onClick={exportCsv}>
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

      <div className="report-print-area rounded-xl border border-[var(--ui-border)] bg-white p-8 text-gray-900 shadow-sm">
        {/* Header */}
        <div className="relative mb-6 flex items-center border-b-2 border-[#3D2B1F] pb-3">
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
              {title}
            </h1>
            <p className="report-body mt-0.5 text-sm text-gray-500">
              {l1} vs {l2} vs {l3}
            </p>
          </div>
          <p className="report-body ml-auto shrink-0 text-right text-xs text-gray-400">
            {new Date().toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>

        {/* Comparison table */}
        <div className="overflow-x-auto">
          <table className="report-table w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-[#3D2B1F]/30">
                <th className="report-body px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Metric
                </th>
                <th className="report-body px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">
                  {l1}
                </th>
                <th className="report-body px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">
                  {l2}
                </th>
                <th className="report-body px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">
                  {l3}
                </th>
                <th className="report-body px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">
                  {l1} → {l2}
                </th>
                <th className="report-body px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">
                  {l2} → {l3}
                </th>
                <th className="report-body px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">
                  {l1} → {l3}
                </th>
              </tr>
            </thead>
            <tbody>
              {numericKeys.map((key, idx) => {
                const invert = isCostMetric(key);
                return (
                  <tr
                    key={key}
                    className={`border-b border-gray-100 ${idx % 2 === 0 ? "bg-white" : "bg-[#FAF8F3]"}`}
                  >
                    <td className="report-body px-3 py-2 font-medium text-gray-700">
                      {formatMetricLabel(key)}
                    </td>
                    <td className="report-body px-3 py-2 text-right font-mono tabular-nums">{fmt(m1[key])}</td>
                    <td className="report-body px-3 py-2 text-right font-mono tabular-nums">{fmt(m2[key])}</td>
                    <td className="report-body px-3 py-2 text-right font-mono tabular-nums">{fmt(m3[key])}</td>
                    <td className={`report-body px-3 py-2 text-right font-mono tabular-nums ${diffClass(m1[key], m2[key], invert)}`}>
                      {diff(m1[key], m2[key])}
                    </td>
                    <td className={`report-body px-3 py-2 text-right font-mono tabular-nums ${diffClass(m2[key], m3[key], invert)}`}>
                      {diff(m2[key], m3[key])}
                    </td>
                    <td className={`report-body px-3 py-2 text-right font-mono tabular-nums font-semibold ${diffClass(m1[key], m3[key], invert)}`}>
                      {diff(m1[key], m3[key])}
                    </td>
                  </tr>
                );
              })}
              {textKeys.map((key, idx) => (
                <tr
                  key={key}
                  className={`border-b border-gray-100 ${(numericKeys.length + idx) % 2 === 0 ? "bg-white" : "bg-[#FAF8F3]"}`}
                >
                  <td className="report-body px-3 py-2 font-medium text-gray-700">
                    {formatMetricLabel(key)}
                  </td>
                  <td className="report-body px-3 py-2 text-right text-xs">{String(m1[key] ?? "—")}</td>
                  <td className="report-body px-3 py-2 text-right text-xs">{String(m2[key] ?? "—")}</td>
                  <td className="report-body px-3 py-2 text-right text-xs">{String(m3[key] ?? "—")}</td>
                  <td className="report-body px-3 py-2 text-right text-gray-400">—</td>
                  <td className="report-body px-3 py-2 text-right text-gray-400">—</td>
                  <td className="report-body px-3 py-2 text-right text-gray-400">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="mt-8 border-t border-gray-200 pt-3 flex items-center justify-between">
          <p className="report-body text-xs text-gray-400">{shopName}</p>
          <p className="report-body text-xs text-gray-400">
            Powered by AiCE v{version}
          </p>
        </div>
      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Crimson+Text:wght@400;600;700&family=Raleway:wght@400;500;600;700&display=swap');
        .report-heading { font-family: 'Crimson Text', Georgia, serif; }
        .report-body, .report-table th, .report-table td { font-family: 'Raleway', 'Segoe UI', sans-serif; }
        @media print {
          @page { margin: 0.75in; size: letter landscape; }
          body * { visibility: hidden; }
          .report-print-area, .report-print-area * { visibility: visible; }
          .report-print-area {
            position: absolute; left: 0; top: 0; width: 100%;
            border: none !important; border-radius: 0 !important;
            box-shadow: none !important; padding: 0 !important; background: white !important;
          }
          .report-table { page-break-inside: auto; }
          .report-table tr { page-break-inside: avoid; }
          .report-table thead { display: table-header-group; }
        }
      `}</style>
    </div>
  );
}
