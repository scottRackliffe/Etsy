"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import { formatCurrency } from "@/lib/format-currency";
import { WidgetHeader } from "@/components/dashboard/WidgetHeader";

type BillSummary = {
  unpaid_amount: number;
  paid_amount: number;
  unpaid_count: number;
  paid_count: number;
  bill_count: number;
  last_payment_date: string | null;
  last_payment_at: string | null;
};

function formatDisplayDate(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function BillPaymentsWidget({ embedded = false }: { embedded?: boolean }) {
  const { currencyCode } = useApp();
  const fmt = (n: number) => formatCurrency(n, currencyCode);

  const [summary, setSummary] = useState<BillSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const summaryRes = await fetch("/api/expenses/bills/summary", {
        headers: { Accept: "application/json" },
      });
      const summaryData = (await summaryRes.json().catch(() => ({}))) as Partial<BillSummary>;

      if (summaryRes.ok) {
        setSummary({
          unpaid_amount: summaryData.unpaid_amount ?? 0,
          paid_amount: summaryData.paid_amount ?? 0,
          unpaid_count: summaryData.unpaid_count ?? 0,
          paid_count: summaryData.paid_count ?? 0,
          bill_count: summaryData.bill_count ?? 0,
          last_payment_date: summaryData.last_payment_date ?? null,
          last_payment_at: summaryData.last_payment_at ?? null,
        });
      } else {
        setSummary(null);
      }
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const wrapperClass = embedded
    ? "h-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4"
    : "rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm";

  const labelClass = embedded
    ? "text-xs text-[var(--ui-muted)]"
    : "text-xs uppercase tracking-wide text-[var(--ui-muted)]";
  const valueClass = embedded
    ? "mt-1 text-lg font-semibold"
    : "mt-2 text-xl font-semibold";
  const metricCardClass = embedded
    ? ""
    : "rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4";

  const inner = (
    <>
      <WidgetHeader
        title="Bill payments"
        subtitle={
          loading
            ? "Loading…"
            : `${summary?.bill_count ?? 0} bill${summary?.bill_count !== 1 ? "s" : ""} tracked (excl. tax)`
        }
        href="/expenses"
        viewLabel="Expenses"
      />

      {loading ? (
        <p className="text-xs text-[var(--ui-muted)]">Loading bill summary...</p>
      ) : summary ? (
        <div className={`grid grid-cols-3 ${embedded ? "gap-2" : "gap-3"}`}>
          <div className={metricCardClass}>
            <p className={labelClass}>Unpaid bills</p>
            <p
              className={`${valueClass} ${summary.unpaid_amount > 0 ? "text-[var(--ui-yellow)]" : "text-[var(--ui-title)]"}`}
            >
              {fmt(summary.unpaid_amount)}
            </p>
            <p className="mt-1 text-xs text-[var(--ui-muted)]">
              {summary.unpaid_count} outstanding
            </p>
          </div>
          <div className={metricCardClass}>
            <p className={labelClass}>Paid bills</p>
            <p className={`${valueClass} text-[var(--ui-green)]`}>{fmt(summary.paid_amount)}</p>
            <p className="mt-1 text-xs text-[var(--ui-muted)]">
              {summary.paid_count} fully paid
            </p>
          </div>
          <div className={metricCardClass}>
            <p className={labelClass}>Last payment</p>
            <p className={`${valueClass} text-[var(--ui-title)]`}>
              {formatDisplayDate(summary.last_payment_date)}
            </p>
            <p className="mt-1 text-xs text-[var(--ui-muted)]">
              {summary.last_payment_at
                ? formatDateTime(summary.last_payment_at)
                : "none recorded yet"}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-[var(--ui-muted)]">
          No bills recorded yet. Add bills in Expenses to track vendor invoices and payments.
        </p>
      )}
    </>
  );

  if (embedded) {
    return <div className={wrapperClass}>{inner}</div>;
  }

  return <section className={wrapperClass}>{inner}</section>;
}
