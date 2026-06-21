"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import { formatCurrency } from "@/lib/format-currency";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ApiErrorShape } from "@/types";

type OrderLine = {
  inventory_id: number | null;
  description: string | null;
  quantity: number;
  unit_price: number | null;
};

type HistoryOrder = {
  id: number;
  order_number: string | null;
  order_date: string | null;
  order_status: string;
  payment_status: string | null;
  source_channel: string | null;
  grand_total: number | null;
  shipped: boolean;
  items: OrderLine[];
};

type Summary = {
  total_orders: number;
  total_spent: number;
  first_order_date: string | null;
  last_order_date: string | null;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

function itemSummary(items: OrderLine[]): string {
  const text = items.map((item) => item.description?.trim() || "Item").join(", ");
  if (text.length <= 80) return text;
  return `${text.slice(0, 77)}...`;
}

type Props = {
  customerId: number | null;
  onError: (title: string, message: string, err?: unknown) => void;
};

export function CustomerOrderHistory({ customerId, onError }: Props) {
  const { currencyCode } = useApp();
  const formatMoney = (v: number | null | undefined) => formatCurrency(v ?? 0, currencyCode);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [orders, setOrders] = useState<HistoryOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const pageSize = 10;

  const loadPage = useCallback(
    async (nextOffset: number, append: boolean) => {
      if (!customerId) return;
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const params = new URLSearchParams({
          limit: String(pageSize),
          offset: String(nextOffset),
        });
        const response = await fetch(`/api/customers/${customerId}/orders?${params}`, {
          headers: { Accept: "application/json" },
        });
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
          summary?: Summary;
          items?: HistoryOrder[];
          pagination?: { has_more?: boolean; offset?: number };
        };
        if (!response.ok) {
          if (response.status === 404) return;
          throw data;
        }
        setSummary(data.summary ?? null);
        setOrders((current) => (append ? [...current, ...(data.items ?? [])] : (data.items ?? [])));
        setHasMore(Boolean(data.pagination?.has_more));
        setOffset(nextOffset + (data.items?.length ?? 0));
      } catch (err) {
        onError("Could not load order history", "We could not load orders for this customer.", err);
        if (!append) {
          setSummary(null);
          setOrders([]);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [customerId, onError]
  );

  useEffect(() => {
    if (!customerId) {
      setSummary(null);
      setOrders([]);
      setHasMore(false);
      setOffset(0);
      return;
    }
    void loadPage(0, false);
  }, [customerId, loadPage]);

  if (!customerId) return null;

  return (
    <div className="mt-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
      <h4 className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Order history</h4>

      {loading ? (
        <p className="text-sm text-[var(--ui-muted)]">Loading order history…</p>
      ) : summary && summary.total_orders > 0 ? (
        <>
          <p className="mb-3 text-xs text-[var(--ui-muted)]">
            {summary.total_orders} order{summary.total_orders === 1 ? "" : "s"} | Total spent:{" "}
            {formatMoney(summary.total_spent)} | First: {formatDate(summary.first_order_date)} |
            Last: {formatDate(summary.last_order_date)}
          </p>
          <ul className="space-y-2">
            {orders.map((order) => {
              const inactive = order.order_status === "void" || order.order_status === "cancelled";
              return (
                <li
                  key={order.id}
                  className={`rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 ${
                    inactive ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <Link
                        href={`/orders?orderId=${order.id}`}
                        className={`text-sm font-medium text-[var(--ui-accent)] hover:underline ${
                          inactive ? "line-through" : ""
                        }`}
                      >
                        {order.order_number ?? `Order ${order.id}`}
                      </Link>
                      <p className="text-xs text-[var(--ui-muted)]">
                        {formatDate(order.order_date)}
                        {order.items.length > 0 ? (
                          <span className="ml-2">
                            {order.items.length} item{order.items.length === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-xs text-[var(--ui-body)]">
                        {itemSummary(order.items)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-[var(--ui-title)]">
                        {formatMoney(order.grand_total)}
                      </p>
                      <div className="mt-1 flex flex-wrap justify-end gap-1">
                        <Badge
                          label={
                            order.payment_status === "paid"
                              ? "Paid"
                              : order.payment_status === "refunded"
                                ? "Refunded"
                                : "Unpaid"
                          }
                          variant={
                            order.payment_status === "paid"
                              ? "success"
                              : order.payment_status === "refunded"
                                ? "neutral"
                                : "warning"
                          }
                        />
                        <Badge
                          label={order.source_channel === "etsy" ? "Etsy" : "Manual"}
                          variant="neutral"
                        />
                        {order.order_status === "void" ? (
                          <Badge label="Void" variant="error" />
                        ) : order.order_status === "cancelled" ? (
                          <Badge label="Cancelled" variant="neutral" />
                        ) : order.shipped ? (
                          <Badge label="Shipped" variant="success" />
                        ) : (
                          <Badge label="Not shipped" variant="neutral" />
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {hasMore ? (
            <div className="mt-3">
              <Button
                variant="secondary"
                size="sm"
                busy={loadingMore}
                onClick={() => void loadPage(offset, true)}
              >
                Load more
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState message="No orders yet for this customer." />
      )}
    </div>
  );
}
