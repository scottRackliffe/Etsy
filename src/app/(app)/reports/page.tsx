"use client";

import { useState } from "react";
import Image from "next/image";
import { useApp } from "@/context/AppContext";
import type { ApiErrorShape } from "@/types";

export default function ReportsPage() {
  const { iconConfig, busyAction, setBusyAction, setApiError, setError } = useApp();

  const [reportType, setReportType] = useState("sales");
  const [reportCsvPreview, setReportCsvPreview] = useState("");

  const reportHeaderIconWidth = Number.isFinite(Number(iconConfig.reportHeaderWidthPx))
    ? Math.max(80, Math.min(640, Math.floor(Number(iconConfig.reportHeaderWidthPx))))
    : 220;

  const previewReportCsv = async () => {
    setBusyAction("preview-report");
    try {
      const response = await fetch(`/api/reports/${reportType}?format=csv`, {
        headers: { Accept: "text/csv" },
      });
      const text = await response.text();
      if (!response.ok) throw { error: { user_message: "Report preview failed." } };
      setReportCsvPreview(text);
      setError(null);
    } catch (err) {
      setApiError("Could not preview report", "We could not load report preview.", err);
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-3">
        <Image
          src={iconConfig.reportHeaderPath || "/icons/report-header.png"}
          alt="Report header icon"
          width={reportHeaderIconWidth}
          height={Math.max(24, Math.floor(reportHeaderIconWidth * 0.22))}
          className="h-auto max-h-16 w-auto rounded"
        />
        <h3 className="text-lg font-semibold text-[var(--ui-title)]">Reports</h3>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={reportType}
          onChange={(e) => setReportType(e.target.value)}
          aria-label="Report type"
          className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm"
        >
          {[
            "thank-you-note", "invoice", "sales", "costs",
            "income-mtd", "income-ytd", "postal-by-vendor",
            "outstanding-items", "ar-aging",
            "profit-by-item", "sales-tax-summary", "inventory-aging", "accounting-export",
          ].map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <button type="button" onClick={previewReportCsv} disabled={busyAction != null} className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm">
          {busyAction === "preview-report" ? "Loading..." : "Preview CSV"}
        </button>
        <button type="button" onClick={() => window.open(`/api/reports/${reportType}?format=csv`, "_blank")} className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm">
          Download CSV
        </button>
        <button type="button" onClick={() => window.open(`/api/reports/${reportType}?format=pdf`, "_blank")} disabled={reportType === "accounting-export"} className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-50">
          Download PDF
        </button>
      </div>
      <textarea
        readOnly
        value={reportCsvPreview}
        aria-label="Report CSV preview"
        className="mt-3 min-h-80 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 font-mono text-xs"
      />
      {reportCsvPreview.trim().length === 0 && (
        <p className="mt-2 text-xs text-[var(--ui-muted)]">
          Choose a report and click Preview CSV to inspect report output.
        </p>
      )}
    </section>
  );
}
