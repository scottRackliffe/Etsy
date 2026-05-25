"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { BatchActionsBar } from "@/components/ui/BatchActionsBar";
import { Button } from "@/components/ui/Button";
import { DataTable, type SortState } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import { Modal } from "@/components/ui/Modal";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { ProgressModal } from "@/components/ui/ProgressModal";
import { OrderDetailPanel } from "@/components/sales/OrderDetailPanel";
import { useBatchOperation } from "@/hooks/useBatchOperation";
import { useBatchSelection } from "@/hooks/useBatchSelection";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useListSearchFromUrl } from "@/hooks/useListSearchFromUrl";
import { usePagination } from "@/hooks/usePagination";
import { useEtsySync } from "@/hooks/useEtsySync";
import { addNotificationEntry } from "@/lib/notifications";
import { addOrdersToPrintQueue, type PrintQueueDocType } from "@/lib/print-queue";
import type { ApiErrorShape, Order, PaginationInfo } from "@/types";

const SHIPPERS = ["USPS", "UPS", "FedEx", "DHL", "Other"] as const;

function SalesPageInner() {
  const {
    orders,
    setOrders,
    selectedOrderId,
    setSelectedOrderId,
    selectedShopId,
    customers,
    inventory,
    busyAction,
    setBusyAction,
    setApiError,
    setError,
    shops,
  } = useApp();

  const router = useRouter();
  const pathname = usePathname();
  const createOrderRef = useRef<HTMLInputElement>(null);
  const [scrollToOrderId, setScrollToOrderId] = useState<number | null>(null);

  const [newOrderNumber, setNewOrderNumber] = useState("");
  const [newOrderTotal, setNewOrderTotal] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const debouncedOrderSearch = useDebouncedValue(orderSearch, 300);
  useListSearchFromUrl(setOrderSearch, () => setPage(0));
  const { page, pageSize, offset, total: listTotal, setPage, setTotal } = usePagination(25);
  const [paymentFilter, setPaymentFilter] = useState<string | null>(null);
  const [shippingFilter, setShippingFilter] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>({ key: "order_date", dir: "desc" });
  const batch = useBatchSelection(orders, listTotal);
  const { runBatch, busy: batchBusy, progressOpen, progressTitle, progressTotal } = useBatchOperation();
  const { modal: syncModal, runSync } = useEtsySync();
  const [printQueueOpen, setPrintQueueOpen] = useState(false);
  const [printQueueType, setPrintQueueType] = useState<PrintQueueDocType>("invoice");
  const [shipModalOpen, setShipModalOpen] = useState(false);
  const [shipModalMode, setShipModalMode] = useState<"single" | "batch">("single");
  const [voidConfirmOpen, setVoidConfirmOpen] = useState(false);
  const [batchVoidConfirmOpen, setBatchVoidConfirmOpen] = useState(false);
  const [detailRefresh, setDetailRefresh] = useState(0);
  const [orderDetailDirty, setOrderDetailDirty] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState<number | null>(null);
  const [discardOrderDirtyOpen, setDiscardOrderDirtyOpen] = useState(false);
  const { setFormDirty } = useUnsavedChanges();
  const [shipForm, setShipForm] = useState({
    shipper: "USPS",
    tracking_number: "",
    shipping_date: new Date().toISOString().slice(0, 10),
    ship_anyway: false,
  });

  useEffect(() => {
    setFormDirty(orderDetailDirty);
  }, [orderDetailDirty, setFormDirty]);

  const selectOrder = (id: number) => {
    if (orderDetailDirty && id !== selectedOrderId) {
      setPendingOrderId(id);
      setDiscardOrderDirtyOpen(true);
      return;
    }
    setSelectedOrderId(id);
  };

  const selectedOrder = orders.find((row) => row.id === selectedOrderId) ?? null;

  const orderBatchFilter = useMemo(
    () => ({
      search: debouncedOrderSearch.trim() || undefined,
      payment_status: paymentFilter ?? undefined,
      shipping_status: shippingFilter ?? undefined,
      source_channel: sourceFilter ?? undefined,
    }),
    [debouncedOrderSearch, paymentFilter, shippingFilter, sourceFilter]
  );

  const buildOrderBatchBody = useCallback(
    (action: string, params?: Record<string, unknown>) =>
      batch.selectAllMatching
        ? { action, filter: orderBatchFilter, params }
        : { action, ids: batch.selectedIdList, params },
    [batch.selectAllMatching, batch.selectedIdList, orderBatchFilter]
  );

  const applyBatchFeedback = useCallback(
    (feedback: { title: string; message: string; variant: string }) => {
      setError({ title: feedback.title, message: feedback.message, actions: [] });
    },
    [setError]
  );

  const orderColumns = useMemo(
    () => [
      {
        key: "order_number",
        header: "Order",
        sortable: true,
        render: (order: Order) => order.order_number ?? `Order ${order.id}`,
      },
      { key: "order_date", header: "Date", sortable: true },
      { key: "grand_total", header: "Total", sortable: true },
      { key: "payment_status", header: "Payment", sortable: true },
      {
        key: "shipped",
        header: "Shipped",
        render: (order: Order) => (order.shipping_date ? "Yes" : "No"),
      },
    ],
    []
  );

  const reloadOrders = useCallback(
    async (search?: string) => {
      const q = search ?? debouncedOrderSearch;
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
      });
      if (q.trim()) params.set("search", q.trim());
      if (paymentFilter) params.set("payment_status", paymentFilter);
      if (shippingFilter) params.set("shipping_status", shippingFilter);
      if (sourceFilter) params.set("source_channel", sourceFilter);
      if (sort) {
        params.set("sort_by", sort.key);
        params.set("sort_dir", sort.dir);
      }
      const response = await fetch(`/api/orders?${params}`, { headers: { Accept: "application/json" } });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
        items?: Order[];
        pagination?: PaginationInfo;
      };
      if (!response.ok) throw data;
      if (data.items) setOrders(data.items);
      if (data.pagination) setTotal(data.pagination.total);
    },
    [
      debouncedOrderSearch,
      pageSize,
      offset,
      paymentFilter,
      shippingFilter,
      sourceFilter,
      sort,
      setOrders,
      setTotal,
    ]
  );

  useEffect(() => {
    void reloadOrders().catch((err) =>
      setApiError("Could not load orders", "We could not load orders.", err)
    );
  }, [reloadOrders, setApiError]);

  const searchParams = useSearchParams();

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
        const response = await fetch(`/api/orders/${id}`, { headers: { Accept: "application/json" } });
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { order?: Order };
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
          current.some((row) => row.id === id) ? current : [data.order as Order, ...current]
        );
        setSelectedOrderId(id);
        setScrollToOrderId(id);
        router.replace(pathname);
      } catch (err) {
        setApiError("Could not open order", "We could not load the linked order.", err);
      }
    };

    void applyDeepLink();
  }, [searchParams, orders, setSelectedOrderId, setOrders, router, pathname, setError, setApiError]);

  const updateOrderInList = (order: Order) => {
    setOrders((current) => current.map((row) => (row.id === order.id ? order : row)));
    setDetailRefresh((n) => n + 1);
  };

  const syncEtsyOrders = () => {
    if (!selectedShopId) return;
    setBusyAction("sync-etsy");
    void runSync(selectedShopId, {
      onSuccess: async () => {
        await reloadOrders();
        setError({
          title: "Etsy sync complete",
          message: "Latest Etsy receipts were synchronized.",
          actions: ["Open Dashboard or Sales to review synced orders."],
        });
      },
      onError: (err) => {
        setApiError("Could not sync Etsy orders", "We could not sync Etsy receipts.", err);
      },
    }).finally(() => setBusyAction(null));
  };

  const createOrderRecord = async () => {
    if (!newOrderNumber.trim()) {
      setError({
        title: "Order number required",
        message: "Provide an order number before creating an order.",
        actions: ["Enter an order number and try again."],
      });
      return;
    }
    setBusyAction("create-order");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          order_number: newOrderNumber.trim(),
          grand_total: Number(newOrderTotal || "0"),
          payment_status: "unpaid",
          order_status: "active",
          source_channel: "manual",
          order_date: new Date().toISOString().slice(0, 10),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { order?: Order };
      if (!response.ok) throw data;
      if (data.order) {
        setOrders((current) => [data.order!, ...current.filter((row) => row.id !== data.order!.id)]);
        setSelectedOrderId(data.order.id);
      }
      setNewOrderNumber("");
      setNewOrderTotal("");
      setError(null);
    } catch (err) {
      setApiError("Could not create order", "We could not create the order.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const markSelectedOrderPaid = async () => {
    if (!selectedOrderId) return;
    setBusyAction("mark-paid");
    try {
      const response = await fetch(`/api/orders/${selectedOrderId}/mark-paid`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { order?: Order };
      if (!response.ok) throw data;
      if (data.order) updateOrderInList(data.order);
      setError(null);
    } catch (err) {
      setApiError("Could not mark order paid", "We could not mark the order as paid.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const openShipModal = (mode: "single" | "batch") => {
    if (mode === "single" && !selectedOrder) return;
    if (mode === "batch" && batch.selectionCount === 0) return;
    setShipModalMode(mode);
    setShipForm({
      shipper: selectedOrder?.shipper ?? "USPS",
      tracking_number: "",
      shipping_date: new Date().toISOString().slice(0, 10),
      ship_anyway: false,
    });
    setShipModalOpen(true);
  };

  const submitMarkShipped = async () => {
    if (shipModalMode === "single") {
      if (!selectedOrderId || !selectedOrder) return;
      const unpaid = Number(selectedOrder.was_paid) !== 1;
      if (unpaid && !shipForm.ship_anyway) {
        setApiError("Order not paid", "Mark paid first or check Ship anyway.", { ok: false });
        return;
      }
      setBusyAction("mark-shipped");
      try {
        const response = await fetch(`/api/orders/${selectedOrderId}/mark-shipped`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            shipper: shipForm.shipper,
            tracking_number: shipForm.tracking_number.trim() || undefined,
            shipping_date: shipForm.shipping_date || undefined,
            shipped_without_paid_override: unpaid && shipForm.ship_anyway,
          }),
        });
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { order?: Order };
        if (!response.ok) throw data;
        if (data.order) updateOrderInList(data.order);
        setShipModalOpen(false);
        setError(null);
      } catch (err) {
        setApiError("Could not mark order shipped", "We could not mark the order as shipped.", err);
      } finally {
        setBusyAction(null);
      }
      return;
    }

    setBusyAction("batch-ship");
    try {
      const unpaidCount = batch.selectAllMatching
        ? orders.filter((o) => Number(o.was_paid) !== 1).length
        : orders.filter((o) => batch.selectedIds.has(o.id) && Number(o.was_paid) !== 1).length;
      const { ok, feedback } = await runBatch(
        "/api/orders/batch",
        buildOrderBatchBody("mark_shipped", {
          shipper: shipForm.shipper,
          shipping_date: shipForm.shipping_date,
          tracking_number: shipForm.tracking_number.trim() || undefined,
          shipped_without_paid_override: unpaidCount > 0 && shipForm.ship_anyway,
        }),
        { entity: "order", actionPast: "marked shipped", count: batch.selectionCount }
      );
      if (!ok) throw new Error(feedback.message);
      await reloadOrders();
      setDetailRefresh((n) => n + 1);
      setShipModalOpen(false);
      batch.clearSelection();
      applyBatchFeedback(feedback);
    } catch (err) {
      setApiError("Batch ship failed", "We could not mark selected orders as shipped.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const voidSelectedOrder = async () => {
    if (!selectedOrderId) return;
    setBusyAction("void-order");
    try {
      const response = await fetch(`/api/orders/${selectedOrderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ order_status: "void" }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { order?: Order };
      if (!response.ok) throw data;
      if (data.order) updateOrderInList(data.order);
      setVoidConfirmOpen(false);
      setError(null);
    } catch (err) {
      setApiError("Could not void order", "We could not void the order.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const batchMarkPaid = async () => {
    if (batch.selectionCount === 0) return;
    setBusyAction("batch-paid");
    try {
      const { ok, feedback } = await runBatch(
        "/api/orders/batch",
        buildOrderBatchBody("mark_paid"),
        { entity: "order", actionPast: "marked paid", count: batch.selectionCount }
      );
      if (!ok) throw new Error(feedback.message);
      await reloadOrders();
      setDetailRefresh((n) => n + 1);
      batch.clearSelection();
      applyBatchFeedback(feedback);
    } catch (err) {
      setApiError("Batch mark paid failed", "We could not mark selected orders as paid.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const batchVoid = async () => {
    if (batch.selectionCount === 0) return;
    setBusyAction("batch-void");
    try {
      const { ok, feedback } = await runBatch(
        "/api/orders/batch",
        buildOrderBatchBody("void"),
        { entity: "order", actionPast: "voided", count: batch.selectionCount }
      );
      if (!ok) throw new Error(feedback.message);
      await reloadOrders();
      setDetailRefresh((n) => n + 1);
      setBatchVoidConfirmOpen(false);
      batch.clearSelection();
      applyBatchFeedback(feedback);
    } catch (err) {
      setApiError("Batch void failed", "We could not void selected orders.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const addSelectedToPrintQueue = () => {
    const targets = batch.selectAllMatching
      ? orders
      : orders.filter((o) => batch.selectedIds.has(o.id));
    const { added, duplicate, full } = addOrdersToPrintQueue(targets, printQueueType);
    if (full) {
      addNotificationEntry({
        type: "error",
        message: "Print queue is full (50 max). Print or clear some items first.",
      });
    } else {
      addNotificationEntry({
        type: "success",
        message: `Added ${added} document(s) to print queue${duplicate > 0 ? ` (${duplicate} already queued)` : ""}.`,
      });
    }
    setPrintQueueOpen(false);
    batch.clearSelection();
  };

  const batchUnpaidCount = batch.selectAllMatching
    ? orders.filter((o) => Number(o.was_paid) !== 1).length
    : orders.filter((o) => batch.selectedIds.has(o.id) && Number(o.was_paid) !== 1).length;
  const shipModalUnpaid =
    shipModalMode === "single"
      ? selectedOrder && Number(selectedOrder.was_paid) !== 1
      : batchUnpaidCount > 0;

  return (
    <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-[var(--ui-title)]">Sales / Orders</h3>
        <button
          type="button"
          onClick={syncEtsyOrders}
          disabled={busyAction != null || selectedShopId == null}
          className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60"
        >
          {busyAction === "sync-etsy" ? "Syncing..." : "Sync Etsy receipts"}
        </button>
      </div>

      {batch.selectionCount > 0 ? (
        <BatchActionsBar
          selectionLabel={
            batch.selectAllMatching
              ? `All ${batch.selectionCount} matching selected`
              : `${batch.selectionCount} selected`
          }
          onClear={batch.clearSelection}
          selectAllMatching={
            batch.canSelectAllMatching && !batch.selectAllMatching
              ? {
                  total: listTotal,
                  onSelect: batch.selectAllMatchingRows,
                  tooLarge: batch.selectAllMatchingTooLarge,
                }
              : undefined
          }
        >
          <Button variant="secondary" size="sm" busy={busyAction === "batch-paid" || batchBusy} onClick={() => void batchMarkPaid()}>
            Mark paid
          </Button>
          <Button variant="secondary" size="sm" busy={batchBusy} onClick={() => openShipModal("batch")}>
            Mark shipped…
          </Button>
          <Button variant="secondary" size="sm" busy={batchBusy} onClick={() => setPrintQueueOpen(true)}>
            Add to print queue…
          </Button>
          <Button variant="danger" size="sm" busy={busyAction === "batch-void" || batchBusy} onClick={() => setBatchVoidConfirmOpen(true)}>
            Void
          </Button>
        </BatchActionsBar>
      ) : null}

      <div className="mb-3 grid grid-cols-1 gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 md:grid-cols-[1fr_auto_auto]">
        <input
          ref={createOrderRef}
          value={newOrderNumber}
          onChange={(e) => setNewOrderNumber(e.target.value)}
          aria-label="New order number"
          placeholder="New order number"
          className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
        />
        <input
          value={newOrderTotal}
          onChange={(e) => setNewOrderTotal(e.target.value)}
          aria-label="New order total"
          placeholder="Total"
          className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
        />
        <button
          type="button"
          onClick={createOrderRecord}
          disabled={busyAction != null}
          className="rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busyAction === "create-order" ? "Creating..." : "Create order"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">Local orders</p>
            <input
              value={orderSearch}
              onChange={(e) => {
                setPage(0);
                setOrderSearch(e.target.value);
              }}
              aria-label="Search orders"
              placeholder="Search order #, name, city…"
              className="min-w-[10rem] flex-1 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
            />
          </div>
          <div className="mb-3 space-y-2">
            <FilterChipRow
              label="Payment"
              value={paymentFilter}
              onChange={(value) => {
                setPage(0);
                setPaymentFilter(value);
              }}
              options={[
                { value: "paid", label: "Paid" },
                { value: "unpaid", label: "Unpaid" },
              ]}
            />
            <FilterChipRow
              label="Shipping"
              value={shippingFilter}
              onChange={(value) => {
                setPage(0);
                setShippingFilter(value);
              }}
              options={[
                { value: "shipped", label: "Shipped" },
                { value: "not_shipped", label: "Not shipped" },
              ]}
            />
            <FilterChipRow
              label="Source"
              value={sourceFilter}
              onChange={(value) => {
                setPage(0);
                setSourceFilter(value);
              }}
              options={[
                { value: "etsy", label: "Etsy" },
                { value: "manual", label: "Manual" },
              ]}
            />
          </div>
          <DataTable
            columns={orderColumns}
            data={orders}
            selectedId={selectedOrderId}
            selection={{
              selectedIds: batch.selectedIds,
              onToggleRow: batch.toggleRow,
              onToggleAllVisible: batch.toggleAllVisible,
              allVisibleSelected: batch.allVisibleSelected,
              indeterminate: batch.headerIndeterminate,
            }}
            onRowClick={(order) => selectOrder(order.id)}
            sort={sort}
            onSortChange={(next) => {
              setPage(0);
              setSort(next ?? { key: "order_date", dir: "desc" });
            }}
            emptyMessage="No orders on this page."
            scrollToId={scrollToOrderId}
            keyboardNav
          />
          <PaginationBar page={page} pageSize={pageSize} total={listTotal} onPageChange={setPage} />
        </div>

        <OrderDetailPanel
          key={`${selectedOrderId ?? "none"}-${detailRefresh}`}
          orderId={selectedOrderId}
          customers={customers}
          inventory={inventory}
          busy={busyAction != null}
          onOrderUpdated={updateOrderInList}
          onError={(title, message, err) => setApiError(title, message, err)}
          onSuccess={(title, message) => setError({ title, message, actions: [] })}
          onMarkPaid={() => void markSelectedOrderPaid()}
          onMarkShipped={() => openShipModal("single")}
          onVoid={() => setVoidConfirmOpen(true)}
          onDirtyChange={setOrderDetailDirty}
        />
      </div>

      {listTotal === 0 ? (
        <EmptyState
          message={orderSearch.trim() || paymentFilter || shippingFilter || sourceFilter ? "No orders match your filters." : "No orders yet."}
          primaryAction={
            orderSearch.trim() || paymentFilter || shippingFilter || sourceFilter
              ? {
                  label: "Clear filters",
                  onClick: () => {
                    setOrderSearch("");
                    setPaymentFilter(null);
                    setShippingFilter(null);
                    setSourceFilter(null);
                    setPage(0);
                  },
                }
              : shops.length > 0
                ? { label: "Sync from Etsy", onClick: () => void syncEtsyOrders() }
                : { label: "Connect Etsy first", onClick: () => router.push("/config#etsy-connection"), variant: "secondary" }
          }
          secondaryAction={
            orderSearch.trim()
              ? undefined
              : { label: "Create manual order", onClick: () => createOrderRef.current?.focus() }
          }
        />
      ) : null}

      {shipModalOpen && (shipModalMode === "batch" || selectedOrder) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5">
            <h4 className="mb-3 text-lg font-semibold text-[var(--ui-title)]">
              {shipModalMode === "batch" ? `Mark ${batch.selectionCount} orders shipped` : "Mark order shipped"}
            </h4>
            <label className="mb-2 block text-sm">
              Carrier
              <select
                value={shipForm.shipper}
                onChange={(e) => setShipForm((f) => ({ ...f, shipper: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2"
              >
                {SHIPPERS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="mb-2 block text-sm">
              Tracking number
              <input
                value={shipForm.tracking_number}
                onChange={(e) => setShipForm((f) => ({ ...f, tracking_number: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2"
              />
            </label>
            <label className="mb-3 block text-sm">
              Ship date
              <input
                type="date"
                value={shipForm.shipping_date}
                onChange={(e) => setShipForm((f) => ({ ...f, shipping_date: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2"
              />
            </label>
            {shipModalUnpaid ? (
              <label className="mb-4 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={shipForm.ship_anyway}
                  onChange={(e) => setShipForm((f) => ({ ...f, ship_anyway: e.target.checked }))}
                />
                {shipModalMode === "batch"
                  ? `Ship anyway (${batchUnpaidCount} unpaid order(s))`
                  : "Ship anyway (not paid)"}
              </label>
            ) : null}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShipModalOpen(false)} className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitMarkShipped()}
                disabled={busyAction != null}
                className="rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busyAction === "mark-shipped" || busyAction === "batch-ship" ? "Saving…" : "Mark shipped"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={voidConfirmOpen}
        onClose={() => setVoidConfirmOpen(false)}
        onConfirm={() => void voidSelectedOrder()}
        title="Void order?"
        description="This will void the order. Voided orders are excluded from active reports."
        affectedLabel={selectedOrder?.order_number ? `Order ${selectedOrder.order_number}` : undefined}
        confirmLabel="Void order"
        confirmVariant="danger"
        busy={busyAction === "void-order"}
      />
      <ConfirmDialog
        open={batchVoidConfirmOpen}
        onClose={() => setBatchVoidConfirmOpen(false)}
        onConfirm={() => void batchVoid()}
        title={`Void ${batch.selectionCount} orders?`}
        description="Voided orders are excluded from active reports. This cannot be undone."
        confirmLabel="Void orders"
        confirmVariant="danger"
        busy={busyAction === "batch-void"}
      />
      <Modal open={printQueueOpen} onClose={() => setPrintQueueOpen(false)} title="Add to print queue">
        <p className="mb-3 text-sm text-[var(--ui-muted)]">
          Choose a document type for {batch.selectionCount} selected order(s).
        </p>
        <select
          value={printQueueType}
          onChange={(e) => setPrintQueueType(e.target.value as PrintQueueDocType)}
          className="mb-4 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-sm"
        >
          <option value="invoice">Invoice</option>
          <option value="thank-you">Thank-you note</option>
          <option value="label">Shipping label</option>
        </select>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setPrintQueueOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={addSelectedToPrintQueue}>
            Add to queue
          </Button>
        </div>
      </Modal>
      <ProgressModal
        open={progressOpen}
        title={progressTitle}
        statusText={progressTitle}
        mode="determinate"
        current={progressTotal}
        total={progressTotal}
      />
      <ProgressModal {...syncModal} />
      <ConfirmDialog
        open={discardOrderDirtyOpen}
        onClose={() => {
          setDiscardOrderDirtyOpen(false);
          setPendingOrderId(null);
        }}
        onConfirm={() => {
          setDiscardOrderDirtyOpen(false);
          if (pendingOrderId != null) setSelectedOrderId(pendingOrderId);
          setPendingOrderId(null);
          setOrderDetailDirty(false);
        }}
        title="Discard unsaved changes?"
        description="You have unsaved order edits. Switch orders anyway?"
        confirmLabel="Discard changes"
        confirmVariant="danger"
      />
    </section>
  );
}

export default function SalesPage() {
  return (
    <Suspense
      fallback={
        <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 text-sm text-[var(--ui-muted)]">
          Loading sales...
        </section>
      }
    >
      <SalesPageInner />
    </Suspense>
  );
}
