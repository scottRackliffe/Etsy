"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { useConnection } from "@/context/ConnectionContext";
import { useTrackRecentlyViewed } from "@/context/RecentlyViewedContext";
import { useUndoRedo } from "@/context/UndoRedoContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { BatchActionsBar } from "@/components/ui/BatchActionsBar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import { Modal } from "@/components/ui/Modal";
import { ProgressModal } from "@/components/ui/ProgressModal";
import { SemsScreen, type SemsScreenController } from "@/components/sems/SemsScreen";
import { SemsEditor } from "@/components/sems/SemsEditor";
import { useSemsEditorGuard } from "@/components/sems/useSemsEditorGuard";
import { OrderDetailPanel, type OrderDetailPanelHandle } from "@/components/sales/OrderDetailPanel";
import { useDirtyTracking } from "@/hooks/useDirtyTracking";
import { useBatchOperation } from "@/hooks/useBatchOperation";
import { useBatchSelection } from "@/hooks/useBatchSelection";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useListSearchFromUrl } from "@/hooks/useListSearchFromUrl";
import { usePagination } from "@/hooks/usePagination";
import { useEtsySync } from "@/hooks/useEtsySync";
import { useToast } from "@/hooks/useToast";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import { apiFetch } from "@/lib/api-fetch";
import { addNotificationEntry } from "@/lib/notifications";
import { patchHeaders } from "@/lib/patch-json";
import { addOrdersToPrintQueue, type PrintQueueDocType } from "@/lib/print-queue";
import { orderRecentlyViewedLabel } from "@/lib/recently-viewed";
import { FormField } from "@/components/ui/FormField";
import type { InlineEditResult, SortState } from "@/components/ui/DataTable";
import type { ApiErrorShape, Customer, InventoryItem, Order, PaginationInfo } from "@/types";

const SHIPPERS = ["USPS", "UPS", "FedEx", "DHL", "Other"] as const;

// ─────────────────────────────────────────────────────────────
// OrderCreateForm — shown when the user clicks "+ Add new order"
// ─────────────────────────────────────────────────────────────
type OrderCreateFields = {
  orderNumber: string;
  customerId: number | null;
  shipToId: string;
  total: string;
};

const EMPTY_ORDER_CREATE: OrderCreateFields = {
  orderNumber: "",
  customerId: null,
  shipToId: "billing",
  total: "",
};

function OrderCreateForm({
  customers,
  requestClose,
  done,
  onCreated,
  onError,
}: {
  customers: Customer[];
  requestClose: () => void;
  done: () => void;
  onCreated: (order: Order) => void;
  onError: (title: string, message: string, err?: unknown) => void;
}) {
  const { current, setCurrent, savedState, isDirty, markClean } =
    useDirtyTracking<OrderCreateFields>(EMPTY_ORDER_CREATE);
  const form = current ?? EMPTY_ORDER_CREATE;

  const [addresses, setAddresses] = useState<Array<{ id: number; label: string; summary: string }>>([]);
  const [defaultTaxRate, setDefaultTaxRate] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // Auto-fill order number + default tax rate on mount; advance baseline so auto-fill isn't dirty
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/orders/next-number", { headers: { Accept: "application/json" } });
        const data = (await res.json().catch(() => ({}))) as { next_number?: string };
        if (!cancelled && res.ok && data.next_number) {
          setCurrent((prev) => ({ ...(prev ?? EMPTY_ORDER_CREATE), orderNumber: data.next_number! }));
          // Advance baseline so auto-number alone doesn't trigger "dirty"
          markClean({ ...(EMPTY_ORDER_CREATE), orderNumber: data.next_number! });
        }
      } catch { /* non-critical */ }
      try {
        const res = await fetch("/api/settings/tax.default_rate", { headers: { Accept: "application/json" } });
        const data = (await res.json().catch(() => ({}))) as { value?: string };
        if (!cancelled && res.ok && data.value) {
          const rate = parseFloat(data.value);
          if (Number.isFinite(rate) && rate > 0) setDefaultTaxRate(rate);
        }
      } catch { /* non-critical */ }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load ship-to addresses when customer changes
  useEffect(() => {
    if (!form.customerId) { setAddresses([]); setCurrent((prev) => ({ ...(prev ?? EMPTY_ORDER_CREATE), shipToId: "billing" })); return; }
    void (async () => {
      try {
        const res = await fetch(`/api/customers/${form.customerId}/addresses`, { headers: { Accept: "application/json" } });
        const data = (await res.json().catch(() => ({}))) as { items?: Array<{ id: number; label?: string; first_line?: string; city?: string; state?: string; postal_code?: string }> };
        if (res.ok && data.items && data.items.length > 0) {
          setAddresses(data.items.map((a) => ({
            id: a.id,
            label: a.label || `Address ${a.id}`,
            summary: [a.first_line, a.city, a.state, a.postal_code].filter(Boolean).join(", "),
          })));
        } else {
          setAddresses([]);
        }
        setCurrent((prev) => ({ ...(prev ?? EMPTY_ORDER_CREATE), shipToId: "billing" }));
      } catch { setAddresses([]); }
    })();
  }, [form.customerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = useCallback(
    <K extends keyof OrderCreateFields>(key: K, value: OrderCreateFields[K]) =>
      setCurrent((prev) => ({ ...(prev ?? EMPTY_ORDER_CREATE), [key]: value })),
    [setCurrent]
  );

  const discard = useCallback(() => {
    setCurrent(savedState);
    setAddresses([]);
  }, [savedState, setCurrent]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!form.orderNumber.trim()) {
      onError("Order number required", "Provide an order number before creating an order.");
      return false;
    }
    setBusy(true);
    try {
      const subtotal = Number(form.total || "0");
      const taxTotal =
        defaultTaxRate != null && subtotal > 0
          ? Math.round(subtotal * defaultTaxRate) / 100
          : 0;
      const response = await apiFetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          order_number: form.orderNumber.trim(),
          subtotal,
          tax_total: taxTotal,
          grand_total: subtotal + taxTotal,
          payment_status: "unpaid",
          order_status: "active",
          source_channel: "manual",
          order_date: new Date().toISOString().slice(0, 10),
          ...(form.customerId ? { customer_id: form.customerId } : {}),
          ...(form.customerId && form.shipToId !== "billing"
            ? { ship_to_address_id: parseInt(form.shipToId, 10) }
            : {}),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { order?: Order };
      if (!response.ok) throw data;
      if (data.order) {
        markClean(form);
        onCreated(data.order);
        return true;
      }
      return false;
    } catch (err) {
      onError("Could not create order", "We could not create the order.", err);
      return false;
    } finally {
      setBusy(false);
    }
  }, [form, defaultTaxRate, markClean, onCreated, onError]);

  useSemsEditorGuard({ isDirty, onSave: save, onDiscard: discard });

  const handleSaveClick = useCallback(() => {
    void (async () => {
      const ok = await save();
      if (ok) done();
    })();
  }, [save, done]);

  const inputCls =
    "w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm text-[var(--ui-body)]";

  return (
    <SemsEditor
      title="New order"
      isDirty={isDirty}
      busy={busy}
      saveLabel="Create order"
      saveDisabled={!form.orderNumber.trim()}
      onSave={handleSaveClick}
      onCancel={requestClose}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <FormField label="Order number" required>
          <input
            value={form.orderNumber}
            onChange={(e) => set("orderNumber", e.target.value)}
            placeholder="e.g. ORD-0001"
            className={inputCls}
          />
        </FormField>
        <FormField label="Customer">
          <select
            value={form.customerId ?? ""}
            onChange={(e) => set("customerId", e.target.value ? parseInt(e.target.value, 10) : null)}
            className={inputCls}
          >
            <option value="">No customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {[c.first_name, c.last_name].filter(Boolean).join(" ") || `Customer ${c.id}`}
              </option>
            ))}
          </select>
        </FormField>
        {form.customerId && addresses.length > 0 ? (
          <div className="md:col-span-2">
            <FormField label="Ship to">
              <select
                value={form.shipToId}
                onChange={(e) => set("shipToId", e.target.value)}
                className={inputCls}
              >
                <option value="billing">Billing address (default)</option>
                {addresses.map((a) => (
                  <option key={a.id} value={String(a.id)}>{a.summary}</option>
                ))}
              </select>
            </FormField>
          </div>
        ) : null}
        <FormField label="Total (optional)" helpText="You can add line items after creation.">
          <input
            value={form.total}
            onChange={(e) => set("total", e.target.value)}
            placeholder="0.00"
            type="number"
            step="0.01"
            min="0"
            className={inputCls}
          />
        </FormField>
      </div>
      {defaultTaxRate != null && Number(form.total) > 0 ? (
        <p className="mt-2 text-xs text-[var(--ui-muted)]">
          Tax ({defaultTaxRate}%) will be auto-calculated:{" "}
          {(Math.round(Number(form.total) * defaultTaxRate) / 100).toFixed(2)}
        </p>
      ) : null}
    </SemsEditor>
  );
}

// ─────────────────────────────────────────────────────────────
// OrderEditorShell — SEMS editor body for an existing order
// ─────────────────────────────────────────────────────────────
function OrderEditorShell({
  record: recordProp,
  requestClose,
  refreshTrigger,
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
}: {
  record: Order;
  requestClose: () => void;
  refreshTrigger: number;
  customers: Customer[];
  inventory: InventoryItem[];
  busy: boolean;
  onOrderUpdated: (order: Order) => void;
  onError: (title: string, message: string, err?: unknown) => void;
  onSuccess?: (title: string, message: string) => void;
  onMarkPaid: () => void;
  onMarkShipped: () => void;
  onVoid: () => void;
  onCancel: () => void;
}) {
  const panelRef = useRef<OrderDetailPanelHandle>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Local copy of record so badges (Paid/Void/source) update after mark-paid, void,
  // or any sub-action that calls onOrderUpdated — without requiring a SemsScreen
  // scaffold change (SemsScreen's `editing` prop only resets on openRecord).
  const [record, setRecord] = useState(recordProp);
  useEffect(() => {
    // Full reset when a different order is opened.
    setRecord(recordProp);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordProp.id]);

  // When the parent bumps refreshTrigger (mark-paid, void, batch ops, sub-action
  // onOrderUpdated), reload panel data in merge mode to preserve unsaved draft edits.
  const prevTriggerRef = useRef(refreshTrigger);
  useEffect(() => {
    if (refreshTrigger !== prevTriggerRef.current) {
      prevTriggerRef.current = refreshTrigger;
      panelRef.current?.reload();
    }
  }, [refreshTrigger]);

  useSemsEditorGuard({
    isDirty,
    onSave: useCallback(async () => panelRef.current?.save() ?? false, []),
    onDiscard: useCallback(() => panelRef.current?.discard(), []),
  });

  const handleSave = useCallback(async () => {
    await panelRef.current?.save();
  }, []);

  // Intercept onOrderUpdated so the local record (badges) stays fresh whenever
  // the panel commits a sub-action (mark paid, add/remove line item, etc.).
  const handleOrderUpdated = useCallback((order: Order) => {
    setRecord(order);
    onOrderUpdated(order);
  }, [onOrderUpdated]);

  const isPaid = Number(record.was_paid) === 1;
  const isVoid = record.order_status === "void";

  return (
    <SemsEditor
      title={record.order_number ?? `Order ${record.id}`}
      badges={
        <div className="flex flex-wrap gap-1">
          <Badge label={isPaid ? "Paid" : "Unpaid"} variant={isPaid ? "success" : "warning"} />
          <Badge
            label={record.order_status ?? "active"}
            variant={isVoid ? "error" : "neutral"}
          />
          <Badge
            label={record.source_channel === "etsy" ? "Etsy" : "Manual"}
            variant={record.source_channel === "etsy" ? "info" : "neutral"}
          />
        </div>
      }
      isDirty={isDirty}
      busy={busy || isSaving}
      onSave={() => void handleSave()}
      onCancel={requestClose}
      saveDisabled={isVoid}
    >
      <OrderDetailPanel
        ref={panelRef}
        orderId={record.id}
        customers={customers}
        inventory={inventory}
        busy={busy}
        onOrderUpdated={handleOrderUpdated}
        onError={onError}
        onSuccess={onSuccess}
        onMarkPaid={onMarkPaid}
        onMarkShipped={onMarkShipped}
        onVoid={onVoid}
        onCancel={onCancel}
        onDirtyChange={setIsDirty}
        onSavingChange={setIsSaving}
      />
    </SemsEditor>
  );
}

// ─────────────────────────────────────────────────────────────
// SalesPageInner — main orders page with SEMS scaffold
// ─────────────────────────────────────────────────────────────
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
    pageSize: configPageSize,
  } = useApp();
  const { state: connectionState } = useConnection();
  const isOffline = connectionState !== "online";

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [orderSearch, setOrderSearch] = useState("");
  const debouncedOrderSearch = useDebouncedValue(orderSearch, 300);
  useListSearchFromUrl(setOrderSearch, () => setPage(0));
  const { page, pageSize, offset, total: listTotal, setPage, setTotal } = usePagination(configPageSize);
  const [statusFilter, setStatusFilter] = useState<string | null>("active");
  const [paymentFilter, setPaymentFilter] = useState<string | null>(null);
  const [shippingFilter, setShippingFilter] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>({ key: "order_date", dir: "desc" });
  const batch = useBatchSelection(orders, listTotal);
  const {
    runBatch,
    busy: batchBusy,
    progressOpen,
    progressTitle,
    progressTotal,
    progressCurrent,
  } = useBatchOperation();
  const { modal: syncModal, runSync } = useEtsySync();
  const toast = useToast();
  const [shipModalOpen, setShipModalOpen] = useState(false);
  const [shipModalMode, setShipModalMode] = useState<"single" | "batch">("single");
  const [voidConfirmOpen, setVoidConfirmOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [batchVoidConfirmOpen, setBatchVoidConfirmOpen] = useState(false);
  const [printQueueOpen, setPrintQueueOpen] = useState(false);
  const [printQueueType, setPrintQueueType] = useState<PrintQueueDocType>("invoice");
  const [editorRefreshTrigger, setEditorRefreshTrigger] = useState(0);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const { patchWithUndo, clearStacks } = useUndoRedo();
  const controllerRef = useRef<SemsScreenController<Order> | null>(null);

  useEffect(() => {
    clearStacks();
  }, [selectedOrderId, clearStacks]);

  const [shipForm, setShipForm] = useState({
    shipper: "USPS",
    tracking_number: "",
    shipping_date: new Date().toISOString().slice(0, 10),
    ship_anyway: false,
  });

  const selectedOrder = orders.find((row) => row.id === selectedOrderId) ?? null;
  useTrackRecentlyViewed(
    "order",
    selectedOrderId,
    selectedOrder ? orderRecentlyViewedLabel(selectedOrder) : null
  );

  const orderBatchFilter = useMemo(
    () => ({
      search: debouncedOrderSearch.trim() || undefined,
      order_status: statusFilter ?? undefined,
      payment_status: paymentFilter ?? undefined,
      shipping_status: shippingFilter ?? undefined,
      source_channel: sourceFilter ?? undefined,
    }),
    [debouncedOrderSearch, statusFilter, paymentFilter, shippingFilter, sourceFilter]
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
      {
        key: "was_paid",
        header: "Paid",
        editable: true,
        editType: "toggle" as const,
        getEditValue: (order: Order) => Boolean(order.was_paid),
        getDisplayValue: (order: Order) => (order.was_paid ? "Paid" : "Unpaid"),
        isEditable: (order: Order) => order.payment_status !== "refunded",
        editDisabledTooltip: "Refunded orders cannot be toggled.",
      },
      {
        key: "shipper",
        header: "Shipper",
        sortable: true,
        editable: true,
        editType: "select" as const,
        editOptions: SHIPPERS.map((shipper) => ({ value: shipper, label: shipper })),
        getEditValue: (order: Order) => order.shipper ?? "USPS",
        getDisplayValue: (order: Order) => order.shipper ?? "—",
      },
      {
        key: "shipped",
        header: "Shipped",
        render: (order: Order) => (order.shipping_date ? "Yes" : "No"),
      },
    ],
    []
  );

  const handleOrderRowPatched = useCallback(
    (rowId: number, patch: Partial<Order>) => {
      setOrders((current) => current.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
    },
    [setOrders]
  );

  const handleOrderInlineEdit = useCallback(
    async (
      row: Order,
      columnKey: string,
      value: string | number | boolean
    ): Promise<InlineEditResult<Order>> => {
      const body =
        columnKey === "was_paid"
          ? { was_paid: value ? 1 : 0, payment_status: value ? "paid" : "unpaid" }
          : { shipper: String(value) };
      const previousState =
        columnKey === "was_paid"
          ? { was_paid: row.was_paid ?? 0, payment_status: row.payment_status ?? "unpaid" }
          : { shipper: row.shipper ?? null };
      const action =
        columnKey === "was_paid"
          ? value ? "Marked order as paid" : "Marked order as unpaid"
          : `Changed shipper to ${String(value)}`;
      return patchWithUndo({
        action,
        entity: "orders",
        id: row.id,
        updatedAt: row.updated_at,
        previousState,
        newState: body,
        pickRecord: (data) => (data.order as Order | undefined) ?? null,
        onPatched: (record) => handleOrderRowPatched(row.id, record),
      });
    },
    [patchWithUndo, handleOrderRowPatched]
  );

  const reloadOrders = useCallback(
    async (search?: string) => {
      const q = search ?? debouncedOrderSearch;
      const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset) });
      if (q.trim()) params.set("search", q.trim());
      if (statusFilter) params.set("order_status", statusFilter);
      if (paymentFilter) params.set("payment_status", paymentFilter);
      if (shippingFilter) params.set("shipping_status", shippingFilter);
      if (sourceFilter) params.set("source_channel", sourceFilter);
      if (sort) { params.set("sort_by", sort.key); params.set("sort_dir", sort.dir); }
      const response = await fetch(`/api/orders?${params}`, { headers: { Accept: "application/json" } });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
        items?: Order[];
        pagination?: PaginationInfo;
      };
      if (!response.ok) throw data;
      if (data.items) setOrders(data.items);
      if (data.pagination) setTotal(data.pagination.total);
    },
    [debouncedOrderSearch, pageSize, offset, statusFilter, paymentFilter, shippingFilter, sourceFilter, sort, setOrders, setTotal]
  );

  useEffect(() => {
    void reloadOrders().catch((err) =>
      setApiError("Could not load orders", "We could not load orders.", err)
    );
  }, [reloadOrders, setApiError]);

  // Update list + signal editor to reload (e.g. after mark-shipped, line item changes)
  const updateOrderInList = useCallback((order: Order) => {
    setOrders((current) => current.map((row) => (row.id === order.id ? order : row)));
    setEditorRefreshTrigger((n) => n + 1);
  }, [setOrders]);

  const syncEtsyOrders = useCallback(() => {
    if (!selectedShopId) return;
    setBusyAction("sync-etsy");
    void runSync(selectedShopId, {
      onSuccess: async (result) => {
        await reloadOrders();
        const synced = result.synced ?? 0;
        toast.showToast(
          synced > 0
            ? `Synced ${synced} order${synced !== 1 ? "s" : ""} from Etsy.`
            : "Etsy sync complete — no new orders to import.",
          synced > 0 ? "success" : "info"
        );
      },
      onError: (err) => {
        setApiError("Could not sync Etsy orders", "We could not sync Etsy receipts.", err);
      },
    }).finally(() => setBusyAction(null));
  }, [selectedShopId, runSync, reloadOrders, setApiError, setBusyAction, toast]);

  const syncTriggeredRef = useRef(false);
  useEffect(() => {
    if (searchParams.get("sync") !== "etsy" || !selectedShopId || syncTriggeredRef.current) return;
    syncTriggeredRef.current = true;
    router.replace(pathname);
    syncEtsyOrders();
  }, [searchParams, selectedShopId, router, pathname, syncEtsyOrders]);

  // Deep link ?orderId=
  useEffect(() => {
    const raw = searchParams.get("orderId");
    if (!raw) return;
    const id = Number(raw);
    if (!Number.isFinite(id)) return;

    const applyDeepLink = async () => {
      const existing = orders.find((row) => row.id === id);
      if (existing) {
        router.replace(pathname);
        controllerRef.current?.openRecord(existing);
        return;
      }
      try {
        const response = await fetch(`/api/orders/${id}`, { headers: { Accept: "application/json" } });
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { order?: Order };
        if (!response.ok || !data.order) {
          setError({ title: "Order not found", message: "That order may have been deleted.", actions: ["Choose another order from the list."] });
          router.replace(pathname);
          return;
        }
        setOrders((current) =>
          current.some((row) => row.id === id) ? current : [data.order as Order, ...current]
        );
        router.replace(pathname);
        // Defer to let the list re-render first
        setTimeout(() => controllerRef.current?.openRecord(data.order as Order), 0);
      } catch (err) {
        setApiError("Could not open order", "We could not load the linked order.", err);
      }
    };
    void applyDeepLink();
  }, [
    searchParams,
    orders,
    setOrders,
    router,
    pathname,
    setError,
    setApiError,
  ]);

  const markSelectedOrderPaid = async () => {
    if (!selectedOrderId) return;
    setBusyAction("mark-paid");
    try {
      const response = await apiFetch(`/api/orders/${selectedOrderId}/mark-paid`, {
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
        const response = await apiFetch(`/api/orders/${selectedOrderId}/mark-shipped`, {
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
      setEditorRefreshTrigger((n) => n + 1);
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
      const response = await apiFetch(`/api/orders/${selectedOrderId}`, {
        method: "PATCH",
        headers: patchHeaders(selectedOrder?.updated_at),
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

  const cancelSelectedOrder = async () => {
    if (!selectedOrderId) return;
    setBusyAction("cancel-order");
    try {
      const response = await apiFetch(`/api/orders/${selectedOrderId}`, {
        method: "PATCH",
        headers: patchHeaders(selectedOrder?.updated_at),
        body: JSON.stringify({ order_status: "cancelled" }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { order?: Order };
      if (!response.ok) throw data;
      if (data.order) updateOrderInList(data.order);
      setCancelConfirmOpen(false);
      setError(null);
    } catch (err) {
      setApiError("Could not cancel order", "We could not cancel the order.", err);
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
      setEditorRefreshTrigger((n) => n + 1);
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
      const { ok, feedback } = await runBatch("/api/orders/batch", buildOrderBatchBody("void"), {
        entity: "order",
        actionPast: "voided",
        count: batch.selectionCount,
      });
      if (!ok) throw new Error(feedback.message);
      await reloadOrders();
      setEditorRefreshTrigger((n) => n + 1);
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
      addNotificationEntry({ type: "error", message: "Print queue is full (50 max). Print or clear some items first." });
    } else if (added === 0 && duplicate > 0) {
      addNotificationEntry({ type: "info", message: "Already in queue." });
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
      {/* Page header row */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-[var(--ui-title)]">Orders</h3>
        <Button
          variant="secondary"
          size="lg"
          onClick={syncEtsyOrders}
          busy={busyAction === "sync-etsy"}
          disabled={selectedShopId == null}
        >
          Sync Etsy receipts
        </Button>
      </div>

      {/* Batch actions bar — list mode only */}
      {!isEditorOpen && batch.selectionCount > 0 ? (
        <BatchActionsBar
          selectionLabel={
            batch.selectAllMatching
              ? `All ${batch.selectionCount} matching selected`
              : `${batch.selectionCount} selected`
          }
          onClear={batch.clearSelection}
          selectAllMatching={
            batch.canSelectAllMatching && !batch.selectAllMatching
              ? { total: listTotal, onSelect: batch.selectAllMatchingRows, tooLarge: batch.selectAllMatchingTooLarge }
              : undefined
          }
        >
          <Button
            variant="secondary"
            size="sm"
            busy={busyAction === "batch-paid" || batchBusy}
            onClick={() => void batchMarkPaid()}
          >
            Mark paid
          </Button>
          <Button
            variant="secondary"
            size="sm"
            busy={batchBusy}
            onClick={() => openShipModal("batch")}
          >
            Mark shipped…
          </Button>
          <Button
            variant="secondary"
            size="sm"
            busy={batchBusy}
            onClick={() => setPrintQueueOpen(true)}
          >
            Add to print queue…
          </Button>
          <Button
            variant="danger"
            size="sm"
            busy={busyAction === "batch-void" || batchBusy}
            disabled={isOffline}
            title={isOffline ? "Unavailable while offline" : undefined}
            onClick={() => setBatchVoidConfirmOpen(true)}
          >
            Void
          </Button>
        </BatchActionsBar>
      ) : null}

      <SemsScreen
        entityLabel="Order"
        entityLabelPlural="Orders"
        columns={orderColumns}
        data={orders}
        getRowTitle={(o) => o.order_number ?? `Order ${o.id}`}
        sort={sort ?? { key: "order_date", dir: "desc" }}
        onSortChange={(next) => { setPage(0); setSort(next ?? { key: "order_date", dir: "desc" }); }}
        filters={
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={orderSearch}
                onChange={(e) => { setPage(0); setOrderSearch(e.target.value); }}
                aria-label="Search orders"
                placeholder="Search order #, name, city…"
                title="Search (⌘K)"
                className="min-w-[12rem] flex-1 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterChipRow
                label="Status"
                value={statusFilter}
                onChange={(value) => { setPage(0); setStatusFilter(value); }}
                options={[
                  { value: "active", label: "Active" },
                  { value: "void", label: "Void" },
                  { value: "cancelled", label: "Cancelled" },
                ]}
              />
              <FilterChipRow
                label="Payment"
                value={paymentFilter}
                onChange={(value) => { setPage(0); setPaymentFilter(value); }}
                options={[
                  { value: "paid", label: "Paid" },
                  { value: "unpaid", label: "Unpaid" },
                ]}
              />
              <FilterChipRow
                label="Shipping"
                value={shippingFilter}
                onChange={(value) => { setPage(0); setShippingFilter(value); }}
                options={[
                  { value: "shipped", label: "Shipped" },
                  { value: "not_shipped", label: "Not shipped" },
                ]}
              />
              <FilterChipRow
                label="Source"
                value={sourceFilter}
                onChange={(value) => { setPage(0); setSourceFilter(value); }}
                options={[
                  { value: "etsy", label: "Etsy" },
                  { value: "manual", label: "Manual" },
                ]}
              />
            </div>
          </div>
        }
        pagination={{ page, pageSize, total: listTotal, onPageChange: setPage }}
        batchSelection={{
          selectedIds: batch.selectedIds,
          onToggleRow: batch.toggleRow,
          onToggleAllVisible: batch.toggleAllVisible,
          allVisibleSelected: batch.allVisibleSelected,
          indeterminate: batch.headerIndeterminate,
        }}
        onInlineEdit={handleOrderInlineEdit}
        onRowPatched={handleOrderRowPatched}
        controllerRef={controllerRef}
        addNewLabel="Add new order"
        onOpenChange={(order) => {
          setSelectedOrderId(order?.id ?? null);
          setIsEditorOpen(order != null);
        }}
        renderEditor={({ record, requestClose, done }) => {
          if (!record) {
            return (
              <OrderCreateForm
                customers={customers}
                requestClose={requestClose}
                done={done}
                onCreated={(newOrder) => {
                  setOrders((current) => [newOrder, ...current.filter((r) => r.id !== newOrder.id)]);
                  // Open the new order in the editor
                  setTimeout(() => controllerRef.current?.openRecord(newOrder), 0);
                }}
                onError={(title, message, err) => setApiError(title, message, err)}
              />
            );
          }
          return (
            <OrderEditorShell
              key={record.id}
              record={record}
              requestClose={requestClose}
              refreshTrigger={editorRefreshTrigger}
              customers={customers}
              inventory={inventory as InventoryItem[]}
              busy={busyAction != null}
              onOrderUpdated={updateOrderInList}
              onError={(title, message, err) => setApiError(title, message, err)}
              onSuccess={(title, message) => setError({ title, message, actions: [] })}
              onMarkPaid={() => void markSelectedOrderPaid()}
              onMarkShipped={() => openShipModal("single")}
              onVoid={() => setVoidConfirmOpen(true)}
              onCancel={() => setCancelConfirmOpen(true)}
            />
          );
        }}
        emptyState={
          listTotal === 0 ? (
            <EmptyState
              message={
                orderSearch.trim() || (statusFilter && statusFilter !== "active") || paymentFilter || shippingFilter || sourceFilter
                  ? "No orders match your filters."
                  : "No orders yet. Sync from Etsy or create your first manual order."
              }
              primaryAction={
                orderSearch.trim() || (statusFilter && statusFilter !== "active") || paymentFilter || shippingFilter || sourceFilter
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
                  : { label: "Create a manual order", onClick: () => controllerRef.current?.openRecord(null) }
              }
              secondaryAction={
                orderSearch.trim() || (statusFilter && statusFilter !== "active") || paymentFilter || shippingFilter || sourceFilter
                  ? undefined
                  : shops.length > 0
                    ? { label: "Sync from Etsy", onClick: () => void syncEtsyOrders() }
                    : {
                        label: "Connect Etsy first",
                        onClick: () => router.push("/settings#etsy-connection"),
                        variant: "secondary",
                      }
              }
            />
          ) : null
        }
      />

      {/* Ship modal */}
      {shipModalOpen && (shipModalMode === "batch" || selectedOrder) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5">
            <h4 className="mb-3 text-lg font-semibold text-[var(--ui-title)]">
              {shipModalMode === "batch"
                ? `Mark ${batch.selectionCount} orders shipped`
                : `Ship order ${selectedOrder?.order_number ?? ""}`}
            </h4>
            <label className="mb-2 block text-sm">
              Carrier
              <select
                value={shipForm.shipper}
                onChange={(e) => setShipForm((f) => ({ ...f, shipper: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2"
              >
                {SHIPPERS.map((s) => <option key={s} value={s}>{s}</option>)}
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
                <HelpTooltip text="When checked, allows shipping an order that hasn't been marked as paid. An audit flag is recorded." />
              </label>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShipModalOpen(false)}>Cancel</Button>
              <Button
                variant="accent"
                onClick={() => void submitMarkShipped()}
                busy={busyAction === "mark-shipped" || busyAction === "batch-ship"}
              >
                Confirm shipment
              </Button>
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
        open={cancelConfirmOpen}
        onClose={() => setCancelConfirmOpen(false)}
        onConfirm={() => void cancelSelectedOrder()}
        title="Cancel order?"
        description="This will cancel the order. Cancelled orders are excluded from active reports and cannot be shipped."
        affectedLabel={selectedOrder?.order_number ? `Order ${selectedOrder.order_number}` : undefined}
        confirmLabel="Cancel order"
        confirmVariant="danger"
        busy={busyAction === "cancel-order"}
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
          <Button variant="secondary" onClick={() => setPrintQueueOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={addSelectedToPrintQueue}>Add to queue</Button>
        </div>
      </Modal>
      <ProgressModal
        open={progressOpen}
        title={progressTitle}
        statusText={progressTitle}
        mode="determinate"
        current={progressCurrent}
        total={progressTotal}
      />
      <ProgressModal {...syncModal} />
    </section>
  );
}

export default function SalesPage() {
  return (
    <Suspense
      fallback={
        <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 text-sm text-[var(--ui-muted)]">
          Loading orders...
        </section>
      }
    >
      <SalesPageInner />
    </Suspense>
  );
}
