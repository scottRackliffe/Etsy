"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import { formatCurrency } from "@/lib/format-currency";
import { WidgetHeader } from "@/components/dashboard/WidgetHeader";

type InventoryValue = {
  at_cost: number;
  at_sale_price: number;
  potential_margin: number;
  potential_margin_pct: number | null;
  item_count: number;
};

type ProfitKpis = {
  avg_margin_this_month: number | null;
  avg_margin_this_month_count: number;
  total_profit_this_month: number;
  total_profit_ytd: number;
};

export function InventoryValueWidget({ embedded = false }: { embedded?: boolean }) {
  const { currencyCode } = useApp();
  const formatMoney = (value: number) => formatCurrency(value, currencyCode);
  const [value, setValue] = useState<InventoryValue | null>(null);
  const [profit, setProfit] = useState<ProfitKpis | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [valueRes, dashRes] = await Promise.all([
        fetch("/api/dashboard/inventory-value", { headers: { Accept: "application/json" } }),
        fetch("/api/dashboard", { headers: { Accept: "application/json" } }),
      ]);
      const valueData = (await valueRes.json().catch(() => ({}))) as InventoryValue;
      const dashData = (await dashRes.json().catch(() => ({}))) as ProfitKpis;
      if (valueRes.ok) {
        setValue({
          at_cost: valueData.at_cost,
          at_sale_price: valueData.at_sale_price,
          potential_margin: valueData.potential_margin,
          potential_margin_pct: valueData.potential_margin_pct,
          item_count: valueData.item_count,
        });
      }
      if (dashRes.ok) {
        setProfit({
          avg_margin_this_month: dashData.avg_margin_this_month,
          avg_margin_this_month_count: dashData.avg_margin_this_month_count,
          total_profit_this_month: dashData.total_profit_this_month,
          total_profit_ytd: dashData.total_profit_ytd,
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const marginColor =
    value == null
      ? "text-[var(--ui-muted)]"
      : value.potential_margin > 0
        ? "text-[var(--ui-green)]"
        : value.potential_margin < 0
          ? "text-[var(--ui-red)]"
          : "text-[var(--ui-muted)]";

  const labelClass = embedded
    ? "text-xs text-[var(--ui-muted)]"
    : "text-xs uppercase tracking-wide text-[var(--ui-muted)]";
  const metricClass = embedded
    ? "mt-1 text-lg font-semibold"
    : "mt-2 text-xl font-semibold";

  const wrapperClass = embedded
    ? "h-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4"
    : "rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm";

  const inner = (
    <>
      <WidgetHeader
        title="Inventory value"
        subtitle={
          loading
            ? "Loading…"
            : value
              ? `${value.item_count} unsold items`
              : "Could not load inventory value"
        }
        href="/inventory"
      />
      {value ? (
        <div className={`grid grid-cols-3 ${embedded ? "mt-3 gap-2" : "gap-3"}`}>
          {(
            [
              { label: "At cost", amount: value.at_cost, color: "text-[var(--ui-title)]" },
              { label: "At asking price", amount: value.at_sale_price, color: "text-[var(--ui-title)]" },
              {
                label: "Potential margin",
                amount: value.potential_margin,
                color: marginColor,
                pct: value.potential_margin_pct,
              },
            ] as const
          ).map((metric) => (
            <div
              key={metric.label}
              className={
                embedded ? "" : "rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4"
              }
            >
              <p className={labelClass}>{metric.label}</p>
              <p className={`${metricClass} ${metric.color}`}>
                {formatMoney(metric.amount)}
                {"pct" in metric && metric.pct != null ? (
                  <span className={`ml-1 font-normal ${embedded ? "text-xs" : "text-sm"}`}>
                    ({metric.pct.toFixed(1)}%)
                  </span>
                ) : null}
              </p>
            </div>
          ))}
        </div>
      ) : null}
      {profit && !embedded ? (
        <div className="mt-4 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4 text-sm text-[var(--ui-body)]">
          <p className="font-medium text-[var(--ui-title)]">
            Avg margin this month:{" "}
            {profit.avg_margin_this_month != null
              ? `${profit.avg_margin_this_month.toFixed(1)}%`
              : "—"}
            <span className="ml-1 font-normal text-[var(--ui-muted)]">
              ({profit.avg_margin_this_month_count} items sold)
            </span>
          </p>
          <p className="mt-1 text-[var(--ui-muted)]">
            Profit this month {formatMoney(profit.total_profit_this_month)} · Profit YTD{" "}
            {formatMoney(profit.total_profit_ytd)}
          </p>
        </div>
      ) : null}
    </>
  );

  if (embedded) {
    return <div className={wrapperClass}>{inner}</div>;
  }

  return <section className={wrapperClass}>{inner}</section>;
}
