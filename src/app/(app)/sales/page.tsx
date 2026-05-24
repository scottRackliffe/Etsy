"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import type { ApiErrorShape, Order } from "@/types";

export default function SalesPage() {
  const {
    orders, setOrders, selectedOrderId, setSelectedOrderId,
    selectedShopId, busyAction, setBusyAction, setApiError, setError,
  } = useApp();

  const [newOrderNumber, setNewOrderNumber] = useState("");
  const [newOrderTotal, setNewOrderTotal] = useState("");

  const selectedOrder = orders.find((row) => row.id === selectedOrderId) ?? null;

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
          payment_status: "pending",
          order_status: "open",
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

  const markSelectedOrderShipped = async () => {
    if (!selectedOrderId) return;
    setBusyAction("mark-shipped");
    try {
      const response = await fetch(`/api/orders/${selectedOrderId}/mark-shipped`, {
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
      setApiError("Could not mark order shipped", "We could not mark the order as shipped.", err);
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
          <p className="mb-2 text-sm font-semibold">Local orders</p>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-[var(--ui-muted)]">
                  <th className="py-1">Order</th>
                  <th className="py-1">Date</th>
                  <th className="py-1">Total</th>
                  <th className="py-1">Payment</th>
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
                    <td className="py-1">{order.payment_status ?? "unknown"}</td>
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
            onClick={markSelectedOrderShipped}
            disabled={busyAction != null || !selectedOrder}
            className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60"
          >
            {busyAction === "mark-shipped" ? "Updating..." : "Mark selected shipped"}
          </button>
          {selectedOrder && (
            <p className="text-xs text-[var(--ui-muted)]">
              Selected: {selectedOrder.order_number ?? selectedOrder.id} | Payment:{" "}
              {selectedOrder.payment_status ?? "unknown"} | Status:{" "}
              {selectedOrder.order_status ?? "unknown"}
            </p>
          )}
        </div>
      </div>
      {orders.length === 0 && (
        <p className="mt-3 text-sm text-[var(--ui-muted)]">
          No local orders yet. Create one or sync Etsy receipts.
        </p>
      )}
    </section>
  );
}
