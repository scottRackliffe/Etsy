"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { ApiErrorShape, Order } from "@/types";

const SHIPPERS = ["USPS", "UPS", "FedEx", "DHL", "Other"] as const;

function SalesPageInner() {
  const {
    orders, setOrders, selectedOrderId, setSelectedOrderId,
    selectedShopId, busyAction, setBusyAction, setApiError, setError,
  } = useApp();

  const [newOrderNumber, setNewOrderNumber] = useState("");
  const [newOrderTotal, setNewOrderTotal] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [shipModalOpen, setShipModalOpen] = useState(false);
  const [voidConfirmOpen, setVoidConfirmOpen] = useState(false);
  const [shipForm, setShipForm] = useState({
    shipper: "USPS",
    tracking_number: "",
    shipping_date: new Date().toISOString().slice(0, 10),
    ship_anyway: false,
  });

  const selectedOrder = orders.find((row) => row.id === selectedOrderId) ?? null;


  const reloadOrders = useCallback(async (search?: string) => {
    const q = search ?? orderSearch;
    const params = new URLSearchParams({ limit: "100", offset: "0" });
    if (q.trim()) params.set("search", q.trim());
    const response = await fetch(`/api/orders?${params}`, { headers: { Accept: "application/json" } });
    const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { items?: Order[] };
    if (!response.ok) throw data;
    if (data.items) setOrders(data.items);
  }, [orderSearch, setOrders]);

  const searchParams = useSearchParams();

  useEffect(() => {
    const raw = searchParams.get("orderId");
    if (!raw) return;
    const id = Number(raw);
    if (!Number.isFinite(id)) return;
    if (orders.some((row) => row.id === id)) {
      setSelectedOrderId(id);
    }
  }, [searchParams, orders, setSelectedOrderId]);

  const syncEtsyOrders = async () => {
    if (!selectedShopId) return;
    setBusyAction("sync-etsy");
    try {
      const response = await fetch("/api/sync/etsy", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ shop_id: selectedShopId, limit: 100 }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
      if (!response.ok) throw data;
      await reloadOrders();
      setError({
        title: "Etsy sync complete",
        message: "Latest Etsy receipts were synchronized.",
        actions: ["Open Dashboard or Sales to review synced orders."],
      });
    } catch (err) {
      setApiError("Could not sync Etsy orders", "We could not sync Etsy receipts.", err);
    } finally {
      setBusyAction(null);
    }
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
      if (data.order) {
        setOrders((current) => current.map((row) => (row.id === data.order!.id ? data.order! : row)));
      }
      setError(null);
    } catch (err) {
      setApiError("Could not mark order paid", "We could not mark the order as paid.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const openShipModal = () => {
    if (!selectedOrder) return;
    setShipForm({
      shipper: selectedOrder.shipper ?? "USPS",
      tracking_number: "",
      shipping_date: new Date().toISOString().slice(0, 10),
      ship_anyway: false,
    });
    setShipModalOpen(true);
  };

  const submitMarkShipped = async () => {
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
      if (data.order) {
        setOrders((current) => current.map((row) => (row.id === data.order!.id ? data.order! : row)));
      }
      setShipModalOpen(false);
      setError(null);
    } catch (err) {
      setApiError("Could not mark order shipped", "We could not mark the order as shipped.", err);
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
      if (data.order) {
        setOrders((current) => current.map((row) => (row.id === data.order!.id ? data.order! : row)));
      }
      setVoidConfirmOpen(false);
      setError(null);
    } catch (err) {
      setApiError("Could not void order", "We could not void the order.", err);
    } finally {
      setBusyAction(null);
    }
  };

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
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 lg:col-span-2">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">Local orders</p>
            <input
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void reloadOrders(orderSearch); }}
              aria-label="Search orders"
              placeholder="Search order #, name, city…"
              className="min-w-[12rem] flex-1 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
            />
            <button type="button" onClick={() => void reloadOrders()} disabled={busyAction != null}
              className="rounded-lg border border-[var(--ui-border)] px-3 py-1.5 text-sm disabled:opacity-60">Search</button>
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-[var(--ui-muted)]">
                  <th className="py-1">Order</th>
                  <th className="py-1">Date</th>
                  <th className="py-1">Total</th>
                  <th className="py-1">Payment</th>
                  <th className="py-1">Shipped</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => setSelectedOrderId(order.id)}
                    className={`cursor-pointer border-t border-[var(--ui-border)]/60 ${
                      selectedOrderId === order.id ? "bg-[var(--ui-list-hover)]/60" : ""
                    }`}
                  >
                    <td className="py-1 pr-2">{order.order_number ?? `Order ${order.id}`}</td>
                    <td className="py-1 pr-2">{order.order_date ?? "-"}</td>
                    <td className="py-1 pr-2">{order.grand_total ?? 0}</td>
                    <td className="py-1 pr-2">{order.payment_status ?? "unknown"}</td>
                    <td className="py-1">{order.shipping_date ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="space-y-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
          <p className="text-sm font-semibold">Create order</p>
          <input
            value={newOrderNumber}
            onChange={(e) => setNewOrderNumber(e.target.value)}
            aria-label="New order number"
            placeholder="Order number"
            className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
          />
          <input
            value={newOrderTotal}
            onChange={(e) => setNewOrderTotal(e.target.value)}
            aria-label="New order total"
            placeholder="Total"
            className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
          />
          <button
            type="button"
            onClick={createOrderRecord}
            disabled={busyAction != null}
            className="rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busyAction === "create-order" ? "Creating..." : "Create order"}
          </button>
          <button
            type="button"
            onClick={markSelectedOrderPaid}
            disabled={busyAction != null || !selectedOrder}
            className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60"
          >
            {busyAction === "mark-paid" ? "Updating..." : "Mark selected paid"}
          </button>
          <button
            type="button"
            onClick={openShipModal}
            disabled={busyAction != null || !selectedOrder}
            className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60"
          >
            Mark selected shipped…
          </button>
          {selectedOrderId ? (
            <>
              <button
                type="button"
                onClick={() => window.open(`/api/reports/invoice/${selectedOrderId}?format=pdf`, "_blank")}
                disabled={!selectedOrder}
                className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60"
              >
                Print invoice
              </button>
              <button
                type="button"
                onClick={() => window.open(`/api/reports/thank-you-note/${selectedOrderId}?format=pdf`, "_blank")}
                disabled={!selectedOrder}
                className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60"
              >
                Thank-you note
              </button>
              <button
                type="button"
                onClick={() => setVoidConfirmOpen(true)}
                disabled={busyAction != null || !selectedOrder || selectedOrder.order_status === "void"}
                className="rounded-lg border border-[var(--ui-red)]/40 px-3 py-2 text-sm text-[var(--ui-red)] disabled:opacity-60"
              >
                Void order
              </button>
            </>
          ) : null}
          {selectedOrder && (
            <p className="text-xs text-[var(--ui-muted)]">
              Selected: {selectedOrder.order_number ?? selectedOrder.id} | Payment:{" "}
              {selectedOrder.payment_status ?? "unknown"} | Fulfillment:{" "}
              {selectedOrder.shipping_date ? "Shipped" : "Not shipped"} | Order status:{" "}
              {selectedOrder.order_status ?? "active"}
            </p>
          )}
        </div>
      </div>
      {orders.length === 0 && (
        <p className="mt-3 text-sm text-[var(--ui-muted)]">
          No local orders yet. Create one or sync Etsy receipts.
        </p>
      )}

      {shipModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5">
            <h4 className="mb-3 text-lg font-semibold text-[var(--ui-title)]">Mark order shipped</h4>
            <label className="mb-2 block text-sm">Carrier
              <select value={shipForm.shipper} onChange={(e) => setShipForm((f) => ({ ...f, shipper: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2">
                {SHIPPERS.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
            </label>
            <label className="mb-2 block text-sm">Tracking number
              <input value={shipForm.tracking_number} onChange={(e) => setShipForm((f) => ({ ...f, tracking_number: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2" />
            </label>
            <label className="mb-3 block text-sm">Ship date
              <input type="date" value={shipForm.shipping_date} onChange={(e) => setShipForm((f) => ({ ...f, shipping_date: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2" />
            </label>
            {Number(selectedOrder.was_paid) !== 1 && (
              <label className="mb-4 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={shipForm.ship_anyway}
                  onChange={(e) => setShipForm((f) => ({ ...f, ship_anyway: e.target.checked }))} />
                Ship anyway (not paid)
              </label>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShipModalOpen(false)} className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm">Cancel</button>
              <button type="button" onClick={() => void submitMarkShipped()} disabled={busyAction != null}
                className="rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {busyAction === "mark-shipped" ? "Saving…" : "Mark shipped"}
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
