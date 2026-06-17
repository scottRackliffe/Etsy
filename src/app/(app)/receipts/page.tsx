"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";

type ReceiptRow = {
  id: number;
  vendor_name: string;
  purchase_date: string | null;
  reference_number: string | null;
  total_items: number;
  unassigned_items: number;
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

type ReceiptDraft = {
  vendor_name: string;
  purchase_date: string | null;
  reference_number: string | null;
  items: Array<{ description: string; cost: number | null }>;
  notes: string | null;
};

type InventoryPickItem = {
  id: number;
  item_number: string | null;
  description: string | null;
  status: string | null;
  created_at: string | null;
};

export default function ReceiptsPage() {
  const { setError } = useApp();

  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailItems, setDetailItems] = useState<ReceiptItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [linkingItemId, setLinkingItemId] = useState<number | null>(null);
  const [pickFilter, setPickFilter] = useState("");
  const [pickSort, setPickSort] = useState<"date" | "name">("date");
  const [pickItems, setPickItems] = useState<InventoryPickItem[]>([]);
  const [pickLoading, setPickLoading] = useState(false);

  const loadReceipts = useCallback(async () => {
    try {
      const res = await fetch("/api/receipts", { headers: { Accept: "application/json" } });
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; receipts: ReceiptRow[] };
        setReceipts(data.receipts ?? []);
      }
    } catch {
      /* silent */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadReceipts();
  }, [loadReceipts]);

  const loadReceiptDetail = async (receiptId: number) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/receipts/${receiptId}`, { headers: { Accept: "application/json" } });
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; items: ReceiptItem[] };
        setDetailItems(data.items ?? []);
      }
    } catch {
      /* silent */
    }
    setDetailLoading(false);
  };

  const toggleExpand = (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetailItems([]);
      setLinkingItemId(null);
    } else {
      setExpandedId(id);
      setLinkingItemId(null);
      void loadReceiptDetail(id);
    }
  };

  const loadPickList = useCallback(async () => {
    setPickLoading(true);
    try {
      const res = await fetch("/api/inventory?limit=500&sort_by=created_at&sort_dir=desc", {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const data = (await res.json()) as { items?: InventoryPickItem[] };
        setPickItems(data.items ?? []);
      }
    } catch {
      /* silent */
    }
    setPickLoading(false);
  }, []);

  const filteredPickItems = (() => {
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
  })();

  const linkToInventory = async (receiptItemId: number, inventoryId: number) => {
    if (!expandedId) return;
    try {
      const res = await fetch(`/api/receipts/${expandedId}/items/${receiptItemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventory_id: inventoryId }),
      });
      if (res.ok) {
        setLinkingItemId(null);
        setPickFilter("");
        void loadReceiptDetail(expandedId);
        void loadReceipts();
        setError({ title: "Linked", message: "Receipt item linked to inventory.", actions: [] });
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: { userMessage?: string } };
        setError({
          title: "Link failed",
          message: data.error?.userMessage ?? "Could not link item.",
          actions: ["Try again."],
        });
      }
    } catch {
      setError({ title: "Link failed", message: "Could not link item.", actions: ["Try again."] });
    }
  };

  const unlinkFromInventory = async (receiptItemId: number) => {
    if (!expandedId) return;
    try {
      const res = await fetch(`/api/receipts/${expandedId}/items/${receiptItemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventory_id: null }),
      });
      if (res.ok) {
        void loadReceiptDetail(expandedId);
        void loadReceipts();
      }
    } catch {
      setError({ title: "Unlink failed", message: "Could not unlink item.", actions: ["Try again."] });
    }
  };

  const createInventoryFromItem = async (receiptItem: ReceiptItem) => {
    if (!expandedId) return;
    const receipt = receipts.find((r) => r.id === expandedId);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: receiptItem.description,
          purchase_cost: receiptItem.cost,
          status: "Draft",
          date_purchased: receipt?.purchase_date ?? null,
          notes: receipt ? `From receipt: ${receipt.vendor_name}${receipt.reference_number ? ` (${receipt.reference_number})` : ""}` : null,
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
        const data = (await res.json().catch(() => ({}))) as { error?: { userMessage?: string } };
        setError({
          title: "Could not create item",
          message: data.error?.userMessage ?? "Failed to create inventory item.",
          actions: [],
        });
      }
    } catch {
      setError({ title: "Create failed", message: "Could not create inventory item.", actions: ["Try again."] });
    }
  };

  const handlePhotoUpload = async (file: File) => {
    setOcrBusy(true);
    setPreviewUrl(URL.createObjectURL(file));
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
        setDraft({
          vendor_name: data.ocr.vendor_name,
          purchase_date: data.ocr.purchase_date,
          reference_number: data.ocr.reference_number,
          items: data.ocr.items.length > 0 ? data.ocr.items : [{ description: "", cost: null }],
          notes: data.ocr.notes,
        });
      } else {
        setError({
          title: "Could not read receipt",
          message: data.error?.userMessage ?? "Try a clearer photo.",
          actions: ["Take a clearer photo and try again."],
        });
        setPreviewUrl(null);
      }
    } catch {
      setError({
        title: "OCR failed",
        message: "Could not process the receipt photo.",
        actions: ["Try again."],
      });
      setPreviewUrl(null);
    }
    setOcrBusy(false);
  };

  const saveReceipt = async () => {
    if (!draft || !draft.vendor_name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor_name: draft.vendor_name.trim(),
          purchase_date: draft.purchase_date,
          reference_number: draft.reference_number,
          notes: draft.notes,
          items: draft.items.filter((i) => i.description.trim()),
        }),
      });
      if (res.ok) {
        setDraft(null);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        void loadReceipts();
        setError({
          title: "Receipt saved",
          message: "The receipt and its items have been saved.",
          actions: [],
        });
      }
    } catch {
      setError({
        title: "Save failed",
        message: "Could not save the receipt.",
        actions: ["Try again."],
      });
    }
    setSaving(false);
  };

  const deleteReceipt = async (id: number) => {
    try {
      const res = await fetch(`/api/receipts/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        setReceipts((prev) => prev.filter((r) => r.id !== id));
        if (expandedId === id) {
          setExpandedId(null);
          setDetailItems([]);
        }
      } else {
        const data = (await res.json().catch(() => ({}))) as {
          error?: { userMessage?: string };
        };
        setError({
          title: "Cannot delete",
          message: data.error?.userMessage ?? "Could not delete receipt.",
          actions: [],
        });
      }
    } catch {
      setError({
        title: "Delete failed",
        message: "Could not delete receipt.",
        actions: ["Try again."],
      });
    }
  };

  const cancelDraft = () => {
    setDraft(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  return (
    <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-[var(--ui-title)]">Purchase Receipts</h2>
      <p className="mb-4 text-xs text-[var(--ui-muted)]">
        Track what you bought from vendors. Click a receipt to see its items and link them to inventory.
      </p>

      {/* Toolbar */}
      <div className="mb-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-lg bg-[var(--ui-green)] px-4 py-2 text-sm font-semibold text-black hover:opacity-90">
            Upload Receipt
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handlePhotoUpload(file);
                e.target.value = "";
              }}
            />
          </label>
          <Button
            variant="secondary"
            size="lg"
            onClick={() =>
              setDraft({
                vendor_name: "",
                purchase_date: new Date().toISOString().slice(0, 10),
                reference_number: null,
                items: [{ description: "", cost: null }],
                notes: null,
              })
            }
          >
            Manual Entry
          </Button>
          <p className="text-xs text-[var(--ui-muted)]">
            Upload a receipt photo or enter details by hand.
          </p>
        </div>
      </div>

      {/* OCR processing */}
      {ocrBusy ? (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-[var(--ui-accent)]/30 bg-[var(--ui-accent)]/5 p-4">
          <LoadingSpinner />
          <span className="text-sm text-[var(--ui-body)]">Reading receipt...</span>
        </div>
      ) : null}

      {/* New receipt form */}
      {draft ? (
        <div className="mb-4 space-y-4 rounded-lg border border-[var(--ui-green)]/40 bg-[var(--ui-green)]/5 p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-[var(--ui-title)]">
              New Receipt — Review & Save
            </h4>
            <Button variant="ghost" size="sm" onClick={cancelDraft}>
              Cancel
            </Button>
          </div>
          {previewUrl ? (
            <div className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Receipt"
                className="h-32 w-auto rounded-lg border border-[var(--ui-border)] object-contain"
              />
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm text-[var(--ui-body)]">
              Vendor / store
              <input
                value={draft.vendor_name}
                onChange={(e) => setDraft({ ...draft, vendor_name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
            </label>
            <label className="block text-sm text-[var(--ui-body)]">
              Date
              <input
                type="date"
                value={draft.purchase_date ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, purchase_date: e.target.value || null })
                }
                className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
            </label>
            <label className="block text-sm text-[var(--ui-body)]">
              Reference #
              <input
                value={draft.reference_number ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, reference_number: e.target.value || null })
                }
                className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
            </label>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--ui-body)]">
                Items ({draft.items.length})
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setDraft({
                    ...draft,
                    items: [...draft.items, { description: "", cost: null }],
                  })
                }
              >
                + Add item
              </Button>
            </div>
            <div className="space-y-2">
              {draft.items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    value={item.description}
                    onChange={(e) => {
                      const next = [...draft.items];
                      next[idx] = { ...item, description: e.target.value };
                      setDraft({ ...draft, items: next });
                    }}
                    className="flex-1 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                    placeholder="Item description"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.cost ?? ""}
                    onChange={(e) => {
                      const next = [...draft.items];
                      next[idx] = {
                        ...item,
                        cost: e.target.value === "" ? null : Number(e.target.value),
                      };
                      setDraft({ ...draft, items: next });
                    }}
                    className="w-24 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                    placeholder="Cost"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        items: draft.items.filter((_, i) => i !== idx),
                      })
                    }
                    className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--ui-muted)] hover:text-[var(--ui-red)]"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          </div>
          {draft.notes ? (
            <label className="block text-sm text-[var(--ui-body)]">
              Notes
              <input
                value={draft.notes ?? ""}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value || null })}
                className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
            </label>
          ) : null}
          <div className="flex gap-2">
            <Button
              variant="primary"
              busy={saving}
              disabled={!draft.vendor_name.trim()}
              onClick={() => void saveReceipt()}
            >
              Save Receipt
            </Button>
            <Button variant="ghost" onClick={cancelDraft}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {/* Receipts list */}
      {loading ? (
        <div className="flex items-center gap-3 p-4">
          <LoadingSpinner />
          <span className="text-sm text-[var(--ui-muted)]">Loading receipts...</span>
        </div>
      ) : receipts.length === 0 && !draft ? (
        <EmptyState
          message="No purchase receipts yet. Upload a receipt photo or enter one manually to get started."
          primaryAction={{
            label: "Manual Entry",
            onClick: () =>
              setDraft({
                vendor_name: "",
                purchase_date: new Date().toISOString().slice(0, 10),
                reference_number: null,
                items: [{ description: "", cost: null }],
                notes: null,
              }),
          }}
        />
      ) : receipts.length > 0 ? (
        <div className="space-y-0 overflow-x-auto rounded-lg border border-[var(--ui-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ui-border)] bg-[var(--ui-panel-bg)] text-xs text-[var(--ui-muted)]">
                <th className="px-3 py-2 text-left font-medium">Vendor</th>
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">Reference</th>
                <th className="px-3 py-2 text-center font-medium">Items</th>
                <th className="px-3 py-2 text-center font-medium">Unlinked</th>
                <th className="w-20 px-3 py-2 text-center font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((rx) => (
                <>
                  <tr
                    key={rx.id}
                    className={`border-b border-[var(--ui-border)] last:border-b-0 cursor-pointer transition-colors ${
                      expandedId === rx.id
                        ? "bg-[var(--ui-accent)]/10"
                        : "hover:bg-[var(--ui-card-bg)]/50"
                    }`}
                    onClick={() => toggleExpand(rx.id)}
                  >
                    <td className="px-3 py-2 font-medium text-[var(--ui-body)]">
                      <span className="mr-1.5 inline-block text-[10px] text-[var(--ui-muted)]">
                        {expandedId === rx.id ? "▼" : "▶"}
                      </span>
                      {rx.vendor_name}
                    </td>
                    <td className="px-3 py-2 text-[var(--ui-body)]">
                      {rx.purchase_date ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-[var(--ui-body)]">
                      {rx.reference_number ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-center text-[var(--ui-body)]">
                      {rx.total_items}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {rx.unassigned_items > 0 ? (
                        <span className="rounded-full bg-[var(--ui-yellow)]/20 px-2 py-0.5 text-xs font-medium text-[var(--ui-yellow)]">
                          {rx.unassigned_items}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--ui-green)]">All linked</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => void deleteReceipt(rx.id)}
                        disabled={rx.unassigned_items < rx.total_items}
                        title={
                          rx.unassigned_items < rx.total_items
                            ? "Cannot delete — has linked items"
                            : "Delete receipt"
                        }
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>

                  {/* Expanded detail */}
                  {expandedId === rx.id ? (
                    <tr key={`${rx.id}-detail`}>
                      <td colSpan={6} className="border-b border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-4 py-3">
                        {detailLoading ? (
                          <div className="flex items-center gap-2 py-2">
                            <LoadingSpinner />
                            <span className="text-xs text-[var(--ui-muted)]">Loading items...</span>
                          </div>
                        ) : detailItems.length === 0 ? (
                          <p className="py-2 text-xs text-[var(--ui-muted)]">No items on this receipt.</p>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
                              Receipt Items
                            </p>
                            {detailItems.map((ri) => (
                              <div
                                key={ri.id}
                                className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-[var(--ui-body)]">
                                    {ri.description}
                                  </p>
                                  {ri.cost != null ? (
                                    <p className="text-xs text-[var(--ui-muted)]">
                                      Cost: ${ri.cost.toFixed(2)}
                                    </p>
                                  ) : null}
                                </div>

                                {ri.inventory_id ? (
                                  <div className="flex items-center gap-2">
                                    <Link
                                      href={`/inventory?itemId=${ri.inventory_id}`}
                                      className="rounded-full bg-[var(--ui-green)]/20 px-2 py-0.5 text-xs font-medium text-[var(--ui-green)] hover:underline"
                                    >
                                      {ri.item_number ?? `#${ri.inventory_id}`}
                                    </Link>
                                    <button
                                      type="button"
                                      onClick={() => void unlinkFromInventory(ri.id)}
                                      className="text-xs text-[var(--ui-muted)] hover:text-[var(--ui-red)]"
                                      title="Unlink from inventory"
                                    >
                                      &times;
                                    </button>
                                  </div>
                                ) : linkingItemId === ri.id ? (
                                  <div className="w-full mt-2 space-y-2 rounded-lg border border-[var(--ui-accent)]/40 bg-[var(--ui-accent)]/5 p-3">
                                    <div className="flex items-center justify-between">
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
                                    <div className="flex items-center gap-2">
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
                                        className="shrink-0 rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-2 py-1.5 text-xs text-[var(--ui-muted)] hover:text-[var(--ui-body)] transition-colors"
                                        title={pickSort === "date" ? "Sorted by newest first — click for alphabetical" : "Sorted A-Z — click for newest first"}
                                      >
                                        {pickSort === "date" ? "Newest ↓" : "A → Z"}
                                      </button>
                                    </div>
                                    {pickLoading ? (
                                      <div className="flex items-center gap-2 py-2">
                                        <LoadingSpinner />
                                        <span className="text-xs text-[var(--ui-muted)]">Loading inventory...</span>
                                      </div>
                                    ) : filteredPickItems.length > 0 ? (
                                      <div className="max-h-52 overflow-y-auto space-y-0.5 rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)]">
                                        {filteredPickItems.map((inv) => (
                                          <button
                                            key={inv.id}
                                            type="button"
                                            onClick={() => void linkToInventory(ri.id, inv.id)}
                                            className="flex w-full items-center gap-2 border-b border-[var(--ui-border)] last:border-b-0 px-3 py-2 text-left text-sm hover:bg-[var(--ui-accent)]/15 transition-colors"
                                          >
                                            <span className="shrink-0 rounded bg-[var(--ui-panel-bg)] px-1.5 py-0.5 text-xs font-mono text-[var(--ui-body)]">
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
                                      <p className="py-2 text-xs text-[var(--ui-muted)]">No items match &ldquo;{pickFilter}&rdquo;</p>
                                    ) : (
                                      <p className="py-2 text-xs text-[var(--ui-muted)]">No inventory items found.</p>
                                    )}
                                    <p className="text-[10px] text-[var(--ui-muted)]">
                                      {filteredPickItems.length} item{filteredPickItems.length !== 1 ? "s" : ""}
                                      {pickFilter.trim() ? " matching" : " total"}
                                    </p>
                                  </div>
                                ) : (
                                  <div className="flex gap-1">
                                    <Button
                                      variant="accent"
                                      size="sm"
                                      onClick={() => void createInventoryFromItem(ri)}
                                    >
                                      Create Item
                                    </Button>
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => {
                                        setLinkingItemId(ri.id);
                                        setPickFilter("");
                                        if (pickItems.length === 0) void loadPickList();
                                      }}
                                    >
                                      Link Existing
                                    </Button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
