"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { formatCurrency } from "@/lib/format-currency";
import { ActivityLogSection } from "@/components/activity/ActivityLogSection";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { InventoryValueWidget } from "@/components/dashboard/InventoryValueWidget";
import { TaxPaymentWidget } from "@/components/dashboard/TaxPaymentWidget";
import { BillPaymentsWidget } from "@/components/dashboard/BillPaymentsWidget";
import { KpiTile } from "@/components/dashboard/KpiTile";
import { WidgetHeader } from "@/components/dashboard/WidgetHeader";
import { getInventoryAgingCounts } from "@/lib/inventory-aging";

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <h3
      className={`mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)] ${className}`}
    >
      {children}
    </h3>
  );
}

export default function DashboardPage() {
  const { shops, selectedShopId, setSelectedShopId, currencyCode } = useApp();

  const activityLogRef = useRef<HTMLDivElement>(null);

  type DashboardKpis = {
    total_orders: number;
    paid_orders: number;
    shipped_orders: number;
    unshipped_orders: number;
    unpaid_orders: number;
    unpaid_receivables: number;
    gross_revenue: number;
    orders_this_month: number;
    revenue_this_month: number;
    orders_last_7_days: number;
    aov_this_month: number;
    repeat_customers_this_month: number;
    outstanding_count: number;
    not_listed_count: number;
    total_profit_this_month: number;
    total_profit_ytd: number;
    avg_margin_this_month: number | null;
    avg_margin_this_month_count: number;
    last_etsy_sync_at: string | null;
  };

  const [kpis, setKpis] = useState<DashboardKpis | null>(null);

  const [agingItems, setAgingItems] = useState<
    Array<{ date_purchased: string | null; date_listed: string | null; created_at: string | null; status: string | null }>
  >([]);

  const loadDashboardKpis = () => {
    void fetch("/api/dashboard", { headers: { Accept: "application/json" }, credentials: "include" })
      .then((r) => r.json())
      .then((data: Partial<DashboardKpis>) =>
        setKpis({
          total_orders: data.total_orders ?? 0,
          paid_orders: data.paid_orders ?? 0,
          shipped_orders: data.shipped_orders ?? 0,
          unshipped_orders: data.unshipped_orders ?? 0,
          unpaid_orders: data.unpaid_orders ?? 0,
          unpaid_receivables: data.unpaid_receivables ?? 0,
          gross_revenue: data.gross_revenue ?? 0,
          orders_this_month: data.orders_this_month ?? 0,
          revenue_this_month: data.revenue_this_month ?? 0,
          orders_last_7_days: data.orders_last_7_days ?? 0,
          aov_this_month: data.aov_this_month ?? 0,
          repeat_customers_this_month: data.repeat_customers_this_month ?? 0,
          outstanding_count: data.outstanding_count ?? 0,
          not_listed_count: data.not_listed_count ?? 0,
          total_profit_this_month: data.total_profit_this_month ?? 0,
          total_profit_ytd: data.total_profit_ytd ?? 0,
          avg_margin_this_month: data.avg_margin_this_month ?? null,
          avg_margin_this_month_count: data.avg_margin_this_month_count ?? 0,
          last_etsy_sync_at: data.last_etsy_sync_at ?? null,
        })
      )
      .catch(() => setKpis(null));
  };

  useEffect(() => {
    loadDashboardKpis();

    void fetch("/api/inventory?limit=1000", { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((data: { items?: Array<{ date_purchased: string | null; date_listed: string | null; created_at: string | null; status: string | null }> }) =>
        setAgingItems(data.items ?? [])
      )
      .catch(() => setAgingItems([]));
  }, []);

  const agingCounts = useMemo(() => getInventoryAgingCounts(agingItems), [agingItems]);

  const scrollToActivityLog = () => {
    activityLogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      {shops.length > 1 && (
        <div className="mb-3 flex items-center justify-end gap-2">
          <label className="text-sm font-medium text-[var(--ui-muted)]">Shop</label>
          <select
            value={selectedShopId ?? ""}
            onChange={(e) => setSelectedShopId(Number(e.target.value))}
            className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm text-[var(--ui-body)] shadow-inner focus:border-[var(--ui-accent)] focus:outline-none"
          >
            {shops.map((s) => (
              <option key={s.shop_id} value={s.shop_id}>
                {s.shop_name}
              </option>
            ))}
          </select>
        </div>
      )}

      <SectionLabel>Performance · this month</SectionLabel>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiTile
          label="Revenue (mo)"
          value={kpis ? formatCurrency(kpis.revenue_this_month, currencyCode) : "—"}
          sub={kpis ? `${formatCurrency(kpis.gross_revenue, currencyCode)} all-time` : undefined}
          href="/orders"
        />
        <KpiTile
          label="Profit (mo)"
          value={kpis ? formatCurrency(kpis.total_profit_this_month, currencyCode) : "—"}
          tone={
            kpis && kpis.total_profit_this_month < 0
              ? "bad"
              : kpis && kpis.total_profit_this_month > 0
                ? "good"
                : "default"
          }
          sub={kpis ? `${formatCurrency(kpis.total_profit_ytd, currencyCode)} YTD` : undefined}
        />
        <KpiTile
          label="Avg margin (mo)"
          value={
            kpis && kpis.avg_margin_this_month != null
              ? `${kpis.avg_margin_this_month.toFixed(1)}%`
              : "—"
          }
          tone={kpis && (kpis.avg_margin_this_month ?? 0) > 0 ? "good" : "default"}
          sub={kpis ? `${kpis.avg_margin_this_month_count} sold` : undefined}
        />
        <KpiTile
          label="Avg order value"
          value={kpis ? formatCurrency(kpis.aov_this_month, currencyCode) : "—"}
          sub={kpis ? `${kpis.orders_this_month} orders this month` : undefined}
        />
        <KpiTile
          label="Repeat customers (mo)"
          value={kpis?.repeat_customers_this_month ?? "—"}
        />
      </div>

      <SectionLabel className="mt-6">Needs attention</SectionLabel>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiTile
          label="Awaiting shipment"
          value={kpis?.unshipped_orders ?? "—"}
          tone={kpis && kpis.unshipped_orders > 0 ? "warn" : "default"}
          sub={kpis ? `${kpis.shipped_orders} shipped` : undefined}
          href="/shipping"
        />
        <KpiTile
          label="Unpaid orders"
          value={kpis?.unpaid_orders ?? "—"}
          tone={kpis && kpis.unpaid_orders > 0 ? "warn" : "default"}
          sub={kpis ? `${formatCurrency(kpis.unpaid_receivables, currencyCode)} owed` : undefined}
          subTone={kpis && kpis.unpaid_receivables > 0 ? "warn" : "default"}
          href="/orders"
        />
        <KpiTile
          label="Not listed"
          value={kpis?.not_listed_count ?? "—"}
          tone={kpis && kpis.not_listed_count > 0 ? "warn" : "default"}
          sub="in stock"
          href="/inventory"
        />
        <KpiTile
          label="Outstanding"
          value={kpis?.outstanding_count ?? "—"}
          tone={kpis && kpis.outstanding_count > 0 ? "warn" : "default"}
          sub="tasks needing attention"
          href="/outstanding"
        />
        <KpiTile
          label="Active orders"
          value={kpis?.total_orders ?? "—"}
          sub={kpis ? `${kpis.orders_last_7_days} in last 7 days` : undefined}
          href="/orders"
        />
      </div>

      <SectionLabel className="mt-6">Inventory</SectionLabel>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <InventoryValueWidget embedded />
        </div>
        <article className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4 lg:col-span-2">
          <WidgetHeader
            title="Aging inventory"
            subtitle="in-stock & listed items"
            href="/reports?report_type=inventory-aging"
            viewLabel="View report"
          />
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-xs text-[var(--ui-muted)]">&gt; 30 days</p>
              <p className="mt-1 text-xl font-semibold text-[var(--ui-body)]">{agingCounts.over_30}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--ui-muted)]">&gt; 60 days</p>
              <p className="mt-1 text-xl font-semibold text-[var(--ui-yellow)]">{agingCounts.over_60}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--ui-muted)]">&gt; 90 days</p>
              <p className="mt-1 text-xl font-semibold text-[var(--ui-yellow)]">{agingCounts.over_90}</p>
            </div>
          </div>
        </article>
      </div>

      <SectionLabel className="mt-6">Finances</SectionLabel>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <TaxPaymentWidget embedded />
        <BillPaymentsWidget embedded />
      </div>

      <SectionLabel className="mt-6">Activity</SectionLabel>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 lg:items-stretch lg:min-h-[36rem]">
        <div className="flex min-h-0 flex-col lg:col-span-1 lg:h-full">
          <ActivityFeed compact onViewAll={scrollToActivityLog} />
        </div>
        <div ref={activityLogRef} className="flex min-h-0 flex-col lg:col-span-2 lg:h-full">
          <ActivityLogSection id="activity-log" compact />
        </div>
      </div>
    </>
  );
}
