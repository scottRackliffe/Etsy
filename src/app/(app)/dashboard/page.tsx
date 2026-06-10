"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressModal } from "@/components/ui/ProgressModal";
import { ActivityLogSection } from "@/components/activity/ActivityLogSection";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { EtsySyncStatus } from "@/components/dashboard/EtsySyncStatus";
import { InventoryValueWidget } from "@/components/dashboard/InventoryValueWidget";
import { useEtsySync } from "@/hooks/useEtsySync";
import { useToast } from "@/hooks/useToast";

export default function DashboardPage() {
  const {
    shops,
    selectedShopId,
    setSelectedShopId,
    receipts,
    receiptsLoading,
    count,
    setBusyAction,
    setApiError,
    setError,
    currencyCode,
  } = useApp();

  const router = useRouter();
  const [repeatCustomersMonth, setRepeatCustomersMonth] = useState<number | null>(null);
  const [activityLogKey, setActivityLogKey] = useState(0);
  const activityLogRef = useRef<HTMLDivElement>(null);
  const { modal: syncModal, runSync } = useEtsySync();
  const toast = useToast();

  useEffect(() => {
    void fetch("/api/dashboard/stats", { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((data: { repeat_customers_this_month?: number }) =>
        setRepeatCustomersMonth(data.repeat_customers_this_month ?? 0)
      )
      .catch(() => setRepeatCustomersMonth(null));
  }, []);

  const paidCount = receipts.filter((r) => r.was_paid).length;
  const shippedCount = receipts.filter((r) => r.was_shipped).length;
  const grossTotal = receipts.reduce((sum, r) => sum + parseFloat(r.total_price || "0"), 0);
  const grossCurrency = receipts[0]?.currency_code ?? currencyCode;

  const formatDate = (ts: number) =>
    new Date(ts * 1000).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  const formatMoney = (value: string, code: string) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code || currencyCode,
    }).format(parseFloat(value || "0"));

  const syncFromEtsy = () => {
    if (!selectedShopId) return;
    setBusyAction("sync-etsy");
    void runSync(selectedShopId, {
      onSuccess: () => {
        setActivityLogKey((k) => k + 1);
        setError({
          title: "Etsy sync complete",
          message: "Latest Etsy receipts were synchronized.",
          actions: ["Review recent orders below or open the Sales tab."],
        });
      },
      onCancelled: (result) => {
        const n = result.synced ?? 0;
        toast.showToast(
          n > 0 ? `Sync cancelled. ${n} receipts were processed before cancel.` : "Sync cancelled.",
          "info"
        );
      },
      onError: () => {
        setApiError("Could not sync from Etsy", "We could not sync Etsy receipts.", null);
      },
    }).finally(() => setBusyAction(null));
  };

  const scrollToActivityLog = () => {
    activityLogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <ProgressModal {...syncModal} />
      <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ui-title)]">Dashboard</h2>
            <p className="text-sm text-[var(--ui-muted)]">
              Live order snapshot for your selected Etsy shop.
            </p>
          </div>
          <div className="flex items-center gap-2">
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
        </div>

        <div className="mb-4">
          <EtsySyncStatus connected={shops.length > 0} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <article className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--ui-muted)]">Receipts</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--ui-title)]">{count}</p>
          </article>
          <article className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--ui-muted)]">Paid</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--ui-green)]">{paidCount}</p>
          </article>
          <article className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--ui-muted)]">Shipped</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--ui-accent)]">{shippedCount}</p>
          </article>
          <article className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--ui-muted)]">
              Repeat customers (month)
            </p>
            <p className="mt-2 text-2xl font-semibold text-[var(--ui-title)]">
              {repeatCustomersMonth ?? "—"}
            </p>
          </article>
          <article className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--ui-muted)]">Gross total</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--ui-title)]">
              {new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: grossCurrency,
              }).format(grossTotal)}
            </p>
          </article>
        </div>
      </section>

      <InventoryValueWidget />

      <ActivityFeed
        onViewAll={scrollToActivityLog}
        onSyncComplete={() => setActivityLogKey((k) => k + 1)}
      />

      <div ref={activityLogRef}>
        <ActivityLogSection key={activityLogKey} id="activity-log" />
      </div>

      <section className="overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ui-border)] px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-[var(--ui-title)]">Recent orders</h3>
            <p className="text-sm text-[var(--ui-muted)]">
              {count} receipt(s) with paid/shipped status.
            </p>
          </div>
          <span className="rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-2 py-1 text-xs text-[var(--ui-muted)]">
            Updated live
          </span>
        </div>

        {receiptsLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} className="h-12 animate-pulse rounded-lg bg-[var(--ui-list-light)]" />
            ))}
          </div>
        ) : receipts.length === 0 ? (
          <EmptyState
            message="No orders yet."
            primaryAction={
              shops.length > 0
                ? { label: "Sync from Etsy", onClick: () => void syncFromEtsy() }
                : {
                    label: "Connect Etsy first",
                    onClick: () => router.push("/config#etsy-connection"),
                    variant: "secondary",
                  }
            }
            secondaryAction={{ label: "Go to Inventory", onClick: () => router.push("/inventory") }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--ui-border)] bg-[var(--ui-panel-bg)] text-xs uppercase tracking-wide text-[var(--ui-muted)]">
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-5 py-3 font-semibold">Order #</th>
                  <th className="px-5 py-3 font-semibold">Ship to</th>
                  <th className="px-5 py-3 font-semibold">Total</th>
                  <th className="px-5 py-3 font-semibold">Paid</th>
                  <th className="px-5 py-3 font-semibold">Shipped</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((r, i) => (
                  <tr
                    key={r.receipt_id}
                    className="border-b border-[var(--ui-border)]/70 transition hover:bg-[var(--ui-list-hover)]/60"
                    style={{
                      backgroundColor: i % 2 === 0 ? "var(--ui-list-dark)" : "var(--ui-list-light)",
                    }}
                  >
                    <td className="px-5 py-3 text-[var(--ui-body)]">
                      {formatDate(r.creation_tsz)}
                    </td>
                    <td className="px-5 py-3 font-mono text-[var(--ui-title)]">{r.receipt_id}</td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-[var(--ui-title)]">{r.name}</p>
                      <p className="text-xs text-[var(--ui-muted)]">
                        {r.first_line}, {r.city} {r.state} {r.zip} {r.country_iso}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-[var(--ui-body)]">
                      {formatMoney(r.total_price, r.currency_code)}
                      {parseFloat(r.total_shipping_cost) > 0 && (
                        <span className="text-xs text-[var(--ui-muted)]">
                          {" "}
                          + {formatMoney(r.total_shipping_cost, r.currency_code)} ship
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <Badge
                        label={r.was_paid ? "Paid" : "Unpaid"}
                        variant={r.was_paid ? "success" : "warning"}
                      />
                    </td>
                    <td className="px-5 py-3">
                      <Badge
                        label={r.was_shipped ? "Shipped" : "Pending"}
                        variant={r.was_shipped ? "success" : "neutral"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
