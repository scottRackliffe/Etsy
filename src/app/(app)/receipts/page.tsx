"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { type Column, type SortState } from "@/components/ui/DataTable";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Badge } from "@/components/ui/Badge";
import { SemsScreen, type SemsScreenController } from "@/components/sems/SemsScreen";
import { SemsEditor } from "@/components/sems/SemsEditor";
import { useSemsEditorGuard } from "@/components/sems/useSemsEditorGuard";
import { VendorPicker } from "@/components/ui/VendorPicker";
import { useApp } from "@/context/AppContext";
import { useDirtyTracking } from "@/hooks/useDirtyTracking";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePagination } from "@/hooks/usePagination";
import { apiFetch } from "@/lib/api-fetch";
import type { ApiErrorShape } from "@/types";

/* ─────────────────────────── Types ─────────────────────────── */

type ReceiptRow = {
  id: number;
  vendor_name: string | null;
  vendor_id: number | null;
  purchase_date: string | null;
  reference_number: string | null;
  shipping_price: number | null;
  receipt_image: string | null;
  notes: string | null;
  total_items: number;
  unassigned_items: number;
  created_at: string;
  updated_at: string;
};

type ReceiptItem = {
  id: number;
  receipt_id: number;
  description: string;
  cost: number | null;
  inventory_id: number | null;
  item_number?: string | null;
  inventory_description?: string | null;
};

type ReceiptForm = {
  vendor_id: number | null;
  vendor_name: string;
  purchase_date: string;
  reference_number: string;
  shipping_price: string;
  notes: string;
};

type CreateItem = { description: string; cost: string };

type OcrPrefill = {
  form: ReceiptForm;
  createItems: CreateItem[];
  previewUrl: string | null;
};

type InventoryPickItem = {
  id: number;
  item_number: string | null;
  description: string | null;
  status: string | null;
};

/* ─────────────────────────── Constants / helpers ─────────────────────────── */

const EMPTY_FORM: ReceiptForm = {
  vendor_id: null,
  vendor_name: "",
  purchase_date: new Date().toISOString().slice(0, 10),
  reference_number: "",
  shipping_price: "",
  notes: "",
};

const EMPTY_CREATE_ITEM: CreateItem = { description: "", cost: "" };

const inputCls =
  "w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm";

const fmtCurrency = (n: number | null | undefined) =>
  n != null ? `$${n.toFixed(2)}` : "—";

function receiptToForm(r: ReceiptRow): ReceiptForm {
  return {
    vendor_id: r.vendor_id,
    vendor_name: r.vendor_name ?? "",
    purchase_date: r.purchase_date ?? "",
    reference_number: r.reference_number ?? "",
    shipping_price: r.shipping_price != null ? String(r.shipping_price) : "",
    notes: r.notes ?? "",
  };
}

function receiptRowTitle(r: ReceiptRow): string {
  return r.vendor_name ?? `Receipt #${r.id}`;
}

/* ─────────────────────────── Editor (Region 2 + Region 3) ─────────────────────────── */

function ReceiptEditor({
  record,
  ocrPrefill,
  onSaved,
  requestClose,
  done,
}: {
  record: ReceiptRow | null;
  ocrPrefill?: OcrPrefill | null;
  onSaved: (receipt: ReceiptRow, isNew: boolean) => void;
  requestClose: () => void;
  done: () => void;
}) {
  const { setApiError, setError } = useApp();
  const isNew = record === null;

  /* ── Header dirty form ── */
  const initial = useMemo<ReceiptForm>(() => {
    if (record) return receiptToForm(record);
    return ocrPrefill?.form ?? EMPTY_FORM;
  }, [record, ocrPrefill]);

  const { current, setCurrent, savedState, isDirty, markClean } =
    useDirtyTracking<ReceiptForm>(initial);
  const form = current ?? EMPTY_FORM;

  const [busy, setBusy] = useState(false);
  const [vendorError, setVendorError] = useState<string | null>(null);

  /* ── Create mode: line items in the draft (not immediate-commit) ── */
  const [createItems, setCreateItems] = useState<CreateItem[]>(
    ocrPrefill?.createItems ?? [EMPTY_CREATE_ITEM]
  );

  /* ── Edit mode: line items loaded from API (immediate-commit via Region 3) ── */
  const [lineItems, setLineItems] = useState<ReceiptItem[]>([]);
  const [lineItemsLoading, setLineItemsLoading] = useState(false);
  /* Local buffer for editing unlinked items */
  const [unlinkedBuf, setUnlinkedBuf] = useState<Array<{ description: string; cost: string }>>([]);
  const [itemsBusy, setItemsBusy] = useState(false);

  /* ── Inventory linking ── */
  const [linkingItemId, setLinkingItemId] = useState<number | null>(null);
  const [pickFilter, setPickFilter] = useState("");
  const [pickSort, setPickSort] = useState<"date" | "name">("date");
  const [pickItems, setPickItems] = useState<InventoryPickItem[]>([]);
  const [pickLoading, setPickLoading] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);

  /* ── Load line items when editing ── */
  useEffect(() => {
    if (!record) return;
    let cancelled = false;
    setLineItemsLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/receipts/${record.id}`, {
          headers: { Accept: "application/json" },
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          items?: ReceiptItem[];
        };
        if (!cancelled && res.ok) {
          const items = data.items ?? [];
          setLineItems(items);
          setUnlinkedBuf(
            items
              .filter((it) => !it.inventory_id)
              .map((it) => ({ description: it.description, cost: it.cost != null ? String(it.cost) : "" }))
          );
        }
      } catch {
        /* silent */
      } finally {
        if (!cancelled) setLineItemsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [record]);

  const set = useCallback(
    <K extends keyof ReceiptForm>(key: K, value: ReceiptForm[K]) => {
      setCurrent((prev) => ({ ...(prev ?? EMPTY_FORM), [key]: value }));
      if (key === "vendor_id" || key === "vendor_name") setVendorError(null);
    },
    [setCurrent]
  );

  /* ── Save (create / edit) ── */
  const save = useCallback(async (): Promise<boolean> => {
    const value = current ?? EMPTY_FORM;
    if (!value.vendor_id && !value.vendor_name.trim()) {
      setVendorError("Vendor is required.");
      return false;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        vendor_id: value.vendor_id,
        vendor_name: value.vendor_name.trim(),
        purchase_date: value.purchase_date || null,
        reference_number: value.reference_number.trim() || null,
        shipping_price: value.shipping_price ? Number(value.shipping_price) : null,
        notes: value.notes.trim() || null,
      };

      let res: Response;
      if (isNew) {
        body.items = createItems
          .filter((it) => it.description.trim())
          .map((it) => ({
            description: it.description.trim(),
            cost: it.cost !== "" ? Number(it.cost) : null,
          }));
        res = await apiFetch("/api/receipts", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await apiFetch(`/api/receipts/${record!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body),
        });
      }
      const data = (await res.json().catch(() => ({}))) as ApiErrorShape & {
        receipt?: Record<string, unknown>;
      };
      if (!res.ok) throw data;

      /* Map the returned receipt to ReceiptRow */
      const saved = data.receipt as ReceiptRow | undefined;
      if (saved) {
        /* Ensure computed columns have sensible defaults if the PATCH response omits them */
        const row: ReceiptRow = {
          ...saved,
          total_items: saved.total_items ?? record?.total_items ?? 0,
          unassigned_items: saved.unassigned_items ?? record?.unassigned_items ?? 0,
        };
        markClean(value);
        onSaved(row, isNew);
      }
      setError(null);
      return true;
    } catch (err) {
      setApiError(
        isNew ? "Could not save receipt" : "Could not update receipt",
        isNew ? "We could not save the receipt." : "We could not update the receipt.",
        err
      );
      return false;
    } finally {
      setBusy(false);
    }
  }, [current, isNew, record, createItems, markClean, onSaved, setApiError, setError]);

  const discard = useCallback(() => {
    setCurrent(savedState);
    setVendorError(null);
  }, [savedState, setCurrent]);

  useSemsEditorGuard({ isDirty, onSave: save, onDiscard: discard });

  const handleSaveClick = useCallback(() => {
    void (async () => {
      const ok = await save();
      if (ok) done();
    })();
  }, [save, done]);

  /* ── Edit mode: update unlinked items immediately ── */
  const reloadLineItems = useCallback(async () => {
    if (!record) return;
    try {
      const res = await fetch(`/api/receipts/${record.id}`, {
        headers: { Accept: "application/json" },
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: ReceiptItem[] };
      if (res.ok) {
        const items = data.items ?? [];
        setLineItems(items);
        setUnlinkedBuf(
          items
            .filter((it) => !it.inventory_id)
            .map((it) => ({ description: it.description, cost: it.cost != null ? String(it.cost) : "" }))
        );
      }
    } catch {
      /* silent */
    }
  }, [record]);

  const saveUnlinkedItems = useCallback(async () => {
    if (!record) return;
    setItemsBusy(true);
    try {
      const res = await apiFetch(`/api/receipts/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          items: unlinkedBuf
            .filter((it) => it.description.trim())
            .map((it) => ({
              description: it.description.trim(),
              cost: it.cost !== "" ? Number(it.cost) : null,
            })),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as ApiErrorShape;
        throw data;
      }
      await reloadLineItems();
      setError(null);
    } catch (err) {
      setApiError("Could not update items", "We could not update the receipt items.", err);
    } finally {
      setItemsBusy(false);
    }
  }, [record, unlinkedBuf, reloadLineItems, setApiError, setError]);

  /* ── Inventory linking ── */
  const loadPickList = useCallback(async () => {
    setPickLoading(true);
    try {
      const res = await fetch("/api/inventory?limit=500&sort_by=created_at&sort_dir=desc", {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { items?: InventoryPickItem[] };
        setPickItems(data.items ?? []);
      }
    } catch {
      /* silent */
    } finally {
      setPickLoading(false);
    }
  }, []);

  const filteredPickItems = useMemo(() => {
    const q = pickFilter.toLowerCase().trim();
    let list = pickItems;
    if (q) {
      list = list.filter(
        (it) =>
          (it.item_number ?? "").toLowerCase().includes(q) ||
          (it.description ?? "").toLowerCase().includes(q)
      );
    }
    if (pickSort === "name") {
      list = [...list].sort((a, b) =>
        (a.description ?? "").localeCompare(b.description ?? "")
      );
    }
    return list;
  }, [pickItems, pickFilter, pickSort]);

  const linkToInventory = useCallback(
    async (receiptItemId: number, inventoryId: number) => {
      if (!record) return;
      setLinkBusy(true);
      try {
        const res = await apiFetch(`/api/receipts/${record.id}/items/${receiptItemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ inventory_id: inventoryId }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as ApiErrorShape;
          throw data;
        }
        setLinkingItemId(null);
        setPickFilter("");
        await reloadLineItems();
        setError({ title: "Linked", message: "Receipt item linked to inventory.", actions: [] });
      } catch (err) {
        setApiError("Link failed", "Could not link item to inventory.", err);
      } finally {
        setLinkBusy(false);
      }
    },
    [record, reloadLineItems, setApiError, setError]
  );

  const unlinkFromInventory = useCallback(
    async (receiptItemId: number) => {
      if (!record) return;
      setLinkBusy(true);
      try {
        const res = await apiFetch(`/api/receipts/${record.id}/items/${receiptItemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ inventory_id: null }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as ApiErrorShape;
          throw data;
        }
        await reloadLineItems();
        setError(null);
      } catch (err) {
        setApiError("Unlink failed", "Could not unlink item.", err);
      } finally {
        setLinkBusy(false);
      }
    },
    [record, reloadLineItems, setApiError, setError]
  );

  const createInventoryFromItem = useCallback(
    async (receiptItem: ReceiptItem) => {
      if (!record) return;
      setLinkBusy(true);
      try {
        const res = await fetch("/api/inventory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: receiptItem.description,
            purchase_cost: receiptItem.cost,
            status: "Draft",
            date_purchased: record.purchase_date ?? null,
            notes: `From receipt: ${record.vendor_name ?? ""}${record.reference_number ? ` (${record.reference_number})` : ""}`,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { item?: { id: number; item_number?: string } };
          if (data.item?.id) {
            await linkToInventory(receiptItem.id, data.item.id);
            setError({
              title: "Item created",
              message: `Inventory item ${data.item.item_number ?? `#${data.item.id}`} created and linked.`,
              actions: [],
            });
          }
        } else {
          const data = (await res.json().catch(() => ({}))) as ApiErrorShape;
          setApiError(
            "Could not create item",
            data.error?.user_message ?? "Failed to create inventory item.",
            data
          );
        }
      } catch (err) {
        setApiError("Create failed", "Could not create inventory item.", err);
      } finally {
        setLinkBusy(false);
      }
    },
    [record, linkToInventory, setApiError, setError]
  );

  /* ── Badges + summary ── */
  const hasLinkedItems = lineItems.some((it) => it.inventory_id);
  const unlinkedCount = lineItems.filter((it) => !it.inventory_id).length;
  const badges = (
    <>
      {record && unlinkedCount > 0 ? (
        <Badge label={`${unlinkedCount} unlinked`} variant="warning" />
      ) : null}
      {record && hasLinkedItems && unlinkedCount === 0 ? (
        <Badge label="All linked" variant="info" />
      ) : null}
    </>
  );

  const summary = record ? (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {record.purchase_date ? (
        <span className="rounded-lg bg-[var(--ui-card-bg)] px-2 py-1 text-[var(--ui-muted)]">
          {record.purchase_date}
        </span>
      ) : null}
      <span className="rounded-lg bg-[var(--ui-card-bg)] px-2 py-1 text-[var(--ui-muted)]">
        Items: <strong className="text-[var(--ui-body)]">{record.total_items}</strong>
      </span>
    </div>
  ) : null;

  /* ── Existing receipt image display ── */
  const existingImageUrl = record?.receipt_image
    ? `/api/uploads/${record.receipt_image}`
    : null;

  /* ── Region 3 context (edit mode only) ── */
  const context = record ? (
    <div className="space-y-4">
      {/* Receipt image (if saved) */}
      {existingImageUrl ? (
        <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
          <p className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Receipt image</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={existingImageUrl}
            alt="Receipt"
            className="max-h-48 w-auto rounded-lg border border-[var(--ui-border)] object-contain"
          />
        </div>
      ) : null}

      {/* Line items */}
      <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
        <p className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Receipt items</p>

        {lineItemsLoading ? (
          <div className="flex items-center gap-2 py-2">
            <LoadingSpinner />
            <span className="text-xs text-[var(--ui-muted)]">Loading items…</span>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Linked items (read-only) */}
            {lineItems.filter((it) => it.inventory_id).map((it) => (
              <div
                key={it.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--ui-body)]">{it.description}</p>
                  {it.cost != null ? (
                    <p className="text-xs text-[var(--ui-muted)]">Cost: {fmtCurrency(it.cost)}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/inventory?itemId=${it.inventory_id}`}
                    className="rounded-full bg-[var(--ui-green)]/20 px-2 py-0.5 text-xs font-medium text-[var(--ui-green)] hover:underline"
                  >
                    {it.item_number ?? `#${it.inventory_id}`}
                  </Link>
                  <button
                    type="button"
                    onClick={() => void unlinkFromInventory(it.id)}
                    disabled={linkBusy}
                    className="text-xs text-[var(--ui-muted)] hover:text-[var(--ui-red)]"
                    title="Unlink from inventory"
                  >
                    &times;
                  </button>
                </div>
              </div>
            ))}

            {/* Unlinked items (editable local buffer) */}
            {unlinkedBuf.length === 0 && lineItems.filter((it) => !it.inventory_id).length === 0 && lineItems.length > 0 ? (
              <p className="text-xs text-[var(--ui-muted)]">All items are linked to inventory.</p>
            ) : null}

            {unlinkedBuf.map((buf, idx) => {
              const serverItem = lineItems.filter((it) => !it.inventory_id)[idx];
              const isLinking = serverItem && linkingItemId === serverItem.id;
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <input
                      value={buf.description}
                      onChange={(e) => {
                        const next = [...unlinkedBuf];
                        next[idx] = { ...buf, description: e.target.value };
                        setUnlinkedBuf(next);
                      }}
                      placeholder="Item description"
                      className="flex-1 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-1.5 text-sm"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={buf.cost}
                      onChange={(e) => {
                        const next = [...unlinkedBuf];
                        next[idx] = { ...buf, cost: e.target.value };
                        setUnlinkedBuf(next);
                      }}
                      placeholder="Cost"
                      className="w-24 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-1.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setUnlinkedBuf((cur) => cur.filter((_, i) => i !== idx))}
                      className="flex h-7 w-7 items-center justify-center text-[var(--ui-muted)] hover:text-[var(--ui-red)]"
                      title="Remove item"
                    >
                      &times;
                    </button>
                  </div>
                  {/* Link panel */}
                  {serverItem ? (
                    isLinking ? (
                      <div className="rounded-lg border border-[var(--ui-accent)]/40 bg-[var(--ui-accent)]/5 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-xs font-medium text-[var(--ui-accent)]">
                            Pick an inventory item to link
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setLinkingItemId(null);
                              setPickFilter("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                        <div className="mb-2 flex items-center gap-2">
                          <input
                            value={pickFilter}
                            onChange={(e) => setPickFilter(e.target.value)}
                            placeholder="Filter by item # or description..."
                            autoFocus
                            className="flex-1 rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-2 py-1.5 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setPickSort(pickSort === "date" ? "name" : "date")}
                            className="shrink-0 rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-2 py-1.5 text-xs text-[var(--ui-muted)] hover:text-[var(--ui-body)]"
                            title={pickSort === "date" ? "Sorted newest first — click for A-Z" : "Sorted A-Z — click for newest first"}
                          >
                            {pickSort === "date" ? "Newest ↓" : "A → Z"}
                          </button>
                        </div>
                        {pickLoading ? (
                          <div className="flex items-center gap-2 py-2">
                            <LoadingSpinner />
                            <span className="text-xs text-[var(--ui-muted)]">Loading inventory…</span>
                          </div>
                        ) : filteredPickItems.length > 0 ? (
                          <div className="max-h-52 space-y-0.5 overflow-y-auto rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)]">
                            {filteredPickItems.map((inv) => (
                              <button
                                key={inv.id}
                                type="button"
                                onClick={() => void linkToInventory(serverItem.id, inv.id)}
                                disabled={linkBusy}
                                className="flex w-full items-center gap-2 border-b border-[var(--ui-border)] px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[var(--ui-accent)]/15"
                              >
                                <span className="shrink-0 rounded bg-[var(--ui-panel-bg)] px-1.5 py-0.5 font-mono text-xs text-[var(--ui-body)]">
                                  {inv.item_number ?? `#${inv.id}`}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-[var(--ui-body)]">
                                  {inv.description ?? "—"}
                                </span>
                                <span className="shrink-0 text-[10px] text-[var(--ui-muted)]">
                                  {inv.status}
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : pickItems.length > 0 ? (
                          <p className="py-2 text-xs text-[var(--ui-muted)]">
                            No items match &ldquo;{pickFilter}&rdquo;
                          </p>
                        ) : (
                          <p className="py-2 text-xs text-[var(--ui-muted)]">No inventory items found.</p>
                        )}
                        <p className="mt-1 text-[10px] text-[var(--ui-muted)]">
                          {filteredPickItems.length} item{filteredPickItems.length !== 1 ? "s" : ""}
                          {pickFilter.trim() ? " matching" : " total"}
                        </p>
                      </div>
                    ) : (
                      <div className="flex gap-1.5 pl-1">
                        <Button
                          variant="accent"
                          size="sm"
                          onClick={() => void createInventoryFromItem(serverItem)}
                          disabled={linkBusy}
                        >
                          Create item
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={linkBusy}
                          onClick={() => {
                            setLinkingItemId(serverItem.id);
                            setPickFilter("");
                            if (pickItems.length === 0) void loadPickList();
                          }}
                        >
                          Link existing
                        </Button>
                      </div>
                    )
                  ) : null}
                </div>
              );
            })}

            {/* Add item button (unlinked) */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setUnlinkedBuf((cur) => [...cur, { description: "", cost: "" }])
              }
            >
              + Add item
            </Button>

            {/* Save unlinked items */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void saveUnlinkedItems()}
              busy={itemsBusy}
              disabled={unlinkedBuf.every((it) => !it.description.trim())}
            >
              Save item changes
            </Button>
          </div>
        )}
      </div>
    </div>
  ) : null;

  /* ── Editor body (children) ── */
  return (
    <SemsEditor
      title={
        isNew
          ? ocrPrefill
            ? "New receipt — review scan"
            : "New receipt (manual)"
          : `Receipt — ${record.vendor_name ?? `#${record.id}`}`
      }
      badges={badges}
      summary={summary}
      isDirty={isDirty}
      busy={busy}
      saveLabel={isNew ? "Save receipt" : "Save changes"}
      saveDisabled={!form.vendor_id && !form.vendor_name.trim()}
      onSave={handleSaveClick}
      onCancel={requestClose}
      context={context}
    >
      {/* OCR preview image (create mode) */}
      {isNew && ocrPrefill?.previewUrl ? (
        <div className="mb-3 flex items-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ocrPrefill.previewUrl}
            alt="Receipt scan"
            className="h-32 w-auto rounded-lg border border-[var(--ui-border)] object-contain"
          />
          <p className="ml-3 text-xs text-[var(--ui-muted)]">
            Review and correct the fields below. The image is shown for reference only and is not saved to the database.
          </p>
        </div>
      ) : null}

      {/* Header fields */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <FormField label="Vendor / store" required error={vendorError ?? undefined}>
          <VendorPicker
            vendorId={form.vendor_id}
            onChange={(id, name) => {
              set("vendor_id", id);
              set("vendor_name", name ?? "");
            }}
            placeholder="Select or type vendor..."
            ocrHint={!form.vendor_id && form.vendor_name ? form.vendor_name : null}
            className={inputCls}
          />
        </FormField>

        <FormField label="Purchase date">
          <input
            type="date"
            value={form.purchase_date}
            onChange={(e) => set("purchase_date", e.target.value)}
            className={inputCls}
          />
        </FormField>

        <FormField label="Reference number">
          <input
            value={form.reference_number}
            onChange={(e) => set("reference_number", e.target.value)}
            placeholder="Receipt / invoice #"
            className={inputCls}
          />
        </FormField>

        <FormField label="Shipping price">
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.shipping_price}
            onChange={(e) => set("shipping_price", e.target.value)}
            placeholder="0.00"
            className={inputCls}
          />
        </FormField>

        <div className="md:col-span-2">
          <FormField label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Any notes about this receipt…"
              rows={2}
              maxLength={2000}
              spellCheck
              className={`${inputCls} w-full`}
            />
          </FormField>
        </div>
      </div>

      {/* Line items (create mode only — part of the draft) */}
      {isNew ? (
        <div className="mt-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-[var(--ui-title)]">
              Items ({createItems.length})
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setCreateItems((cur) => [...cur, { ...EMPTY_CREATE_ITEM }])
              }
            >
              + Add item
            </Button>
          </div>
          <div className="space-y-2">
            {createItems.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  value={item.description}
                  onChange={(e) => {
                    const next = [...createItems];
                    next[idx] = { ...item, description: e.target.value };
                    setCreateItems(next);
                  }}
                  placeholder="Item description"
                  className="flex-1 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-sm"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.cost}
                  onChange={(e) => {
                    const next = [...createItems];
                    next[idx] = { ...item, cost: e.target.value };
                    setCreateItems(next);
                  }}
                  placeholder="Cost"
                  className="w-24 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() =>
                    setCreateItems((cur) => cur.filter((_, i) => i !== idx))
                  }
                  className="flex h-7 w-7 items-center justify-center text-[var(--ui-muted)] hover:text-[var(--ui-red)]"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </SemsEditor>
  );
}

/* ─────────────────────────── Screen (Region 1) ─────────────────────────── */

function ReceiptsPageInner() {
  const { setApiError, setError, pageSize: configPageSize } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrPrefill, setOcrPrefill] = useState<OcrPrefill | null>(null);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [linkFilter, setLinkFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>({ key: "purchase_date", dir: "desc" });

  const { page, pageSize, offset, setPage, setTotal } = usePagination(configPageSize);

  const [deleteTarget, setDeleteTarget] = useState<ReceiptRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const controllerRef = useRef<SemsScreenController<ReceiptRow> | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  /* Load all receipts (client-side filter/sort/page) */
  const loadReceipts = useCallback(async () => {
    try {
      const res = await fetch("/api/receipts", { headers: { Accept: "application/json" } });
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; receipts?: ReceiptRow[] };
        setReceipts(data.receipts ?? []);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReceipts();
  }, [loadReceipts]);

  /* Client-side filter → sort → paginate */
  const filteredSorted = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim();
    let list = receipts;
    if (q) {
      list = list.filter(
        (r) =>
          (r.vendor_name ?? "").toLowerCase().includes(q) ||
          (r.reference_number ?? "").toLowerCase().includes(q)
      );
    }
    if (linkFilter === "unlinked") {
      list = list.filter((r) => r.unassigned_items > 0);
    } else if (linkFilter === "linked") {
      list = list.filter((r) => r.total_items > 0 && r.unassigned_items === 0);
    }
    if (sort) {
      list = [...list].sort((a, b) => {
        const dir = sort.dir === "asc" ? 1 : -1;
        if (sort.key === "vendor_name") {
          return dir * (a.vendor_name ?? "").localeCompare(b.vendor_name ?? "");
        }
        /* Default: purchase_date, then created_at */
        const da = a.purchase_date ?? a.created_at ?? "";
        const db_ = b.purchase_date ?? b.created_at ?? "";
        return dir * da.localeCompare(db_);
      });
    }
    return list;
  }, [receipts, debouncedSearch, linkFilter, sort]);

  useEffect(() => {
    setTotal(filteredSorted.length);
  }, [filteredSorted.length, setTotal]);

  const pageData = useMemo(
    () => filteredSorted.slice(offset, offset + pageSize),
    [filteredSorted, offset, pageSize]
  );

  /* OCR scan */
  const handleScanFile = useCallback(
    async (file: File) => {
      setOcrBusy(true);
      const blobUrl = URL.createObjectURL(file);
      try {
        const formData = new FormData();
        formData.append("receipt_photo", file);
        const res = await fetch("/api/receipts/ocr", { method: "POST", body: formData });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          ocr?: {
            vendor_name: string;
            purchase_date: string | null;
            reference_number: string | null;
            items: Array<{ description: string; cost: number | null }>;
            notes: string | null;
          };
          error?: { userMessage?: string };
        };
        if (data.ok && data.ocr) {
          const prefill: OcrPrefill = {
            form: {
              vendor_id: null,
              vendor_name: data.ocr.vendor_name,
              purchase_date: data.ocr.purchase_date ?? "",
              reference_number: data.ocr.reference_number ?? "",
              shipping_price: "",
              notes: data.ocr.notes ?? "",
            },
            createItems:
              data.ocr.items.length > 0
                ? data.ocr.items.map((it) => ({
                    description: it.description,
                    cost: it.cost != null ? String(it.cost) : "",
                  }))
                : [EMPTY_CREATE_ITEM],
            previewUrl: blobUrl,
          };
          setOcrPrefill(prefill);
          controllerRef.current?.openRecord(null);
        } else {
          URL.revokeObjectURL(blobUrl);
          setError({
            title: "Could not read receipt",
            message: data.error?.userMessage ?? "Try a clearer photo.",
            actions: ["Take a clearer photo and try again."],
          });
        }
      } catch {
        URL.revokeObjectURL(blobUrl);
        setError({
          title: "OCR failed",
          message: "Could not process the receipt photo.",
          actions: ["Try again."],
        });
      } finally {
        setOcrBusy(false);
      }
    },
    [setError]
  );

  /* Delete */
  const deleteReceipt = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      const res = await apiFetch(`/api/receipts/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      if (res.ok || res.status === 204) {
        setDeleteTarget(null);
        controllerRef.current?.closeToList();
        setReceipts((cur) => cur.filter((r) => r.id !== deleteTarget.id));
        setError(null);
      } else {
        const data = (await res.json().catch(() => ({}))) as ApiErrorShape;
        setDeleteTarget(null);
        setApiError(
          "Cannot delete",
          data.error?.user_message ?? "This receipt has items linked to inventory. Unlink all items before deleting.",
          data
        );
      }
    } catch (err) {
      setApiError("Delete failed", "Could not delete receipt.", err);
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, setApiError, setError]);

  /* Deep link: ?receiptId=<id> */
  useEffect(() => {
    const raw = searchParams.get("receiptId");
    if (!raw) return;
    const id = Number(raw);
    router.replace(pathname);
    if (!Number.isFinite(id)) return;
    void (async () => {
      const existing = receipts.find((r) => r.id === id);
      if (existing) {
        controllerRef.current?.openRecord(existing);
        return;
      }
      try {
        const res = await fetch(`/api/receipts/${id}`, {
          headers: { Accept: "application/json" },
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          receipt?: ReceiptRow;
        };
        if (!res.ok || !data.receipt) {
          setError({
            title: "Receipt not found",
            message: "That receipt may have been deleted.",
            actions: ["Choose another receipt from the list."],
          });
          return;
        }
        const row = {
          ...data.receipt,
          total_items: data.receipt.total_items ?? 0,
          unassigned_items: data.receipt.unassigned_items ?? 0,
        } as ReceiptRow;
        setReceipts((cur) => (cur.some((r) => r.id === id) ? cur : [row, ...cur]));
        controllerRef.current?.openRecord(row);
      } catch (err) {
        setApiError("Could not open receipt", "We could not load the linked receipt.", err);
      }
    })();
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Columns */
  const columns = useMemo<Column<ReceiptRow>[]>(
    () => [
      {
        key: "vendor_name",
        header: "Vendor",
        sortable: true,
        render: (r: ReceiptRow) => (
          <span className="inline-flex items-center gap-1.5">
            {r.vendor_name ?? "—"}
            {!r.vendor_id ? (
              <span className="rounded-full bg-[var(--ui-yellow)]/20 px-1.5 py-0.5 text-[10px] font-medium text-[var(--ui-yellow)]">
                unlinked
              </span>
            ) : null}
          </span>
        ),
      },
      {
        key: "purchase_date",
        header: "Date",
        sortable: true,
        render: (r: ReceiptRow) => r.purchase_date ?? "—",
      },
      {
        key: "reference_number",
        header: "Reference",
        render: (r: ReceiptRow) => r.reference_number ?? "—",
      },
      {
        key: "total_items",
        header: "Items",
        render: (r: ReceiptRow) => String(r.total_items),
      },
      {
        key: "unassigned_items",
        header: "Unlinked",
        render: (r: ReceiptRow) =>
          r.unassigned_items > 0 ? (
            <span className="rounded-full bg-[var(--ui-yellow)]/20 px-2 py-0.5 text-xs font-medium text-[var(--ui-yellow)]">
              {r.unassigned_items}
            </span>
          ) : (
            <span className="text-xs text-[var(--ui-green)]">All linked</span>
          ),
      },
    ],
    []
  );

  const filters = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => {
            setPage(0);
            setSearch(e.target.value);
          }}
          placeholder="Search vendor, reference…"
          className="min-w-[10rem] flex-1 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
        />
        {/* Scan receipt button — distinct OCR create path */}
        <label className="cursor-pointer rounded-lg bg-[var(--ui-green)] px-3 py-2 text-sm font-semibold text-black hover:opacity-90">
          {ocrBusy ? "Scanning…" : "Scan receipt"}
          <input
            ref={scanInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
            className="hidden"
            disabled={ocrBusy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleScanFile(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <FilterChipRow
        label="Link status"
        value={linkFilter}
        onChange={(value) => {
          setPage(0);
          setLinkFilter(value);
        }}
        options={[
          { value: "unlinked", label: "Has unlinked" },
          { value: "linked", label: "All linked" },
        ]}
      />
    </div>
  );

  const emptyState = (
    <EmptyState
      message={
        search.trim() || linkFilter
          ? "No receipts match your filters."
          : "No purchase receipts yet. Upload a receipt photo or add one manually."
      }
      primaryAction={
        search.trim() || linkFilter
          ? {
              label: "Clear filters",
              onClick: () => {
                setSearch("");
                setLinkFilter(null);
                setPage(0);
              },
            }
          : undefined
      }
    />
  );

  /* OCR loading indicator (above the SEMS scaffold) */
  const ocrBanner = ocrBusy ? (
    <div className="mb-3 flex items-center gap-3 rounded-lg border border-[var(--ui-accent)]/30 bg-[var(--ui-accent)]/5 p-3">
      <LoadingSpinner />
      <span className="text-sm text-[var(--ui-body)]">Reading receipt with AI…</span>
    </div>
  ) : null;

  return (
    <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-[var(--ui-title)]">Purchase Receipts</h2>

      {ocrBanner}

      {loading ? (
        <div className="flex items-center gap-3 p-4">
          <LoadingSpinner />
          <span className="text-sm text-[var(--ui-muted)]">Loading receipts…</span>
        </div>
      ) : (
        <SemsScreen<ReceiptRow>
          entityLabel="Receipt"
          entityLabelPlural="Receipts"
          columns={columns}
          data={pageData}
          getRowTitle={receiptRowTitle}
          sort={sort}
          onSortChange={(next) => {
            setPage(0);
            setSort(next ?? { key: "purchase_date", dir: "desc" });
          }}
          filters={filters}
          pagination={{
            page,
            pageSize,
            total: filteredSorted.length,
            onPageChange: setPage,
          }}
          emptyState={emptyState}
          onDeleteRow={(r) => setDeleteTarget(r)}
          controllerRef={controllerRef}
          addNewLabel="Add new receipt (manual)"
          onOpenChange={() => {
            /* clear OCR prefill when closing editor */
          }}
          renderEditor={({ record, requestClose, done }) => (
            <ReceiptEditor
              key={record?.id ?? "new"}
              record={record}
              ocrPrefill={record === null ? ocrPrefill : null}
              requestClose={requestClose}
              done={done}
              onSaved={(receipt, isNew) => {
                if (isNew) {
                  setOcrPrefill((prev) => {
                    if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
                    return null;
                  });
                  setReceipts((cur) => [receipt, ...cur]);
                } else {
                  setReceipts((cur) =>
                    cur.map((r) => (r.id === receipt.id ? receipt : r))
                  );
                }
                void loadReceipts();
              }}
            />
          )}
        />
      )}

      <ConfirmDialog
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void deleteReceipt()}
        title="Delete receipt?"
        description={
          deleteTarget && deleteTarget.total_items > deleteTarget.unassigned_items
            ? `This receipt has ${deleteTarget.total_items - deleteTarget.unassigned_items} item(s) linked to inventory. You must unlink all items before deleting.`
            : "This receipt and all its items will be permanently removed."
        }
        affectedLabel={deleteTarget?.vendor_name ?? undefined}
        confirmLabel="Delete"
        confirmVariant="danger"
        busy={deleteBusy}
        confirmDisabled={
          deleteTarget != null &&
          deleteTarget.total_items > deleteTarget.unassigned_items
        }
      />
    </section>
  );
}

export default function ReceiptsPage() {
  return (
    <Suspense
      fallback={
        <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 text-sm text-[var(--ui-muted)]">
          Loading receipts…
        </section>
      }
    >
      <ReceiptsPageInner />
    </Suspense>
  );
}
