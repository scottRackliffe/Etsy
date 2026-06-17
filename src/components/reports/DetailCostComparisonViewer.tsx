"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

type ReportPeriod = {
  metrics: Record<string, number | string>;
  sections: Array<{ title: string; rows: Array<Record<string, number | string>> }>;
};

export type DetailCostComparisonData = {
  labels: [string, string, string];
  reports: [ReportPeriod, ReportPeriod, ReportPeriod];
};

type Props = {
  data: DetailCostComparisonData;
  businessName?: string;
  appVersion?: string;
  onClose: () => void;
};

function fmt(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function diffStr(a: number, b: number): string {
  const d = b - a;
  const sign = d >= 0 ? "+" : "";
  return `${sign}${fmt(d)}`;
}

function diffClass(a: number, b: number): string {
  const d = b - a;
  if (d === 0) return "text-gray-500";
  return d < 0 ? "text-green-700" : "text-red-600";
}

function formatLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type MergedRow = {
  label: string;
  values: [number, number, number];
  isTotal?: boolean;
  isSectionHeader?: boolean;
};

function mergeSections(
  reports: [ReportPeriod, ReportPeriod, ReportPeriod]
): MergedRow[] {
  const allTitles = new Map<string, number>();
  for (const rpt of reports) {
    for (const sec of rpt.sections) {
      if (!allTitles.has(sec.title)) allTitles.set(sec.title, allTitles.size);
    }
  }

  const sortedTitles = [...allTitles.entries()].sort((a, b) => a[1] - b[1]).map(([t]) => t);
  const rows: MergedRow[] = [];

  for (const title of sortedTitles) {
    rows.push({ label: title, values: [0, 0, 0], isSectionHeader: true });

    const sectionsByPeriod = reports.map(
      (rpt) => rpt.sections.find((s) => s.title === title)?.rows || []
    );

    const labelKey = findLabelKey(sectionsByPeriod);
    const valueKey = findValueKey(sectionsByPeriod, labelKey);

    const allLabels = new Set<string>();
    for (const rows of sectionsByPeriod) {
      for (const row of rows) {
        allLabels.add(String(row[labelKey] || ""));
      }
    }

    const sectionTotal: [number, number, number] = [0, 0, 0];

    for (const itemLabel of allLabels) {
      const vals: [number, number, number] = [0, 0, 0];
      for (let p = 0; p < 3; p++) {
        const match = sectionsByPeriod[p].find((r) => String(r[labelKey]) === itemLabel);
        const v = match ? Number(match[valueKey] || 0) : 0;
        vals[p] = v;
        sectionTotal[p] += v;
      }
      rows.push({ label: `  ${itemLabel}`, values: vals });
    }

    rows.push({
      label: `${title} Total`,
      values: [
        Number(sectionTotal[0].toFixed(2)),
        Number(sectionTotal[1].toFixed(2)),
        Number(sectionTotal[2].toFixed(2)),
      ],
      isTotal: true,
    });
  }

  const grandTotal: [number, number, number] = [0, 0, 0];
  for (let p = 0; p < 3; p++) {
    const tc = reports[p].metrics.total_costs;
    grandTotal[p] = typeof tc === "number" ? tc : 0;
  }
  rows.push({ label: "Total Costs", values: grandTotal, isTotal: true, isSectionHeader: true });

  return rows;
}

function findLabelKey(sectionsByPeriod: Array<Array<Record<string, number | string>>>): string {
  for (const rows of sectionsByPeriod) {
    if (rows.length > 0) {
      const keys = Object.keys(rows[0]);
      const textKey = keys.find((k) => typeof rows[0][k] === "string");
      if (textKey) return textKey;
      return keys[0];
    }
  }
  return "label";
}

function findValueKey(
  sectionsByPeriod: Array<Array<Record<string, number | string>>>,
  labelKey: string
): string {
  for (const rows of sectionsByPeriod) {
    if (rows.length > 0) {
      const keys = Object.keys(rows[0]);
      const lastNumKey = [...keys].reverse().find((k) => k !== labelKey && typeof rows[0][k] === "number");
      if (lastNumKey) return lastNumKey;
    }
  }
  return "total";
}

export function DetailCostComparisonViewer({ data, businessName, appVersion, onClose }: Props) {
  const shopName = businessName || "Business";
  const version = appVersion || "1.0";
  const [l1, l2, l3] = data.labels;
  const merged = mergeSections(data.reports);

  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);

  const exportCsv = () => {
    const headers = ["Item", l1, l2, l3, `${l1} → ${l2}`, `${l2} → ${l3}`, `${l1} → ${l3}`];
    const csvRows = merged
      .filter((r) => !r.isSectionHeader || r.isTotal)
      .map((r) => [
        r.label.trim(),
        fmt(r.values[0]),
        fmt(r.values[1]),
        fmt(r.values[2]),
        diffStr(r.values[0], r.values[1]),
        diffStr(r.values[1], r.values[2]),
        diffStr(r.values[0], r.values[2]),
      ]);
    const csv = [headers, ...csvRows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const filename = `detail-cost-comparison-${l1}-${l2}-${l3}.csv`.replace(/\s+/g, "-");
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
              Detail Cost Comparison
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
                  Item
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
              {merged.map((row, idx) => {
                if (row.isSectionHeader && !row.isTotal) {
                  return (
                    <tr key={idx} className="border-b border-[#3D2B1F]/20 bg-[#FAF8F3]">
                      <td
                        colSpan={7}
                        className="report-heading px-3 py-2 text-sm font-semibold uppercase tracking-wide text-[#3D2B1F]"
                      >
                        {row.label}
                      </td>
                    </tr>
                  );
                }

                const isBold = row.isTotal;
                const bgClass = isBold
                  ? "border-t-2 border-[#3D2B1F]/30 bg-[#FAF8F3]"
                  : idx % 2 === 0 ? "bg-white" : "bg-gray-50/50";

                return (
                  <tr key={idx} className={`border-b border-gray-100 ${bgClass}`}>
                    <td className={`report-body px-3 py-1.5 text-gray-700 ${isBold ? "font-semibold text-[#3D2B1F]" : ""}`}>
                      {row.label}
                    </td>
                    <td className={`report-body px-3 py-1.5 text-right font-mono tabular-nums ${isBold ? "font-semibold text-[#3D2B1F]" : ""}`}>
                      {fmt(row.values[0])}
                    </td>
                    <td className={`report-body px-3 py-1.5 text-right font-mono tabular-nums ${isBold ? "font-semibold text-[#3D2B1F]" : ""}`}>
                      {fmt(row.values[1])}
                    </td>
                    <td className={`report-body px-3 py-1.5 text-right font-mono tabular-nums ${isBold ? "font-semibold text-[#3D2B1F]" : ""}`}>
                      {fmt(row.values[2])}
                    </td>
                    <td className={`report-body px-3 py-1.5 text-right font-mono tabular-nums ${diffClass(row.values[0], row.values[1])}`}>
                      {diffStr(row.values[0], row.values[1])}
                    </td>
                    <td className={`report-body px-3 py-1.5 text-right font-mono tabular-nums ${diffClass(row.values[1], row.values[2])}`}>
                      {diffStr(row.values[1], row.values[2])}
                    </td>
                    <td className={`report-body px-3 py-1.5 text-right font-mono tabular-nums font-semibold ${diffClass(row.values[0], row.values[2])}`}>
                      {diffStr(row.values[0], row.values[2])}
                    </td>
                  </tr>
                );
              })}
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
