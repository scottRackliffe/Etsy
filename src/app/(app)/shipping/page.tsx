"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type SortState } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { ShippingPanel } from "@/components/shipping/ShippingPanel";
import { usePagination } from "@/hooks/usePagination";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { ApiErrorShape, Order, PaginationInfo } from "@/types";

type ShippingChip = "all" | "needs_label" | "label_purchased" | "shipped";

function deriveShippingStatus(
  order: Order
): "needs_label" | "label_purchased" | "shipped" {
  if (order.shipping_date) return "shipped";
  if (order.label_url) return "label_purchased";
  return "needs_label";
}

function ShippingPageInner() {
  const {
    setApiError,
    setError,
    pageSize: configPageSize,
  } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [shippingChip, setShippingChip] = useState<ShippingChip>("all");
  const [sort, setSort] = useState<SortState>({ key: "order_date", dir: "desc" });
  const { page, pageSize, offset, total: listTotal, setPage, setTotal } =
    usePagination(configPageSize);
  const [scrollToOrderId, setScrollToOrderId] = useState<number | null>(null);

  // Map UI chip to API shipping_status param
  const apiShippingStatus = useMemo(() => {
    if (shippingChip === "shipped") return "shipped";
    if (shippingChip === "needs_label" || shippingChip === "label_purchased")
      return "not_shipped";
    return null;
  }, [shippingChip]);

  const reloadOrders = useCallback(async () => {
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(offset),
      order_status: "active",
    });
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (apiShippingStatus) params.set("shipping_status", apiShippingStatus);
    if (sort) {
      params.set("sort_by", sort.key);
      params.set("sort_dir", sort.dir);
    }
    try {
      const response = await fetch(`/api/orders?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
        items?: Order[];
        pagination?: PaginationInfo;
      };
      if (!response.ok) throw data;
      if (data.items) setOrders(data.items);
      if (data.pagination) setTotal(data.pagination.total);
    } catch (err) {
      setApiError("Could not load orders", "We could not load shipping orders.", err);
    }
  }, [debouncedSearch, pageSize, offset, apiShippingStatus, sort, setApiError, setTotal]);

  useEffect(() => {
    void reloadOrders();
  }, [reloadOrders]);

  // Deep-link: ?orderId=<id> selects and scrolls to that order (ADR-035)
  useEffect(() => {
    const raw = searchParams.get("orderId");
    if (!raw) return;
    const id = Number(raw);
    if (!Number.isFinite(id)) return;

    const applyDeepLink = async () => {
      if (orders.some((row) => row.id === id)) {
        setSelectedOrderId(id);
        setScrollToOrderId(id);
        router.replace(pathname);
        return;
      }
      try {
        const response = await fetch(`/api/orders/${id}`, {
          headers: { Accept: "application/json" },
        });
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
          order?: Order;
        };
        if (!response.ok || !data.order) {
          setError({
            title: "Order not found",
            message: "That order may have been deleted.",
            actions: ["Choose another order from the list."],
          });
          router.replace(pathname);
          return;
        }
        setOrders((current) =>
          current.some((row) => row.id === id)
            ? current
            : [data.order as Order, ...current]
        );
        setSelectedOrderId(id);
        setScrollToOrderId(id);
        router.replace(pathname);
      } catch (err) {
        setApiError(
          "Could not open order",
          "We could not load the linked order.",
          err
        );
      }
    };

    void applyDeepLink();
  }, [searchParams, orders, router, pathname, setError, setApiError]);

  // Client-side partition for needs_label vs label_purchased
  // (both arrive from API as not_shipped; we split here)
  const visibleOrders = useMemo(() => {
    if (shippingChip === "needs_label")
      return orders.filter((o) => deriveShippingStatus(o) === "needs_label");
    if (shippingChip === "label_purchased")
      return orders.filter((o) => deriveShippingStatus(o) === "label_purchased");
    return orders;
  }, [orders, shippingChip]);

  const columns = useMemo(
    () => [
      {
        key: "order_number",
        header: "Order",
        sortable: true,
        render: (order: Order) => order.order_number ?? `Order ${order.id}`,
      },
      { key: "order_date", header: "Date", sortable: true },
      {
        key: "customer",
        header: "Customer",
        render: (order: Order) =>
          [order.ship_to_first_name, order.ship_to_last_name]
            .filter(Boolean)
            .join(" ") || "—",
      },
      {
        key: "ship_city",
        header: "City / State",
        render: (order: Order) =>
          [order.ship_to_city, order.ship_to_state_province]
            .filter(Boolean)
            .join(", ") || "—",
      },
      {
        key: "was_paid",
        header: "Paid",
        render: (order: Order) => (
          <Badge
            label={Number(order.was_paid) === 1 ? "Paid" : "Unpaid"}
            variant={Number(order.was_paid) === 1 ? "success" : "warning"}
          />
        ),
      },
      {
        key: "shipping_status",
        header: "Shipping status",
        render: (order: Order) => {
          const s = deriveShippingStatus(order);
          if (s === "shipped")
            return <Badge label="Shipped" variant="success" />;
          if (s === "label_purchased")
            return <Badge label="Label purchased" variant="info" />;
          return <Badge label="Needs label" variant="warning" />;
        },
      },
      {
        key: "shipping_carrier_service",
        header: "Carrier / Service",
        render: (order: Order) =>
          order.shipping_carrier_service ?? order.shipper ?? "—",
      },
      {
        key: "tracking_number",
        header: "Tracking",
        render: (order: Order) => order.tracking_number ?? "—",
      },
      {
        key: "shipping_date",
        header: "Ship date",
        render: (order: Order) => order.shipping_date ?? "—",
      },
    ],
    []
  );

  const updateOrderInList = useCallback((order: Order) => {
    setOrders((current) =>
      current.map((row) => (row.id === order.id ? order : row))
    );
  }, []);

  return (
    <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm">
      <div className="mb-3">
        <h3 className="text-lg font-semibold text-[var(--ui-title)]">Shipping</h3>
        <p className="text-sm text-[var(--ui-muted)]">
          Manage shipping for active orders.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Order list */}
        <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => {
                setPage(0);
                setSearch(e.target.value);
              }}
              aria-label="Search orders"
              placeholder="Search order #, name, city…"
              className="min-w-[10rem] flex-1 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
            />
          </div>
          <div className="mb-3">
            <FilterChipRow
              label="Status"
              value={shippingChip}
              onChange={(value) => {
                setPage(0);
                setShippingChip((value ?? "all") as ShippingChip);
              }}
              options={[
                { value: "needs_label", label: "Needs label" },
                { value: "label_purchased", label: "Label purchased" },
                { value: "shipped", label: "Shipped" },
              ]}
            />
          </div>
          <DataTable
            columns={columns}
            data={visibleOrders}
            selectedId={selectedOrderId}
            onRowClick={(order) => setSelectedOrderId(order.id)}
            sort={sort}
            onSortChange={(next) => {
              setPage(0);
              setSort(next ?? { key: "order_date", dir: "desc" });
            }}
            emptyMessage="No orders on this page."
            scrollToId={scrollToOrderId}
            keyboardNav
          />
          <PaginationBar
            page={page}
            pageSize={pageSize}
            total={listTotal}
            onPageChange={setPage}
          />
          {listTotal === 0 && !search.trim() && shippingChip === "all" ? (
            <EmptyState
              message="No active orders to ship."
              primaryAction={{
                label: "Go to Sales",
                onClick: () => router.push("/orders"),
              }}
            />
          ) : null}
        </div>

        {/* Shipping panel */}
        <ShippingPanel
          key={selectedOrderId ?? "none"}
          orderId={selectedOrderId}
          onOrderUpdated={updateOrderInList}
          onError={(title, message, err) => setApiError(title, message, err)}
          onSuccess={(title, message) =>
            setError({ title, message, actions: [] })
          }
        />
      </div>
    </section>
  );
}

export default function ShippingPage() {
  return (
    <Suspense
      fallback={
        <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 text-sm text-[var(--ui-muted)]">
          Loading shipping...
        </section>
      }
    >
      <ShippingPageInner />
    </Suspense>
  );
}
