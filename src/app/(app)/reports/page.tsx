"use client";

import { useRef, useMemo, useState } from "react";
import Image from "next/image";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/Button";
import { FormField, SelectInput } from "@/components/ui/FormField";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressModal } from "@/components/ui/ProgressModal";
import { useProgressOperation } from "@/hooks/useProgressOperation";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

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
  "inventory-aging",
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

const PER_ORDER_REPORTS = new Set(["invoice", "thank-you-note"]);

export default function ReportsPage() {
  const { iconConfig, busyAction, setBusyAction, setError } = useApp();

  const reportTypeSelectorRef = useRef<HTMLDivElement>(null);
  const [reportType, setReportType] = useState("sales");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [reportCsvPreview, setReportCsvPreview] = useState("");
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [perOrderId, setPerOrderId] = useState("");
  const [orderIdError, setOrderIdError] = useState<string | null>(null);
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
    const d = new Date();
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
    } else if (preset === "thisYear") {
      setFromDate(`${today.slice(0, 4)}-01-01`);
      setToDate(today);
    } else if (preset === "thisQuarter") {
      const qMonth = Math.floor(d.getMonth() / 3) * 3;
      const qStart = new Date(d.getFullYear(), qMonth, 1);
      setFromDate(qStart.toISOString().slice(0, 10));
      setToDate(today);
    } else if (preset === "lastMonth") {
      const lm = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const lmEnd = new Date(d.getFullYear(), d.getMonth(), 0);
      setFromDate(lm.toISOString().slice(0, 10));
      setToDate(lmEnd.toISOString().slice(0, 10));
    } else if (preset === "lastQuarter") {
      const curQ = Math.floor(d.getMonth() / 3);
      const prevQ = curQ === 0 ? 3 : curQ - 1;
      const prevQYear = curQ === 0 ? d.getFullYear() - 1 : d.getFullYear();
      const lqStart = new Date(prevQYear, prevQ * 3, 1);
      const lqEnd = new Date(prevQYear, prevQ * 3 + 3, 0);
      setFromDate(lqStart.toISOString().slice(0, 10));
      setToDate(lqEnd.toISOString().slice(0, 10));
    } else if (preset === "lastYear") {
      const ly = d.getFullYear() - 1;
      setFromDate(`${ly}-01-01`);
      setToDate(`${ly}-12-31`);
    } else if (preset === "custom") {
      // Keep current user-specified dates as-is
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

  const isPerOrder = PER_ORDER_REPORTS.has(reportType) && perOrderId.trim().length > 0;

  const isThankYouPerOrder = reportType === "thank-you-note" && isPerOrder;

  const validateAndGenerate = async () => {
    if (isPerOrder) {
      setOrderIdError(null);
      try {
        const resp = await fetch(`/api/orders/${encodeURIComponent(perOrderId.trim())}`, {
          headers: { Accept: "application/json" },
        });
        if (resp.status === 404) {
          setOrderIdError("Order not found. Please check the order ID.");
          return;
        }
        if (!resp.ok) {
          setOrderIdError("Could not validate the order ID. Please try again.");
          return;
        }
      } catch {
        setOrderIdError("Could not validate the order ID. Please try again.");
        return;
      }
    }
    setGeneratedUrl(downloadUrl("pdf"));
  };

  const downloadUrl = (format: "csv" | "pdf") => {
    if (isPerOrder) {
      return `/api/reports/${reportType}/${encodeURIComponent(perOrderId.trim())}?format=${format}`;
    }
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

        <div ref={reportTypeSelectorRef} className="mb-3 flex flex-wrap items-end gap-3">
          <FormField label="Report type">
            <SelectInput
              value={reportType}
              onChange={(v) => { setReportType(v); setGeneratedUrl(null); }}
              options={REPORT_OPTIONS}
            />
          </FormField>
          <FormField label="From">
            <input
              type="date"
              value={fromDate}
              disabled={!supportsDates}
              onChange={(e) => {
                setFromDate(e.target.value);
                setActivePreset(null);
                setGeneratedUrl(null);
              }}
              className="rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm text-[var(--ui-title)] focus:border-[var(--ui-accent)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
          </FormField>
          <FormField label="To">
            <input
              type="date"
              value={toDate}
              disabled={!supportsDates}
              onChange={(e) => {
                setToDate(e.target.value);
                setActivePreset(null);
                setGeneratedUrl(null);
              }}
              className="rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm text-[var(--ui-title)] focus:border-[var(--ui-accent)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
          </FormField>
        </div>

        {supportsDates ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {[
              { id: "today", label: "Today" },
              { id: "week", label: "This week" },
              { id: "month", label: "This month" },
              { id: "thisQuarter", label: "This Quarter" },
              { id: "thisYear", label: "This Year" },
              { id: "lastMonth", label: "Last Month" },
              { id: "lastQuarter", label: "Last Quarter" },
              { id: "lastYear", label: "Last Year" },
              { id: "all", label: "All time" },
              { id: "custom", label: "Custom range" },
            ].map((preset) => {
              const isActive =
                activePreset === preset.id ||
                (preset.id === "all" && !fromDate && !toDate && activePreset === "all");
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    isActive
                      ? "border-[var(--ui-accent)] bg-[var(--ui-accent)]/10 text-[var(--ui-accent)]"
                      : "border-[var(--ui-border)] text-[var(--ui-body)] hover:bg-[var(--ui-neutral)]"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="mb-3 text-xs text-[var(--ui-muted)]">
            This report does not support date filtering.
          </p>
        )}

        {PER_ORDER_REPORTS.has(reportType) && (
          <div className="mb-3">
            <FormField label="Order ID (leave blank for all orders)">
              <input
                type="text"
                value={perOrderId}
                onChange={(e) => {
                  setPerOrderId(e.target.value);
                  setGeneratedUrl(null);
                  setOrderIdError(null);
                }}
                placeholder="e.g. 42"
                className="w-32 rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm text-[var(--ui-title)] focus:border-[var(--ui-accent)] focus:outline-none"
              />
            </FormField>
            {orderIdError && (
              <p className="mt-1 text-xs text-[var(--ui-red)]">{orderIdError}</p>
            )}
          </div>
        )}

        {generatedUrl ? (
          <div className="mb-3 rounded-lg border border-[var(--ui-green)]/30 bg-[var(--ui-green)]/5 p-3">
            <p className="mb-2 text-sm font-medium text-[var(--ui-title)]">Report generated</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="accent"
                size="lg"
                onClick={() => {
                  const w = window.open(generatedUrl, "_blank");
                  if (w) setTimeout(() => w.print(), 800);
                }}
              >
                Print
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => window.open(generatedUrl, "_blank")}
                disabled={reportType === "accounting-export"}
              >
                Export PDF
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => window.open(downloadUrl("csv"), "_blank")}
                disabled={isThankYouPerOrder}
              >
                Export CSV
              </Button>
              <Button
                variant="ghost"
                size="lg"
                onClick={() => setGeneratedUrl(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="accent"
              size="lg"
              onClick={() => void validateAndGenerate()}
              disabled={reportType === "accounting-export"}
            >
              Generate Report
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={previewReportCsv}
              busy={busyAction === "preview-report"}
              disabled={busyAction != null}
            >
              Preview CSV
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => window.open(downloadUrl("csv"), "_blank")}
              disabled={isThankYouPerOrder}
            >
              Export CSV
            </Button>
          </div>
        )}
        {reportCsvPreview.trim().length === 0 ? (
          <EmptyState
            message="No reports generated yet. Once you have orders, you can generate sales, tax, and profit reports here."
            primaryAction={{
              label: "Generate a report",
              onClick: () => {
                reportTypeSelectorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                const select = reportTypeSelectorRef.current?.querySelector("select");
                select?.focus();
              },
            }}
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
