"use client";

import { useCallback, useEffect, useState } from "react";

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

function formatMoney(value: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value);
}

export function InventoryValueWidget() {
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

  return (
    <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm">
      <h3 className="mb-1 text-lg font-semibold text-[var(--ui-title)]">Inventory value</h3>
      <p className="mb-4 text-sm text-[var(--ui-muted)]">
        {loading
          ? "Loading…"
          : value
            ? `${value.item_count} unsold items`
            : "Could not load inventory value"}
      </p>
      {value ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--ui-muted)]">At cost</p>
            <p className="mt-2 text-xl font-semibold text-[var(--ui-title)]">
              {formatMoney(value.at_cost)}
            </p>
          </article>
          <article className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--ui-muted)]">At sale price</p>
            <p className="mt-2 text-xl font-semibold text-[var(--ui-title)]">
              {formatMoney(value.at_sale_price)}
            </p>
          </article>
          <article className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--ui-muted)]">
              Potential margin
            </p>
            <p className={`mt-2 text-xl font-semibold ${marginColor}`}>
              {formatMoney(value.potential_margin)}
              {value.potential_margin_pct != null ? (
                <span className="ml-1 text-sm font-normal">
                  ({value.potential_margin_pct.toFixed(1)}%)
                </span>
              ) : null}
            </p>
          </article>
        </div>
      ) : null}
      {profit ? (
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
    </section>
  );
}
