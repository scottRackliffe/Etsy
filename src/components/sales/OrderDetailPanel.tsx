"use client";

import Link from "next/link";
import { RepeatCustomerBadge } from "@/components/customers/RepeatCustomerBadge";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useConnection } from "@/context/ConnectionContext";
import { formatCurrency } from "@/lib/format-currency";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DraftRecoveryBanner } from "@/components/ui/DraftRecoveryBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import { ActivityTimeline } from "@/components/activity/ActivityTimeline";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";
import { pickChangedFields, useUndoRedo } from "@/context/UndoRedoContext";
import { useEntityDraft } from "@/hooks/useEntityDraft";
import { formStatesEqual } from "@/lib/deep-equal-form";
import { MutationQueuedError, MutationQueueFullError } from "@/lib/api-fetch";
import { addNotificationEntry } from "@/lib/notifications";
import { addToPrintQueue, printQueueTypeLabel, type PrintQueueDocType } from "@/lib/print-queue";
import { RateShoppingModal } from "@/components/sales/RateShoppingModal";
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
  onCancel?: () => void;
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
  discount_reason: string;
  shipper: string;
  shipping_date: string;
  tracking_number: string;
  package_weight_oz: string;
  package_length_in: string;
  package_width_in: string;
  package_height_in: string;
  notes: string;
};

function orderToDraft(order: Order, defaults?: PackageDefaults): DraftFields {
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
    discount_reason: (order as Record<string, unknown>).discount_reason as string ?? "",
    shipper: order.shipper ?? "",
    shipping_date: order.shipping_date ?? "",
    tracking_number: order.tracking_number ?? "",
    package_weight_oz: order.package_weight_oz != null ? String(order.package_weight_oz) : (defaults?.weight_oz ?? ""),
    package_length_in: order.package_length_in != null ? String(order.package_length_in) : (defaults?.length_in ?? ""),
    package_width_in: order.package_width_in != null ? String(order.package_width_in) : (defaults?.width_in ?? ""),
    package_height_in: order.package_height_in != null ? String(order.package_height_in) : (defaults?.height_in ?? ""),
    notes: order.notes ?? "",
  };
}

type PackageDefaults = {
  weight_oz: string;
  length_in: string;
  width_in: string;
  height_in: string;
};

function inventoryLabel(inventoryId: number, items: InventoryItem[]): string {
  const item = items.find((row) => row.id === inventoryId);
  if (!item) return `Item #${inventoryId}`;
  return item.item_number
    ? `${item.item_number}`
    : item.description?.slice(0, 40) || `Item #${inventoryId}`;
}

function formatMoney(value: number | null | undefined, currCode = "USD"): string {
  return formatCurrency(value ?? 0, currCode);
}

function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
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
  onCancel,
  onDirtyChange,
}: OrderDetailPanelProps) {
  const { currencyCode } = useApp();
  const { state: connectionState } = useConnection();
  const isOffline = connectionState !== "online";
  const fmtMoney = (v: number | null | undefined) => formatMoney(v, currencyCode);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
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
  const [defaultTaxRate, setDefaultTaxRate] = useState<number | null>(null);
  const [discountReasons, setDiscountReasons] = useState<string[]>([]);
  const [addingNewReason, setAddingNewReason] = useState(false);
  const [newReasonText, setNewReasonText] = useState("");
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [voidLabelConfirm, setVoidLabelConfirm] = useState(false);
  const pkgDefaultsRef = useRef<PackageDefaults>({ weight_oz: "", length_in: "", width_in: "", height_in: "" });
  const router = useRouter();

  const isDirty = useMemo(() => {
    if (!order || !draft) return false;
    return !formStatesEqual(draft, orderToDraft(order, pkgDefaultsRef.current));
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
      setDraft(orderToDraft(order, pkgDefaultsRef.current));
      setRecoveryApplied(false);
    });
  }, [order, registerOnDiscard]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    setRecoveryApplied(false);
  }, [orderId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings/tax.default_rate", {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { value?: string };
        if (!cancelled && data.value) {
          const rate = parseFloat(data.value);
          if (Number.isFinite(rate) && rate > 0) setDefaultTaxRate(rate);
        }
      } catch { /* optional */ }
    })();
    (async () => {
      try {
        const res = await fetch("/api/orders/discount-reasons", {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { reasons: string[] };
        if (!cancelled && data.reasons) setDiscountReasons(data.reasons);
      } catch { /* optional */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const prevSubtotalRef = useRef<number | null>(null);
  useEffect(() => {
    if (!order || !draft || defaultTaxRate == null) return;
    if (order.source_channel === "etsy") return;
    const subtotal = Number(order.subtotal) || 0;
    if (prevSubtotalRef.current !== null && prevSubtotalRef.current !== subtotal && subtotal > 0) {
      const calc = Math.round(subtotal * defaultTaxRate) / 100;
      setDraft((c) => (c ? { ...c, tax_total: calc.toFixed(2) } : c));
    }
    prevSubtotalRef.current = subtotal;
  }, [order?.subtotal, order?.source_channel, defaultTaxRate]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadOrder = useCallback(
    async (id: number) => {
      setLoading(true);
      try {
        const [orderRes, settingsRes] = await Promise.all([
          fetch(`/api/orders/${id}`, { headers: { Accept: "application/json" } }),
          fetch("/api/settings", { headers: { Accept: "application/json" }, credentials: "include" }),
        ]);
        const data = (await orderRes.json().catch(() => ({}))) as ApiErrorShape & { order?: Order };
        if (!orderRes.ok) throw data;

        let defaults = pkgDefaultsRef.current;
        if (settingsRes.ok) {
          const settingsData = (await settingsRes.json().catch(() => ({}))) as { items?: Array<{ key: string; value: string }> };
          if (settingsData.items) {
            const map = new Map(settingsData.items.map((s) => [s.key, s.value]));
            defaults = {
              weight_oz: map.get("easypost.default_weight_oz") || "",
              length_in: map.get("easypost.default_length_in") || "",
              width_in: map.get("easypost.default_width_in") || "",
              height_in: map.get("easypost.default_height_in") || "",
            };
            pkgDefaultsRef.current = defaults;
          }
        }

        if (data.order) {
          setOrder(data.order);
          setDraft(orderToDraft(data.order, defaults));
          setLinkCustomerId(data.order.customer_id ? String(data.order.customer_id) : "");
        }
      } catch (err) {
        onErrorRef.current("Could not load order", "We could not load order details.", err);
        setOrder(null);
        setDraft(null);
      } finally {
        setLoading(false);
      }
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
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
        setDraft(orderToDraft(data.order, pkgDefaultsRef.current));
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
    if (!removeLineTarget || !order) return;
    setLineItemBusy(true);
    try {
      const response = await fetch(`/api/orders/${order.id}/items/${removeLineTarget.id}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { order?: Order };
      if (!response.ok) throw data;
      if (data.order) {
        setOrder(data.order);
        setDraft(orderToDraft(data.order, pkgDefaultsRef.current));
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

  const handleVoidLabel = async () => {
    if (!orderId || !order) return;
    try {
      const res = await fetch(`/api/orders/${orderId}/shipping-refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as ApiErrorShape;
        throw new Error(data.error?.user_message ?? "Could not void the label.");
      }
      onSuccess?.("Label voided", "The shipping label refund has been submitted.");
      void loadOrder(orderId);
    } catch (err) {
      onError("Void label failed", err instanceof Error ? err.message : "Could not void the label.", err);
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
        discount_reason: draft.discount_reason.trim() || null,
        shipper: draft.shipper.trim() || null,
        shipping_date: draft.shipping_date.trim() || null,
        tracking_number: draft.tracking_number.trim() || null,
        package_weight_oz: draft.package_weight_oz.trim() ? Number(draft.package_weight_oz) : null,
        package_length_in: draft.package_length_in.trim() ? Number(draft.package_length_in) : null,
        package_width_in: draft.package_width_in.trim() ? Number(draft.package_width_in) : null,
        package_height_in: draft.package_height_in.trim() ? Number(draft.package_height_in) : null,
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
          setDraft(orderToDraft(updated, pkgDefaultsRef.current));
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
        setDraft(orderToDraft(data.order, pkgDefaultsRef.current));
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

  const field = (key: keyof DraftFields, label: string, type = "text", helpText?: string, required?: boolean) => (
    <FormField label={label} helpText={helpText} required={required}>
      <input
        type={type}
        value={draft[key]}
        onChange={(e) =>
          setDraft((current) => (current ? { ...current, [key]: e.target.value } : current))
        }
        disabled={busy || saving || isVoid}
        className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm text-[var(--ui-body)] disabled:opacity-50"
      />
    </FormField>
  );

  const copyFromCustomerAddress = () => {
    if (!customer) return;
    setDraft((c) =>
      c
        ? {
            ...c,
            ship_to_first_name: customer.first_name ?? "",
            ship_to_last_name: customer.last_name ?? "",
            ship_to_address_line_1: customer.address_1 ?? "",
            ship_to_address_line_2: customer.address_2 ?? "",
            ship_to_city: customer.city ?? "",
            ship_to_state_province: customer.state ?? "",
            ship_to_postal_code: customer.postal_code ?? "",
            ship_to_country: customer.country ?? "",
          }
        : c
    );
  };

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
            <HelpTooltip text="How this order was created: 'etsy' = synced from Etsy, 'manual' = entered by hand." />
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge label={isPaid ? "Paid" : "Unpaid"} variant={isPaid ? "success" : "warning"} />
          <HelpTooltip text="Whether the buyer has paid for this order. Orders must be paid before shipping (unless overridden)." />
          <Badge
            label={isShipped ? "Shipped" : "Not shipped"}
            variant={isShipped ? "success" : "neutral"}
          />
          <Badge label={order.order_status ?? "active"} variant={isVoid ? "error" : "neutral"} />
          <HelpTooltip text="Active = order is in progress or complete. Void = cancelled by seller. Cancelled = cancelled by buyer." />
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
        <div className="flex-1">
        <FormField label="Link customer">
          <select
            value={linkCustomerId}
            onChange={(e) => setLinkCustomerId(e.target.value)}
            disabled={busy || saving || isVoid}
            className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm disabled:opacity-50"
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
        </FormField>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void linkCustomer()}
          disabled={busy || saving || !linkCustomerId || isVoid}
        >
          Link
        </Button>
      </div>

      <section className="mb-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h5 className="text-sm font-semibold text-[var(--ui-title)]">Line items</h5>
          {!isVoid ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAddItemOpen(true)}
              disabled={busy || saving || lineItemBusy}
            >
              + Add item
            </Button>
          ) : null}
        </div>
        {lineItems.length === 0 ? (
          <EmptyState
            message="No line items. Add items from inventory."
            primaryAction={
              !isVoid
                ? { label: "Add item", onClick: () => setAddItemOpen(true) }
                : undefined
            }
          />
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
                  <td className="py-1 pr-2">{fmtMoney(line.unit_price)}</td>
                  <td className="py-1">{fmtMoney(line.line_total)}</td>
                  <td className="py-1">
                    {!isVoid ? (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setRemoveLineTarget(line)}
                        disabled={busy || lineItemBusy}
                      >
                        Remove
                      </Button>
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
                  {fmtMoney(order.subtotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      <p className="mb-2 text-xs text-[var(--ui-muted)]">
        <span className="text-[var(--ui-red)]">*</span> Required field
      </p>

      <section className="mb-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h5 className="text-sm font-semibold text-[var(--ui-title)]">Ship to</h5>
          {customer && !isVoid ? (
            <Button variant="ghost" size="sm" onClick={copyFromCustomerAddress}>
              Copy from customer
            </Button>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {field("ship_to_first_name", "First name", "text", undefined, true)}
          {field("ship_to_last_name", "Last name", "text", undefined, true)}
          <div className="sm:col-span-2">{field("ship_to_address_line_1", "Address line 1", "text", undefined, true)}</div>
          <div className="sm:col-span-2">{field("ship_to_address_line_2", "Address line 2")}</div>
          {field("ship_to_city", "City", "text", undefined, true)}
          {field("ship_to_state_province", "State / Province", "text", undefined, true)}
          {field("ship_to_postal_code", "Postal code", "text", undefined, true)}
          {field("ship_to_country", "Country", "text", undefined, true)}
        </div>
      </section>

      <section className="mb-4">
        <h5 className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Financials</h5>
        <div className="grid grid-cols-2 gap-2">
          <p className="text-xs text-[var(--ui-muted)]">
            Subtotal{" "}
            <span className="block text-sm text-[var(--ui-body)]">
              {fmtMoney(order.subtotal)}
            </span>
          </p>
          <p className="text-xs text-[var(--ui-muted)]">
            Grand total{" "}
            <span className="block text-sm font-semibold text-[var(--ui-title)]">
              {fmtMoney(
                (Number(order.subtotal) || 0) +
                  (Number(draft?.shipping_total) || 0) +
                  (Number(draft?.tax_total) || 0) -
                  (Number(draft?.discount_total) || 0)
              )}
            </span>
          </p>
          {field("shipping_total", "Shipping (buyer pays)", "text", "Amount the buyer paid for shipping.")}
          {field(
            "seller_shipping_cost",
            "Shipping cost (seller)",
            "text",
            "What you paid the carrier to ship this order to the buyer."
          )}
          <div>
            {field("tax_total", "Tax", "text", "Total sales tax collected on this order.")}
            {defaultTaxRate != null && !isVoid && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const subtotal = Number(order.subtotal) || 0;
                  const calc = Math.round(subtotal * defaultTaxRate) / 100;
                  setDraft((c) => (c ? { ...c, tax_total: calc.toFixed(2) } : c));
                }}
                disabled={busy || saving}
                className="mt-0.5"
              >
                Auto-calc ({defaultTaxRate}%)
              </Button>
            )}
          </div>
          {field("discount_total", "Discount", "text", "Discount applied to this order.")}
          <FormField label="Discount Reason" helpText="Why this discount was given.">
            {addingNewReason ? (
              <div className="flex gap-1">
                <input
                  value={newReasonText}
                  onChange={(e) => setNewReasonText(e.target.value)}
                  placeholder="Enter new reason..."
                  className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm text-[var(--ui-title)] focus:border-[var(--ui-accent)] focus:outline-none"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newReasonText.trim()) {
                      const reason = newReasonText.trim();
                      if (!discountReasons.includes(reason)) {
                        setDiscountReasons((prev) => [...prev, reason].sort());
                      }
                      setDraft((c) => (c ? { ...c, discount_reason: reason } : c));
                      setNewReasonText("");
                      setAddingNewReason(false);
                    } else if (e.key === "Escape") {
                      setNewReasonText("");
                      setAddingNewReason(false);
                    }
                  }}
                />
                <Button
                  variant="accent"
                  size="sm"
                  disabled={!newReasonText.trim()}
                  onClick={() => {
                    const reason = newReasonText.trim();
                    if (reason && !discountReasons.includes(reason)) {
                      setDiscountReasons((prev) => [...prev, reason].sort());
                    }
                    if (reason) setDraft((c) => (c ? { ...c, discount_reason: reason } : c));
                    setNewReasonText("");
                    setAddingNewReason(false);
                  }}
                >
                  Add
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setNewReasonText(""); setAddingNewReason(false); }}>
                  Cancel
                </Button>
              </div>
            ) : (
              <select
                value={draft?.discount_reason ?? ""}
                onChange={(e) => {
                  if (e.target.value === "__new__") {
                    setAddingNewReason(true);
                  } else {
                    setDraft((c) => (c ? { ...c, discount_reason: e.target.value } : c));
                  }
                }}
                disabled={busy || saving || isVoid}
                className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm text-[var(--ui-title)] disabled:opacity-50"
              >
                <option value="">— None —</option>
                {discountReasons.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
                <option value="__new__">+ Add new reason...</option>
              </select>
            )}
          </FormField>
        </div>
      </section>

      <section className="mb-4">
        <h5 className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Shipping</h5>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <FormField label="Carrier" helpText="Carrier used to ship this order.">
            <select
              value={draft.shipper}
              onChange={(e) => setDraft((c) => (c ? { ...c, shipper: e.target.value } : c))}
              disabled={busy || saving || isVoid}
              className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm disabled:opacity-50"
            >
              <option value="">—</option>
              {SHIPPERS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </FormField>
          {field("shipping_date", "Ship date", "date")}
          <div className="sm:col-span-2">
            {field(
              "tracking_number",
              "Tracking number",
              "text",
              "The carrier tracking number for this shipment. Customers can use this to track their package."
            )}
          </div>
          {order.shipping_carrier_service ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--ui-muted)]">Service:</span>
              <span className="text-sm text-[var(--ui-body)]">{order.shipping_carrier_service}</span>
            </div>
          ) : null}
          {order.shipping_rate_cents != null && order.shipping_rate_cents > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--ui-muted)]">Postage:</span>
              <span className="text-sm text-[var(--ui-body)]">{fmtMoney(order.shipping_rate_cents / 100)}</span>
            </div>
          ) : null}
          {order.tracking_number ? (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(order.tracking_number ?? "");
                  onSuccess?.("Copied", "Tracking number copied to clipboard.");
                }}
              >
                Copy tracking #
              </Button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="mb-4">
        <h5 className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Package dimensions</h5>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <FormField label="Weight (oz)" helpText="Pre-filled from Config defaults.">
            <input
              id="pkg-weight"
              type="number"
              min="0"
              step="0.1"
              value={draft.package_weight_oz}
              onChange={(e) => setDraft((c) => c ? { ...c, package_weight_oz: e.target.value } : c)}
              disabled={busy || saving || isVoid}
              className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm text-[var(--ui-body)] disabled:opacity-50"
            />
          </FormField>
          <FormField label="Length (in)">
            <input
              id="pkg-length"
              type="number"
              min="0"
              step="0.1"
              value={draft.package_length_in}
              onChange={(e) => setDraft((c) => c ? { ...c, package_length_in: e.target.value } : c)}
              disabled={busy || saving || isVoid}
              className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm text-[var(--ui-body)] disabled:opacity-50"
            />
          </FormField>
          <FormField label="Width (in)">
            <input
              id="pkg-width"
              type="number"
              min="0"
              step="0.1"
              value={draft.package_width_in}
              onChange={(e) => setDraft((c) => c ? { ...c, package_width_in: e.target.value } : c)}
              disabled={busy || saving || isVoid}
              className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm text-[var(--ui-body)] disabled:opacity-50"
            />
          </FormField>
          <FormField label="Height (in)">
            <input
              id="pkg-height"
              type="number"
              min="0"
              step="0.1"
              value={draft.package_height_in}
              onChange={(e) => setDraft((c) => c ? { ...c, package_height_in: e.target.value } : c)}
              disabled={busy || saving || isVoid}
              className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm text-[var(--ui-body)] disabled:opacity-50"
            />
          </FormField>
        </div>
      </section>

      {order.label_url ? (
        <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3 mt-3 mb-4">
          <h4 className="text-xs font-medium uppercase tracking-wide text-[var(--ui-muted)] mb-2">
            Purchased Label
          </h4>
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.open(`/api/orders/${order.id}/shipping-label?format=pdf`, "_blank")}
            >
              Print Label
            </Button>
            <span className="text-sm text-[var(--ui-body)]">
              {order.shipping_carrier_service ?? "Label"}
              {order.shipping_rate_cents ? ` — ${fmtMoney(order.shipping_rate_cents / 100)}` : ""}
            </span>
          </div>
        </div>
      ) : null}

      <section className="mb-4">
        <h5 className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Notes</h5>
        <textarea
          value={draft.notes}
          onChange={(e) => setDraft((c) => (c ? { ...c, notes: e.target.value } : c))}
          disabled={busy || saving || isVoid}
          rows={3}
          spellCheck
          className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm disabled:opacity-50"
        />
      </section>

      {order.etsy_receipt_id ? (
        <p className="mb-3 text-xs text-[var(--ui-muted)]">
          Etsy receipt {order.etsy_receipt_id} · Synced from Etsy
        </p>
      ) : null}

      {order.shipped_without_paid_override ? (
        <p className="mb-3 inline-flex items-center gap-1 text-xs text-[var(--ui-yellow)]">
          <Badge label="Shipped without payment" variant="warning" />
          <HelpTooltip text="This order was shipped before payment was confirmed. An audit record has been created." />
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 border-t border-[var(--ui-border)] pt-4">
        <Button
          variant="accent"
          onClick={() => void saveChanges()}
          disabled={busy || isVoid}
          busy={saving}
          title="Save (⌘S)"
        >
          Save changes
        </Button>
        {!isPaid && !isVoid ? (
          <Button
            variant="accent"
            size="sm"
            onClick={onMarkPaid}
            disabled={busy || saving}
          >
            Mark paid
          </Button>
        ) : null}
        {!isShipped && !isVoid ? (
          <Button
            variant="accent"
            size="sm"
            onClick={onMarkShipped}
            disabled={busy || saving}
          >
            Mark shipped…
          </Button>
        ) : null}
        <Button
          variant="accent"
          size="sm"
          onClick={() => setRateModalOpen(true)}
          disabled={busy || saving || isVoid || !!order.label_url}
        >
          Buy &amp; Print Label
        </Button>
        {order.label_url && !isShipped ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setVoidLabelConfirm(true)}
            disabled={busy || saving}
          >
            Void label
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void printShippingLabel()}
          disabled={busy || saving || isVoid}
        >
          Print address label
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => queueDocument("label")}
          disabled={busy || saving || isVoid}
        >
          Add label to queue
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => window.open(`/api/reports/invoice/${order.id}?format=pdf`, "_blank")}
        >
          Print invoice
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => queueDocument("invoice")}
          disabled={busy || saving || isVoid}
        >
          Add invoice to queue
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            window.open(`/api/reports/thank-you-note/${order.id}?format=pdf`, "_blank")
          }
        >
          Thank-you note
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => queueDocument("thank-you")}
          disabled={busy || saving || isVoid}
        >
          Add thank-you to queue
        </Button>
        {!isVoid ? (
          <Button
            variant="danger"
            size="sm"
            onClick={onVoid}
            disabled={busy || saving || isOffline}
            title={isOffline ? "Unavailable while offline" : undefined}
          >
            Void order
          </Button>
        ) : null}
        {!isVoid && order.order_status !== "cancelled" && onCancel ? (
          <Button
            variant="danger"
            size="sm"
            onClick={onCancel}
            disabled={busy || saving || isOffline}
            title={isOffline ? "Unavailable while offline" : undefined}
          >
            Cancel order
          </Button>
        ) : null}
      </div>

      <div className="mt-4 flex items-center gap-1 text-xs text-[var(--ui-muted)]">
        <span>Created: {formatTimestamp(order.created_at)}</span>
        <span>·</span>
        <span>Updated: {formatTimestamp(order.updated_at)}</span>
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
                <div className="mb-2">
                <FormField label="Inventory item">
                  <select
                    value={selectedInventoryId}
                    onChange={(e) => setSelectedInventoryId(e.target.value)}
                    className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm"
                  >
                    <option value="">Select item…</option>
                    {pickList.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.item_number ?? `#${row.id}`} — {(row.description ?? "").slice(0, 40)}
                      </option>
                    ))}
                  </select>
                </FormField>
                </div>
                <div className="mb-4">
                <FormField label="Quantity">
                  <input
                    type="number"
                    min={1}
                    value={lineItemQty}
                    onChange={(e) => setLineItemQty(e.target.value)}
                    className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm"
                  />
                </FormField>
                </div>
              </>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAddItemOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="accent"
                onClick={() => void addLineItem()}
                disabled={!selectedInventoryId}
                busy={lineItemBusy}
              >
                Add item
              </Button>
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

      <ConfirmDialog
        open={voidLabelConfirm}
        onClose={() => setVoidLabelConfirm(false)}
        onConfirm={() => {
          setVoidLabelConfirm(false);
          void handleVoidLabel();
        }}
        title="Void shipping label?"
        description="The postage will be refunded to your EasyPost wallet. This cannot be undone if the carrier has already scanned the label."
        confirmLabel="Void label"
        confirmVariant="danger"
      />

      <RateShoppingModal
        open={rateModalOpen}
        orderId={orderId}
        order={order}
        onClose={() => setRateModalOpen(false)}
        onLabelPurchased={() => {
          setRateModalOpen(false);
          if (orderId) void loadOrder(orderId);
          onSuccess?.("Label purchased", "Your shipping label is ready to print.");
        }}
        onError={onError}
      />
    </div>
  );
}
