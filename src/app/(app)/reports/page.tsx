"use client";

import { useRef, useMemo, useState, useEffect, useCallback } from "react";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/Button";
import { FormField, SelectInput } from "@/components/ui/FormField";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ReportViewer, type ReportData } from "@/components/reports/ReportViewer";
import { ComparisonViewer } from "@/components/reports/ComparisonViewer";
import { DetailCostComparisonViewer, type DetailCostComparisonData } from "@/components/reports/DetailCostComparisonViewer";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

const REPORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "sales", label: "Sales Report" },
  { value: "sales-comparison", label: "Sales Comparison Report" },
  { value: "costs", label: "Costs Report" },
  { value: "cost-comparison", label: "Cost Comparison Report" },
  { value: "cost-comparison-detail", label: "Detail Cost Comparison" },
  { value: "outstanding-items", label: "Outstanding Items" },
  { value: "ar-aging", label: "Accounts Receivable Aging" },
  { value: "profit-by-item", label: "Profit by Item" },
  { value: "vendor-profitability", label: "Vendor Profitability (Best Deals)" },
  { value: "sales-tax-summary", label: "Sales Tax Summary" },
  { value: "inventory-aging", label: "Inventory Aging" },
  { value: "accounting-export", label: "Accounting Export" },
  { value: "balance-sheet", label: "Balance Sheet" },
  { value: "income-statement", label: "Income Statement (P&L)" },
];

const DATE_FILTER_REPORTS = new Set([
  "sales",
  "costs",
  "postal-by-vendor",
  "profit-by-item",
  "vendor-profitability",
  "sales-tax-summary",
  "inventory-aging",
  "accounting-export",
  "balance-sheet",
  "income-statement",
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

type CompareType = "months" | "quarters" | "years";

type ComparisonData = {
  reportType?: "sales" | "costs";
  labels: [string, string, string];
  metrics: [Record<string, number | string>, Record<string, number | string>, Record<string, number | string>];
};

function monthRange(ym: string): { from: string; to: string; label: string } {
  const [y, m] = ym.split("-").map(Number);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(y, m, 0).getDate();
  const to = `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  const label = new Date(y, m - 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  return { from, to, label };
}

function quarterRange(qKey: string): { from: string; to: string; label: string } {
  const [qStr, yStr] = qKey.split("-");
  const q = Number(qStr);
  const y = Number(yStr);
  const startMonth = (q - 1) * 3;
  const from = `${y}-${String(startMonth + 1).padStart(2, "0")}-01`;
  const endMonth = startMonth + 3;
  const last = new Date(y, endMonth, 0).getDate();
  const to = `${y}-${String(endMonth).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { from, to, label: `Q${q} ${y}` };
}

function yearRange(y: string): { from: string; to: string; label: string } {
  return { from: `${y}-01-01`, to: `${y}-12-31`, label: y };
}

function buildPeriodOptions(type: CompareType): Array<{ value: string; label: string }> {
  const now = new Date();
  const options: Array<{ value: string; label: string }> = [];
  if (type === "months") {
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("en-US", { month: "long", year: "numeric" });
      options.push({ value: val, label });
    }
  } else if (type === "quarters") {
    for (let i = 0; i < 12; i++) {
      const totalQ = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3) - i;
      const y = Math.floor(totalQ / 4);
      const q = (totalQ % 4) + 1;
      options.push({ value: `${q}-${y}`, label: `Q${q} ${y}` });
    }
  } else {
    for (let i = 0; i < 6; i++) {
      const y = String(now.getFullYear() - i);
      options.push({ value: y, label: y });
    }
  }
  return options;
}

const STORAGE_KEY = "aice.reports.lastSelection";

function loadSavedSelection(): {
  reportType: string;
  fromDate: string;
  toDate: string;
  activePreset: string | null;
  compareType: CompareType;
  period1: string;
  period2: string;
  period3: string;
} | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function ReportsPage() {
  const { busyAction, setBusyAction, setError } = useApp();

  const saved = useRef(loadSavedSelection());

  const reportTypeSelectorRef = useRef<HTMLDivElement>(null);
  const [reportType, setReportType] = useState(saved.current?.reportType || "sales");
  const [fromDate, setFromDate] = useState(saved.current?.fromDate || "");
  const [toDate, setToDate] = useState(saved.current?.toDate || "");
  const [activePreset, setActivePreset] = useState<string | null>(saved.current?.activePreset ?? null);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [compareType, setCompareType] = useState<CompareType>(saved.current?.compareType || "months");
  const [period1, setPeriod1] = useState(saved.current?.period1 || "");
  const [period2, setPeriod2] = useState(saved.current?.period2 || "");
  const [period3, setPeriod3] = useState(saved.current?.period3 || "");
  const [comparisonData, setComparisonData] = useState<ComparisonData | null>(null);
  const [detailCostData, setDetailCostData] = useState<DetailCostComparisonData | null>(null);

  const isComparison = reportType === "sales-comparison" || reportType === "cost-comparison" || reportType === "cost-comparison-detail";
  const periodOptions = useMemo(() => buildPeriodOptions(compareType), [compareType]);

  useEffect(() => {
    if (!saved.current?.period1 && periodOptions.length >= 3) {
      setPeriod1(periodOptions[2].value);
      setPeriod2(periodOptions[1].value);
      setPeriod3(periodOptions[0].value);
    }
    saved.current = null;
  }, [periodOptions]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ reportType, fromDate, toDate, activePreset, compareType, period1, period2, period3 })
      );
    } catch {}
  }, [reportType, fromDate, toDate, activePreset, compareType, period1, period2, period3]);

  const [businessName, setBusinessName] = useState<string>("");
  const [appVersion, setAppVersion] = useState<string>("1.0");

  useEffect(() => {
    fetch("/api/settings/business_name")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (body?.ok && body.value) setBusinessName(String(body.value));
      })
      .catch(() => {});
    fetch("/api/settings/app.version")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (body?.ok && body.value) setAppVersion(String(body.value));
      })
      .catch(() => {});
  }, []);

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
      // Keep current user-specified dates
    } else {
      setFromDate("");
      setToDate("");
    }
  };

  const buildUrl = (format: "json" | "csv") => {
    const base = `/api/reports/${reportType}${reportQuery}`;
    const join = base.includes("?") ? "&" : "?";
    return `${base}${join}format=${format}`;
  };

  const csvDownloadUrl = buildUrl("csv");

  const fetchReportForPeriod = useCallback(
    async (endpoint: string, from: string, to: string): Promise<Record<string, number | string>> => {
      const url = `/api/reports/${endpoint}?from_date=${from}&to_date=${to}&format=json`;
      const resp = await fetch(url, { headers: { Accept: "application/json" } });
      if (!resp.ok) throw new Error("Failed to fetch report");
      const body = await resp.json();
      if (!body.ok || !body.report) throw new Error("Invalid response");
      const metrics = { ...body.report.metrics };
      delete metrics.date_range;
      return metrics;
    },
    []
  );

  const fetchFullReport = useCallback(
    async (endpoint: string, from: string, to: string) => {
      const url = `/api/reports/${endpoint}?from_date=${from}&to_date=${to}&format=json`;
      const resp = await fetch(url, { headers: { Accept: "application/json" } });
      if (!resp.ok) throw new Error("Failed to fetch report");
      const body = await resp.json();
      if (!body.ok || !body.report) throw new Error("Invalid response");
      return body.report as {
        metrics: Record<string, number | string>;
        sections: Array<{ title: string; rows: Array<Record<string, number | string>> }>;
      };
    },
    []
  );

  const generateComparison = async () => {
    setGenerateError(null);
    setGenerating(true);
    setBusyAction("generate-report");
    try {
      const resolver = compareType === "months" ? monthRange
        : compareType === "quarters" ? quarterRange : yearRange;
      const r1 = resolver(period1);
      const r2 = resolver(period2);
      const r3 = resolver(period3);

      if (reportType === "cost-comparison-detail") {
        const [rpt1, rpt2, rpt3] = await Promise.all([
          fetchFullReport("costs", r1.from, r1.to),
          fetchFullReport("costs", r2.from, r2.to),
          fetchFullReport("costs", r3.from, r3.to),
        ]);
        setDetailCostData({
          labels: [r1.label, r2.label, r3.label],
          reports: [rpt1, rpt2, rpt3],
        });
        setComparisonData(null);
        setError(null);
      } else {
        const endpoint = reportType === "cost-comparison" ? "costs" : "sales";

        const [m1, m2, m3] = await Promise.all([
          fetchReportForPeriod(endpoint, r1.from, r1.to),
          fetchReportForPeriod(endpoint, r2.from, r2.to),
          fetchReportForPeriod(endpoint, r3.from, r3.to),
        ]);

        setComparisonData({
          reportType: reportType === "cost-comparison" ? "costs" : "sales",
          labels: [r1.label, r2.label, r3.label],
          metrics: [m1, m2, m3],
        });
        setDetailCostData(null);
        setError(null);
      }
    } catch {
      setGenerateError("Failed to generate comparison. Please try again.");
    } finally {
      setGenerating(false);
      setBusyAction(null);
    }
  };

  const generateReport = async () => {
    setGenerateError(null);

    if (isComparison) {
      await generateComparison();
      return;
    }

    if (reportType === "accounting-export") {
      window.open(csvDownloadUrl, "_blank");
      return;
    }

    setGenerating(true);
    setBusyAction("generate-report");
    try {
      const url = buildUrl("json");
      const resp = await fetch(url, { headers: { Accept: "application/json" } });
      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        const msg = body?.error?.user_message || "Report generation failed. Please try again.";
        setGenerateError(msg);
        return;
      }
      const body = await resp.json();
      if (body.ok && body.report) {
        setReportData(body.report);
        setError(null);
      } else {
        setGenerateError("Unexpected response from the server.");
      }
    } catch {
      setGenerateError("Network error. Please check your connection and try again.");
    } finally {
      setGenerating(false);
      setBusyAction(null);
    }
  };

  useKeyboardShortcuts([
    {
      key: "p",
      modifiers: ["meta"],
      action: () => {
        if (reportData) {
          window.print();
        }
      },
    },
  ]);

  return (
    <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm print:border-none print:bg-transparent print:p-0 print:shadow-none">
      {/* Controls — hidden when printing */}
      <div className="print:hidden">
        <h3 className="mb-3 text-lg font-semibold text-[var(--ui-title)]">Reports</h3>

        <div ref={reportTypeSelectorRef} className="mb-3 flex flex-wrap items-end gap-3">
          <FormField label="Report type">
            <SelectInput
              value={reportType}
              onChange={(v) => {
                setReportType(v);
                setReportData(null);
                setComparisonData(null);
                setDetailCostData(null);
                setGenerateError(null);
              }}
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
                setReportData(null);
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
                setReportData(null);
              }}
              className="rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm text-[var(--ui-title)] focus:border-[var(--ui-accent)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
          </FormField>
        </div>

        {isComparison ? (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              {(["months", "quarters", "years"] as CompareType[]).map((ct) => (
                <button
                  key={ct}
                  type="button"
                  onClick={() => {
                    setCompareType(ct);
                    setComparisonData(null);
                  }}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    compareType === ct
                      ? "border-[var(--ui-accent)] bg-[var(--ui-accent)]/10 text-[var(--ui-accent)]"
                      : "border-[var(--ui-border)] text-[var(--ui-body)] hover:bg-[var(--ui-neutral)]"
                  }`}
                >
                  {ct === "months" ? "Compare Months" : ct === "quarters" ? "Compare Quarters" : "Compare Years"}
                </button>
              ))}
            </div>
            <div className="mb-3 flex flex-wrap items-end gap-3">
              <FormField label="Period 1">
                <SelectInput value={period1} onChange={(v) => { setPeriod1(v); setComparisonData(null); }} options={periodOptions} />
              </FormField>
              <FormField label="Period 2">
                <SelectInput value={period2} onChange={(v) => { setPeriod2(v); setComparisonData(null); }} options={periodOptions} />
              </FormField>
              <FormField label="Period 3">
                <SelectInput value={period3} onChange={(v) => { setPeriod3(v); setComparisonData(null); }} options={periodOptions} />
              </FormField>
            </div>
          </>
        ) : supportsDates ? (
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

        {generateError && (
          <div className="mb-3 rounded-lg border border-[var(--ui-red)]/30 bg-[var(--ui-red)]/5 px-4 py-3">
            <p className="text-sm text-[var(--ui-red)]">{generateError}</p>
          </div>
        )}

        {!reportData && !comparisonData && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="accent"
              size="lg"
              onClick={() => void generateReport()}
              busy={generating}
              disabled={generating || busyAction != null}
            >
              {isComparison ? "Generate Comparison" : "Generate Report"}
            </Button>
            {!isComparison && (
              <Button
                variant="secondary"
                size="lg"
                onClick={() => window.open(csvDownloadUrl, "_blank")}
              >
                Export CSV
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Loading state */}
      {generating && (
        <div className="flex items-center justify-center py-12 print:hidden">
          <LoadingSpinner />
          <span className="ml-3 text-sm text-[var(--ui-body)]">Generating report...</span>
        </div>
      )}

      {/* Report viewer */}
      {reportData && !generating && (
        <ReportViewer
          report={reportData}
          csvDownloadUrl={csvDownloadUrl}
          businessName={businessName}
          appVersion={appVersion}
          onClose={() => {
            setReportData(null);
            setGenerateError(null);
          }}
        />
      )}

      {/* Comparison viewer */}
      {comparisonData && !generating && (
        <ComparisonViewer
          data={comparisonData}
          businessName={businessName}
          appVersion={appVersion}
          onClose={() => {
            setComparisonData(null);
            setGenerateError(null);
          }}
        />
      )}

      {/* Detail cost comparison viewer */}
      {detailCostData && !generating && (
        <DetailCostComparisonViewer
          data={detailCostData}
          businessName={businessName}
          appVersion={appVersion}
          onClose={() => {
            setDetailCostData(null);
            setGenerateError(null);
          }}
        />
      )}

      {/* Hint text below buttons */}
      {!reportData && !comparisonData && !detailCostData && !generating && (
        <p className="mt-4 text-center text-xs text-[var(--ui-muted)] print:hidden">
          Select a report type, choose a date range, and click Generate Report.
          Reports can be printed or saved as PDF directly from your browser.
        </p>
      )}
    </section>
  );
}
