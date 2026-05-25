"use client";

import Link from "next/link";
import { RepeatCustomerBadge } from "@/components/customers/RepeatCustomerBadge";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DraftRecoveryBanner } from "@/components/ui/DraftRecoveryBanner";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import { ActivityTimeline } from "@/components/activity/ActivityTimeline";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";
import { pickChangedFields, useUndoRedo } from "@/context/UndoRedoContext";
import { useEntityDraft } from "@/hooks/useEntityDraft";
import { formStatesEqual } from "@/lib/deep-equal-form";
import { MutationQueuedError, MutationQueueFullError } from "@/lib/api-fetch";
import { addNotificationEntry } from "@/lib/notifications";
import { addToPrintQueue, printQueueTypeLabel, type PrintQueueDocType } from "@/lib/print-queue";
import type { ApiErrorShape, Customer, InventoryItem, Order, OrderItem } from "@/types";

const SHIPPERS = ["USPS", "UPS", "FedEx", "DHL", "Other"] as const;

type OrderDetailPanelProps = {
  orderId: number | null;
  customers: Customer[];
  inventory: InventoryItem[];
  busy: boolean;
  onOrderUpdated: (order: Order) => void;
  onError: (title: string, message: string, err?: unknown) => void;
  onSuccess?: (title: string, message: string) => void;
  onMarkPaid: () => void;
  onMarkShipped: () => void;
  onVoid: () => void;
  onDirtyChange?: (dirty: boolean) => void;
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
  return item.item_number
    ? `${item.item_number}`
    : item.description?.slice(0, 40) || `Item #${inventoryId}`;
}

function formatMoney(value: number | null | undefined): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(
    value ?? 0
  );
}

export function OrderDetailPanel({
  orderId,
  customers,
  inventory,
  busy,
  onOrderUpdated,
  onError,
  onSuccess,
  onMarkPaid,
  onMarkShipped,
  onVoid,
  onDirtyChange,
}: OrderDetailPanelProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [draft, setDraft] = useState<DraftFields | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linkCustomerId, setLinkCustomerId] = useState("");
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [pickList, setPickList] = useState<
    Array<{ id: number; item_number: string | null; description: string | null }>
  >([]);
  const [pickListLoading, setPickListLoading] = useState(false);
  const [selectedInventoryId, setSelectedInventoryId] = useState("");
  const [lineItemQty, setLineItemQty] = useState("1");
  const [removeLineTarget, setRemoveLineTarget] = useState<OrderItem | null>(null);
  const [lineItemBusy, setLineItemBusy] = useState(false);
  const [labelError, setLabelError] = useState<{
    message: string;
    isShippingInfo?: boolean;
  } | null>(null);
  const [recoveryApplied, setRecoveryApplied] = useState(false);
  const router = useRouter();

  const isDirty = useMemo(() => {
    if (!order || !draft) return false;
    return !formStatesEqual(draft, orderToDraft(order));
  }, [order, draft]);

  const { registerOnDiscard } = useUnsavedChanges();
  const { patchWithUndo } = useUndoRedo();
  const { recovery, recoveryLabel, dismissRecovery, markDraftClean } = useEntityDraft({
    entityType: "order",
    entityId: orderId,
    current: draft,
    entityVersion: order?.updated_at,
    isDirty,
    enabled: Boolean(orderId && order),
  });

  useEffect(() => {
    if (!order) return;
    return registerOnDiscard(() => {
      setDraft(orderToDraft(order));
      setRecoveryApplied(false);
    });
  }, [order, registerOnDiscard]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    setRecoveryApplied(false);
  }, [orderId]);

  const loadOrder = useCallback(
    async (id: number) => {
      setLoading(true);
      try {
        const response = await fetch(`/api/orders/${id}`, {
          headers: { Accept: "application/json" },
        });
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
    },
    [onError]
  );

  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      setDraft(null);
      return;
    }
    void loadOrder(orderId);
  }, [orderId, loadOrder]);

  const loadPickList = useCallback(async () => {
    setPickListLoading(true);
    try {
      const response = await fetch("/api/inventory/pick-list", {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as {
        items?: Array<{ id: number; item_number: string | null; description: string | null }>;
      };
      if (!response.ok) throw data;
      setPickList(data.items ?? []);
    } catch (err) {
      onError("Could not load items", "We could not load inventory for the pick list.", err);
    } finally {
      setPickListLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    if (addItemOpen) void loadPickList();
  }, [addItemOpen, loadPickList]);

  const addLineItem = async () => {
    if (!orderId || !selectedInventoryId) return;
    setLineItemBusy(true);
    try {
      const response = await fetch(`/api/orders/${orderId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          inventory_id: Number(selectedInventoryId),
          quantity: Number(lineItemQty) || 1,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { order?: Order };
      if (!response.ok) throw data;
      if (data.order) {
        setOrder(data.order);
        setDraft(orderToDraft(data.order));
        onOrderUpdated(data.order);
      }
      setAddItemOpen(false);
      setSelectedInventoryId("");
      setLineItemQty("1");
    } catch (err) {
      onError("Could not add line item", "We could not add the item to this order.", err);
    } finally {
      setLineItemBusy(false);
    }
  };

  const removeLineItem = async () => {
    if (!removeLineTarget) return;
    setLineItemBusy(true);
    try {
      const response = await fetch(`/api/order-items/${removeLineTarget.id}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { order?: Order };
      if (!response.ok) throw data;
      if (data.order) {
        setOrder(data.order);
        setDraft(orderToDraft(data.order));
        onOrderUpdated(data.order);
      }
      setRemoveLineTarget(null);
    } catch (err) {
      onError("Could not remove line item", "We could not remove that line item.", err);
    } finally {
      setLineItemBusy(false);
    }
  };

  const queueDocument = (type: PrintQueueDocType) => {
    if (!order) return;
    const orderNumber = order.order_number ?? `Order ${order.id}`;
    const result = addToPrintQueue(type, order.id, orderNumber);
    if (result === "added") {
      addNotificationEntry({
        type: "success",
        message: `Added ${printQueueTypeLabel(type).toLowerCase()} for ${orderNumber} to print queue.`,
      });
    } else if (result === "duplicate") {
      addNotificationEntry({ type: "info", message: "Already in queue." });
    } else {
      addNotificationEntry({
        type: "error",
        message: "Print queue is full (50 max). Print or clear some items first.",
      });
    }
  };

  const printShippingLabel = async () => {
    if (!orderId) return;
    try {
      const response = await fetch(`/api/orders/${orderId}/shipping-label?format=html`, {
        headers: { Accept: "text/html" },
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
        const msg = data.error?.user_message ?? "We could not generate the shipping label.";
        setLabelError({
          message: msg,
          isShippingInfo: msg.toLowerCase().includes("shipping info"),
        });
        return;
      }
      const html = await response.text();
      const win = window.open("", "_blank");
      if (!win) {
        onError("Pop-up blocked", "Allow pop-ups to print the shipping label.");
        return;
      }
      win.document.write(html);
      win.document.close();
    } catch (err) {
      onError("Could not print label", "We could not open the shipping label.", err);
    }
  };

  const saveChanges = async () => {
    if (!orderId || !order || !draft) return;
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
        seller_shipping_cost: draft.seller_shipping_cost.trim()
          ? Number(draft.seller_shipping_cost)
          : null,
        tax_total: draft.tax_total.trim() ? Number(draft.tax_total) : null,
        discount_total: draft.discount_total.trim() ? Number(draft.discount_total) : null,
        shipper: draft.shipper.trim() || null,
        shipping_date: draft.shipping_date.trim() || null,
        tracking_number: draft.tracking_number.trim() || null,
        notes: draft.notes.trim() || null,
      };
      const { previousState, newState } = pickChangedFields(
        order as unknown as Record<string, unknown>,
        payload
      );
      const result = await patchWithUndo({
        action: "Updated order details",
        entity: "orders",
        id: orderId,
        updatedAt: order.updated_at,
        previousState,
        newState,
        pickRecord: (data) => (data.order as Order | undefined) ?? null,
        onPatched: (updated) => {
          setOrder(updated);
          setDraft(orderToDraft(updated));
          onOrderUpdated(updated);
        },
      });
      if (result.status === "stale") {
        await loadOrder(orderId);
        onError(
          "Record changed elsewhere",
          "This order was modified in another tab. We reloaded the latest version — re-apply your changes and save again."
        );
        return;
      }
      if (result.status === "error") {
        throw new Error(result.message);
      }
      markDraftClean();
    } catch (err) {
      if (err instanceof MutationQueuedError) {
        onSuccess?.("Saved locally", err.message);
        return;
      }
      if (err instanceof MutationQueueFullError) {
        onError("Too many pending changes", err.message, err);
        return;
      }
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

  const field = (key: keyof DraftFields, label: string, type = "text", helpText?: string) => (
    <label className="block text-xs text-[var(--ui-muted)]">
      <span className="inline-flex items-center">
        {label}
        {helpText ? <HelpTooltip text={helpText} /> : null}
      </span>
      <input
        type={type}
        value={draft[key]}
        onChange={(e) =>
          setDraft((current) => (current ? { ...current, [key]: e.target.value } : current))
        }
        disabled={busy || saving || isVoid}
        className="mt-0.5 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm text-[var(--ui-body)] disabled:opacity-60"
      />
    </label>
  );

  const showRecovery = recovery && recoveryLabel && !recoveryApplied && !isDirty;

  return (
    <div className="max-h-[calc(100vh-12rem)] overflow-y-auto rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
      {showRecovery ? (
        <DraftRecoveryBanner
          savedAtLabel={recoveryLabel}
          onRestore={() => {
            setDraft(recovery.formState);
            setRecoveryApplied(true);
            dismissRecovery();
          }}
          onDiscard={() => {
            dismissRecovery();
            setRecoveryApplied(true);
          }}
        />
      ) : null}
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
          <Badge
            label={isShipped ? "Shipped" : "Not shipped"}
            variant={isShipped ? "success" : "neutral"}
          />
          <Badge label={order.order_status ?? "active"} variant={isVoid ? "error" : "neutral"} />
        </div>
      </div>

      {customerName && order.customer_id ? (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span>Customer:</span>
          <Link
            href={`/customers?customerId=${order.customer_id}`}
            className="text-[var(--ui-accent)] hover:underline"
          >
            {customerName}
          </Link>
          <RepeatCustomerBadge
            orderCount={customers.find((c) => c.id === order.customer_id)?.order_count}
          />
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
                {[c.first_name, c.last_name].filter(Boolean).join(" ") ||
                  c.email ||
                  `Customer ${c.id}`}
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
        <div className="mb-2 flex items-center justify-between gap-2">
          <h5 className="text-sm font-semibold text-[var(--ui-title)]">Line items</h5>
          {!isVoid ? (
            <button
              type="button"
              onClick={() => setAddItemOpen(true)}
              disabled={busy || saving || lineItemBusy}
              className="rounded-lg border border-[var(--ui-border)] px-2 py-1 text-xs disabled:opacity-60"
            >
              + Add item
            </button>
          ) : null}
        </div>
        {lineItems.length === 0 ? (
          <p className="text-xs text-[var(--ui-muted)]">No line items. Add items from inventory.</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[var(--ui-muted)]">
                <th className="py-1">Item</th>
                <th className="py-1">Qty</th>
                <th className="py-1">Unit</th>
                <th className="py-1">Total</th>
                <th className="py-1 w-16" />
              </tr>
            </thead>
            <tbody>
              {lineItems.map((line) => (
                <tr key={line.id} className="border-t border-[var(--ui-border)]/60">
                  <td className="py-1 pr-2">{inventoryLabel(line.inventory_id, inventory)}</td>
                  <td className="py-1 pr-2">{line.quantity}</td>
                  <td className="py-1 pr-2">{formatMoney(line.unit_price)}</td>
                  <td className="py-1">{formatMoney(line.line_total)}</td>
                  <td className="py-1">
                    {!isVoid ? (
                      <button
                        type="button"
                        onClick={() => setRemoveLineTarget(line)}
                        disabled={busy || lineItemBusy}
                        className="text-[var(--ui-red)] disabled:opacity-60"
                      >
                        Remove
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--ui-border)] font-medium">
                <td colSpan={3} className="py-1 text-[var(--ui-muted)]">
                  Subtotal
                </td>
                <td colSpan={2} className="py-1">
                  {formatMoney(order.subtotal)}
                </td>
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
            Subtotal{" "}
            <span className="block text-sm text-[var(--ui-body)]">
              {formatMoney(order.subtotal)}
            </span>
          </p>
          <p className="text-xs text-[var(--ui-muted)]">
            Grand total{" "}
            <span className="block text-sm font-semibold text-[var(--ui-title)]">
              {formatMoney(order.grand_total)}
            </span>
          </p>
          {field("shipping_total", "Shipping (buyer pays")}
          {field(
            "seller_shipping_cost",
            "Shipping cost (seller)",
            "text",
            "What you paid the carrier to ship this order to the buyer."
          )}
          {field("tax_total", "Tax", "text", "Total sales tax collected on this order.")}
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
          <div className="sm:col-span-2">
            {field(
              "tracking_number",
              "Tracking number",
              "text",
              "The carrier tracking number for this shipment. Customers can use this to track their package."
            )}
          </div>
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
        <p className="mb-3 text-xs text-[var(--ui-muted)]">
          Etsy receipt {order.etsy_receipt_id} · Synced from Etsy
        </p>
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
          <button
            type="button"
            onClick={onMarkPaid}
            disabled={busy || saving}
            className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60"
          >
            Mark paid
          </button>
        ) : null}
        {!isShipped && !isVoid ? (
          <button
            type="button"
            onClick={onMarkShipped}
            disabled={busy || saving}
            className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60"
          >
            Mark shipped…
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void printShippingLabel()}
          disabled={busy || saving || isVoid}
          className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60"
        >
          Print shipping label
        </button>
        <button
          type="button"
          onClick={() => queueDocument("label")}
          disabled={busy || saving || isVoid}
          className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60"
        >
          Add label to queue
        </button>
        <button
          type="button"
          onClick={() => window.open(`/api/reports/invoice/${order.id}?format=pdf`, "_blank")}
          className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm"
        >
          Print invoice
        </button>
        <button
          type="button"
          onClick={() => queueDocument("invoice")}
          disabled={busy || saving || isVoid}
          className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60"
        >
          Add invoice to queue
        </button>
        <button
          type="button"
          onClick={() =>
            window.open(`/api/reports/thank-you-note/${order.id}?format=pdf`, "_blank")
          }
          className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm"
        >
          Thank-you note
        </button>
        <button
          type="button"
          onClick={() => queueDocument("thank-you")}
          disabled={busy || saving || isVoid}
          className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60"
        >
          Add thank-you to queue
        </button>
        {!isVoid ? (
          <button
            type="button"
            onClick={onVoid}
            disabled={busy || saving}
            className="rounded-lg border border-[var(--ui-red)]/40 px-3 py-2 text-sm text-[var(--ui-red)] disabled:opacity-60"
          >
            Void order
          </button>
        ) : null}
      </div>

      <div className="mt-6 border-t border-[var(--ui-border)] pt-4">
        <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
          Recent activity
        </h5>
        <ActivityTimeline entityType="order" entityId={order.id} />
      </div>

      {addItemOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5">
            <h4 className="mb-3 text-lg font-semibold text-[var(--ui-title)]">Add line item</h4>
            {pickListLoading ? (
              <p className="text-sm text-[var(--ui-muted)]">Loading inventory…</p>
            ) : (
              <>
                <label className="mb-2 block text-sm">
                  Inventory item
                  <select
                    value={selectedInventoryId}
                    onChange={(e) => setSelectedInventoryId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-sm"
                  >
                    <option value="">Select item…</option>
                    {pickList.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.item_number ?? `#${row.id}`} — {(row.description ?? "").slice(0, 40)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mb-4 block text-sm">
                  Quantity
                  <input
                    type="number"
                    min={1}
                    value={lineItemQty}
                    onChange={(e) => setLineItemQty(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-sm"
                  />
                </label>
              </>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddItemOpen(false)}
                className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void addLineItem()}
                disabled={lineItemBusy || !selectedInventoryId}
                className="rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {lineItemBusy ? "Adding…" : "Add item"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={labelError != null}
        onClose={() => setLabelError(null)}
        onConfirm={() => {
          setLabelError(null);
          if (labelError?.isShippingInfo) router.push("/config#shipping");
        }}
        title="Cannot print shipping label"
        description={labelError?.message ?? ""}
        confirmLabel={labelError?.isShippingInfo ? "Go to Config" : "OK"}
        confirmVariant={labelError?.isShippingInfo ? "accent" : "danger"}
      />

      <ConfirmDialog
        open={removeLineTarget != null}
        onClose={() => setRemoveLineTarget(null)}
        onConfirm={() => void removeLineItem()}
        title="Remove line item?"
        description={
          lineItems.length <= 1
            ? "This is the last line item on the order. Orders should have at least one line item when marking paid or shipped."
            : "Remove this item from the order?"
        }
        confirmLabel="Remove"
        confirmVariant="danger"
        busy={lineItemBusy}
      />
    </div>
  );
}
