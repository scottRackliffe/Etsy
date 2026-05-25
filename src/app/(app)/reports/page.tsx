"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useApp } from "@/context/AppContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressModal } from "@/components/ui/ProgressModal";
import { useProgressOperation } from "@/hooks/useProgressOperation";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import type { ApiErrorShape } from "@/types";

const REPORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "thank-you-note", label: "Thank You Note" },
  { value: "invoice", label: "Invoice" },
  { value: "sales", label: "Sales Report" },
  { value: "costs", label: "Costs Report" },
  { value: "income-mtd", label: "Income — Month to Date" },
  { value: "income-ytd", label: "Income — Year to Date" },
  { value: "postal-by-vendor", label: "Postal Costs by Carrier" },
  { value: "outstanding-items", label: "Outstanding Items" },
  { value: "ar-aging", label: "Accounts Receivable Aging" },
  { value: "profit-by-item", label: "Profit by Item" },
  { value: "sales-tax-summary", label: "Sales Tax Summary" },
  { value: "inventory-aging", label: "Inventory Aging" },
  { value: "accounting-export", label: "Accounting Export" },
];

const DATE_FILTER_REPORTS = new Set([
  "sales",
  "costs",
  "postal-by-vendor",
  "invoice",
  "thank-you-note",
  "profit-by-item",
  "sales-tax-summary",
  "accounting-export",
]);

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function mondayThisWeek(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const { iconConfig, busyAction, setBusyAction, setApiError, setError } = useApp();

  const [reportType, setReportType] = useState("sales");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [reportCsvPreview, setReportCsvPreview] = useState("");
  const { modal: progressModal, run: runWithProgress } = useProgressOperation();

  const reportHeaderIconWidth = Number.isFinite(Number(iconConfig.reportHeaderWidthPx))
    ? Math.max(80, Math.min(640, Math.floor(Number(iconConfig.reportHeaderWidthPx))))
    : 220;

  const supportsDates = DATE_FILTER_REPORTS.has(reportType);

  const reportQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (supportsDates && fromDate) params.set("from_date", fromDate);
    if (supportsDates && toDate) params.set("to_date", toDate);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [supportsDates, fromDate, toDate]);

  const applyPreset = (preset: string) => {
    const today = isoToday();
    setActivePreset(preset);
    if (preset === "today") {
      setFromDate(today);
      setToDate(today);
    } else if (preset === "week") {
      setFromDate(mondayThisWeek());
      setToDate(today);
    } else if (preset === "month") {
      setFromDate(`${today.slice(0, 8)}01`);
      setToDate(today);
    } else if (preset === "ytd") {
      setFromDate(`${today.slice(0, 4)}-01-01`);
      setToDate(today);
    } else {
      setFromDate("");
      setToDate("");
    }
  };

  const previewReportCsv = async () => {
    setBusyAction("preview-report");
    try {
      await runWithProgress({
        title: "Generating report preview",
        statusText: "Building CSV preview…",
        fn: async () => {
          const url = `/api/reports/${reportType}${reportQuery ? `${reportQuery}&format=csv` : "?format=csv"}`;
          const response = await fetch(url, {
            headers: { Accept: "text/csv" },
          });
          const text = await response.text();
          if (!response.ok) throw { error: { user_message: "Report preview failed." } };
          setReportCsvPreview(text);
          setError(null);
        },
      });
    } catch {
      /* modal handles error */
    } finally {
      setBusyAction(null);
    }
  };

  const downloadUrl = (format: "csv" | "pdf") => {
    const base = `/api/reports/${reportType}${reportQuery}`;
    const join = base.includes("?") ? "&" : "?";
    return `${base}${join}format=${format}`;
  };

  useKeyboardShortcuts([
    {
      key: "p",
      modifiers: ["meta"],
      action: () => {
        if (reportType !== "accounting-export") {
          window.open(downloadUrl("pdf"), "_blank");
        }
      },
    },
  ]);

  return (
    <>
      <ProgressModal {...progressModal} />
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

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-[var(--ui-muted)]">Report type</span>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            aria-label="Report type"
            className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm"
          >
            {REPORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className={`text-sm ${supportsDates ? "" : "opacity-50"}`}>
          <span className="mb-1 block text-[var(--ui-muted)]">From</span>
          <input
            type="date"
            value={fromDate}
            disabled={!supportsDates}
            onChange={(e) => {
              setFromDate(e.target.value);
              setActivePreset(null);
            }}
            className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm disabled:cursor-not-allowed"
          />
        </label>
        <label className={`text-sm ${supportsDates ? "" : "opacity-50"}`}>
          <span className="mb-1 block text-[var(--ui-muted)]">To</span>
          <input
            type="date"
            value={toDate}
            disabled={!supportsDates}
            onChange={(e) => {
              setToDate(e.target.value);
              setActivePreset(null);
            }}
            className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm disabled:cursor-not-allowed"
          />
        </label>
      </div>

      {supportsDates ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {[
            { id: "today", label: "Today" },
            { id: "week", label: "This week" },
            { id: "month", label: "This month" },
            { id: "ytd", label: "YTD" },
            { id: "all", label: "All time" },
          ].map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset.id === "all" ? "all" : preset.id)}
              className={`rounded-full border px-3 py-1 text-xs ${
                activePreset === preset.id || (preset.id === "all" && !fromDate && !toDate && activePreset === "all")
                  ? "border-[var(--ui-accent)] bg-[var(--ui-accent)]/10 text-[var(--ui-accent)]"
                  : "border-[var(--ui-border)] text-[var(--ui-body)]"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="mb-3 text-xs text-[var(--ui-muted)]">This report does not support date filtering.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={previewReportCsv} disabled={busyAction != null} className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm">
          {busyAction === "preview-report" ? "Loading..." : "Preview CSV"}
        </button>
        <button type="button" onClick={() => window.open(downloadUrl("csv"), "_blank")} className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm">
          Download CSV
        </button>
        <button
          type="button"
          onClick={() => window.open(downloadUrl("pdf"), "_blank")}
          disabled={reportType === "accounting-export"}
          className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-50"
        >
          Download PDF
        </button>
      </div>
      {reportCsvPreview.trim().length === 0 ? (
        <EmptyState
          message="No data for the selected date range or filters."
          primaryAction={
            supportsDates
              ? { label: "Adjust date range", onClick: () => { setFromDate(""); setToDate(""); setActivePreset(null); } }
              : { label: "Preview CSV", onClick: () => void previewReportCsv() }
          }
          secondaryAction={
            supportsDates && (fromDate || toDate)
              ? { label: "Clear filters", onClick: () => { setFromDate(""); setToDate(""); setActivePreset(null); } }
              : undefined
          }
        />
      ) : (
      <textarea
        readOnly
        value={reportCsvPreview}
        aria-label="Report CSV preview"
        className="mt-3 min-h-80 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 font-mono text-xs"
      />
      )}
    </section>
    </>
  );
}
