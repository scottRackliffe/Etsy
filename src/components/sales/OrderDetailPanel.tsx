"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import type { ApiErrorShape, Customer, InventoryItem, Order, OrderItem } from "@/types";

const SHIPPERS = ["USPS", "UPS", "FedEx", "DHL", "Other"] as const;

type OrderDetailPanelProps = {
  orderId: number | null;
  customers: Customer[];
  inventory: InventoryItem[];
  busy: boolean;
  onOrderUpdated: (order: Order) => void;
  onError: (title: string, message: string, err?: unknown) => void;
  onMarkPaid: () => void;
  onMarkShipped: () => void;
  onVoid: () => void;
};

type DraftFields = {
  ship_to_first_name: string;
  ship_to_last_name: string;
  ship_to_address_line_1: string;
  ship_to_address_line_2: string;
  ship_to_city: string;
  ship_to_state_province: string;
  ship_to_postal_code: string;
  ship_to_country: string;
  shipping_total: string;
  seller_shipping_cost: string;
  tax_total: string;
  discount_total: string;
  shipper: string;
  shipping_date: string;
  tracking_number: string;
  notes: string;
};

function orderToDraft(order: Order): DraftFields {
  return {
    ship_to_first_name: order.ship_to_first_name ?? "",
    ship_to_last_name: order.ship_to_last_name ?? "",
    ship_to_address_line_1: order.ship_to_address_line_1 ?? "",
    ship_to_address_line_2: order.ship_to_address_line_2 ?? "",
    ship_to_city: order.ship_to_city ?? "",
    ship_to_state_province: order.ship_to_state_province ?? "",
    ship_to_postal_code: order.ship_to_postal_code ?? "",
    ship_to_country: order.ship_to_country ?? "",
    shipping_total: String(order.shipping_total ?? ""),
    seller_shipping_cost: String(order.seller_shipping_cost ?? ""),
    tax_total: String(order.tax_total ?? ""),
    discount_total: String(order.discount_total ?? ""),
    shipper: order.shipper ?? "",
    shipping_date: order.shipping_date ?? "",
    tracking_number: order.tracking_number ?? "",
    notes: order.notes ?? "",
  };
}

function inventoryLabel(inventoryId: number, items: InventoryItem[]): string {
  const item = items.find((row) => row.id === inventoryId);
  if (!item) return `Item #${inventoryId}`;
  return item.item_number ? `${item.item_number}` : item.description?.slice(0, 40) || `Item #${inventoryId}`;
}

function formatMoney(value: number | null | undefined): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value ?? 0);
}

export function OrderDetailPanel({
  orderId,
  customers,
  inventory,
  busy,
  onOrderUpdated,
  onError,
  onMarkPaid,
  onMarkShipped,
  onVoid,
}: OrderDetailPanelProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [draft, setDraft] = useState<DraftFields | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linkCustomerId, setLinkCustomerId] = useState("");

  const loadOrder = useCallback(async (id: number) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/orders/${id}`, { headers: { Accept: "application/json" } });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { order?: Order };
      if (!response.ok) throw data;
      if (data.order) {
        setOrder(data.order);
        setDraft(orderToDraft(data.order));
        setLinkCustomerId(data.order.customer_id ? String(data.order.customer_id) : "");
      }
    } catch (err) {
      onError("Could not load order", "We could not load order details.", err);
      setOrder(null);
      setDraft(null);
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      setDraft(null);
      return;
    }
    void loadOrder(orderId);
  }, [orderId, loadOrder]);

  const saveChanges = async () => {
    if (!orderId || !draft) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ship_to_first_name: draft.ship_to_first_name.trim() || null,
        ship_to_last_name: draft.ship_to_last_name.trim() || null,
        ship_to_address_line_1: draft.ship_to_address_line_1.trim() || null,
        ship_to_address_line_2: draft.ship_to_address_line_2.trim() || null,
        ship_to_city: draft.ship_to_city.trim() || null,
        ship_to_state_province: draft.ship_to_state_province.trim() || null,
        ship_to_postal_code: draft.ship_to_postal_code.trim() || null,
        ship_to_country: draft.ship_to_country.trim() || null,
        shipping_total: draft.shipping_total.trim() ? Number(draft.shipping_total) : null,
        seller_shipping_cost: draft.seller_shipping_cost.trim() ? Number(draft.seller_shipping_cost) : null,
        tax_total: draft.tax_total.trim() ? Number(draft.tax_total) : null,
        discount_total: draft.discount_total.trim() ? Number(draft.discount_total) : null,
        shipper: draft.shipper.trim() || null,
        shipping_date: draft.shipping_date.trim() || null,
        tracking_number: draft.tracking_number.trim() || null,
        notes: draft.notes.trim() || null,
      };
      const response = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { order?: Order };
      if (!response.ok) throw data;
      if (data.order) {
        setOrder(data.order);
        setDraft(orderToDraft(data.order));
        onOrderUpdated(data.order);
      }
    } catch (err) {
      onError("Could not save order", "We could not save order changes.", err);
    } finally {
      setSaving(false);
    }
  };

  const linkCustomer = async () => {
    if (!orderId || !linkCustomerId) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/orders/${orderId}/link-customer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ customer_id: Number(linkCustomerId) }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { order?: Order };
      if (!response.ok) throw data;
      if (data.order) {
        setOrder(data.order);
        setDraft(orderToDraft(data.order));
        onOrderUpdated(data.order);
      }
    } catch (err) {
      onError("Could not link customer", "We could not link the customer to this order.", err);
    } finally {
      setSaving(false);
    }
  };

  if (!orderId) {
    return (
      <div className="flex h-full min-h-[16rem] items-center justify-center rounded-lg border border-dashed border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-6 text-sm text-[var(--ui-muted)]">
        Select an order to view details.
      </div>
    );
  }

  if (loading || !order || !draft) {
    return (
      <div className="min-h-[16rem] animate-pulse rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
        <div className="mb-3 h-6 w-1/2 rounded bg-[var(--ui-list-light)]" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 rounded bg-[var(--ui-list-light)]" />
          ))}
        </div>
      </div>
    );
  }

  const customer = customers.find((c) => c.id === order.customer_id);
  const customerName = customer
    ? [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.email
    : null;
  const lineItems = (order.items ?? []) as OrderItem[];
  const isPaid = Number(order.was_paid) === 1;
  const isShipped = Boolean(order.shipping_date);
  const isVoid = order.order_status === "void";

  const field = (key: keyof DraftFields, label: string, type = "text") => (
    <label className="block text-xs text-[var(--ui-muted)]">
      {label}
      <input
        type={type}
        value={draft[key]}
        onChange={(e) => setDraft((current) => (current ? { ...current, [key]: e.target.value } : current))}
        disabled={busy || saving || isVoid}
        className="mt-0.5 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm text-[var(--ui-body)] disabled:opacity-60"
      />
    </label>
  );

  return (
    <div className="max-h-[calc(100vh-12rem)] overflow-y-auto rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-xl font-semibold text-[var(--ui-title)]">
            {order.order_number ?? `Order ${order.id}`}
          </h4>
          <p className="mt-1 text-sm text-[var(--ui-muted)]">
            {order.order_date ?? "No date"} ·{" "}
            <Badge
              label={order.source_channel === "etsy" ? "Etsy" : "Manual"}
              variant={order.source_channel === "etsy" ? "info" : "neutral"}
            />
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge label={isPaid ? "Paid" : "Unpaid"} variant={isPaid ? "success" : "warning"} />
          <Badge label={isShipped ? "Shipped" : "Not shipped"} variant={isShipped ? "success" : "neutral"} />
          <Badge
            label={order.order_status ?? "active"}
            variant={isVoid ? "error" : "neutral"}
          />
        </div>
      </div>

      {customerName && order.customer_id ? (
        <p className="mb-3 text-sm">
          Customer:{" "}
          <Link href={`/customers?customerId=${order.customer_id}`} className="text-[var(--ui-accent)] hover:underline">
            {customerName}
          </Link>
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="flex-1 text-xs text-[var(--ui-muted)]">
          Link customer
          <select
            value={linkCustomerId}
            onChange={(e) => setLinkCustomerId(e.target.value)}
            disabled={busy || saving || isVoid}
            className="mt-0.5 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
          >
            <option value="">Select customer…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || `Customer ${c.id}`}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void linkCustomer()}
          disabled={busy || saving || !linkCustomerId || isVoid}
          className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60"
        >
          Link
        </button>
      </div>

      <section className="mb-4">
        <h5 className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Line items</h5>
        {lineItems.length === 0 ? (
          <p className="text-xs text-[var(--ui-muted)]">No line items on this order.</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[var(--ui-muted)]">
                <th className="py-1">Item</th>
                <th className="py-1">Qty</th>
                <th className="py-1">Unit</th>
                <th className="py-1">Total</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((line) => (
                <tr key={line.id} className="border-t border-[var(--ui-border)]/60">
                  <td className="py-1 pr-2">{inventoryLabel(line.inventory_id, inventory)}</td>
                  <td className="py-1 pr-2">{line.quantity}</td>
                  <td className="py-1 pr-2">{formatMoney(line.unit_price)}</td>
                  <td className="py-1">{formatMoney(line.line_total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--ui-border)] font-medium">
                <td colSpan={3} className="py-1 text-[var(--ui-muted)]">
                  Subtotal
                </td>
                <td className="py-1">{formatMoney(order.subtotal)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      <section className="mb-4">
        <h5 className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Ship to</h5>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {field("ship_to_first_name", "First name")}
          {field("ship_to_last_name", "Last name")}
          <div className="sm:col-span-2">{field("ship_to_address_line_1", "Address line 1")}</div>
          <div className="sm:col-span-2">{field("ship_to_address_line_2", "Address line 2")}</div>
          {field("ship_to_city", "City")}
          {field("ship_to_state_province", "State / Province")}
          {field("ship_to_postal_code", "Postal code")}
          {field("ship_to_country", "Country")}
        </div>
      </section>

      <section className="mb-4">
        <h5 className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Financials</h5>
        <div className="grid grid-cols-2 gap-2">
          <p className="text-xs text-[var(--ui-muted)]">
            Subtotal <span className="block text-sm text-[var(--ui-body)]">{formatMoney(order.subtotal)}</span>
          </p>
          <p className="text-xs text-[var(--ui-muted)]">
            Grand total{" "}
            <span className="block text-sm font-semibold text-[var(--ui-title)]">{formatMoney(order.grand_total)}</span>
          </p>
          {field("shipping_total", "Shipping (buyer pays")}
          {field("seller_shipping_cost", "Shipping cost (seller)")}
          {field("tax_total", "Tax")}
          {field("discount_total", "Discount")}
        </div>
      </section>

      <section className="mb-4">
        <h5 className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Shipping</h5>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="text-xs text-[var(--ui-muted)]">
            Carrier
            <select
              value={draft.shipper}
              onChange={(e) => setDraft((c) => (c ? { ...c, shipper: e.target.value } : c))}
              disabled={busy || saving || isVoid}
              className="mt-0.5 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
            >
              <option value="">—</option>
              {SHIPPERS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          {field("shipping_date", "Ship date", "date")}
          <div className="sm:col-span-2">{field("tracking_number", "Tracking number")}</div>
        </div>
      </section>

      <section className="mb-4">
        <h5 className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Notes</h5>
        <textarea
          value={draft.notes}
          onChange={(e) => setDraft((c) => (c ? { ...c, notes: e.target.value } : c))}
          disabled={busy || saving || isVoid}
          rows={3}
          className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm disabled:opacity-60"
        />
      </section>

      {order.etsy_receipt_id ? (
        <p className="mb-3 text-xs text-[var(--ui-muted)]">Etsy receipt {order.etsy_receipt_id} · Synced from Etsy</p>
      ) : null}

      <div className="flex flex-wrap gap-2 border-t border-[var(--ui-border)] pt-4">
        <button
          type="button"
          onClick={() => void saveChanges()}
          disabled={busy || saving || isVoid}
          className="rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {!isPaid && !isVoid ? (
          <button type="button" onClick={onMarkPaid} disabled={busy || saving} className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60">
            Mark paid
          </button>
        ) : null}
        {!isShipped && !isVoid ? (
          <button type="button" onClick={onMarkShipped} disabled={busy || saving} className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60">
            Mark shipped…
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => window.open(`/api/reports/invoice/${order.id}?format=pdf`, "_blank")}
          className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm"
        >
          Print invoice
        </button>
        <button
          type="button"
          onClick={() => window.open(`/api/reports/thank-you-note/${order.id}?format=pdf`, "_blank")}
          className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm"
        >
          Thank-you note
        </button>
        {!isVoid ? (
          <button type="button" onClick={onVoid} disabled={busy || saving} className="rounded-lg border border-[var(--ui-red)]/40 px-3 py-2 text-sm text-[var(--ui-red)] disabled:opacity-60">
            Void order
          </button>
        ) : null}
      </div>
    </div>
  );
}
