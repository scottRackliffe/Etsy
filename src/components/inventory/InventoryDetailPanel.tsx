"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DraftRecoveryBanner } from "@/components/ui/DraftRecoveryBanner";
import { ActivityTimeline } from "@/components/activity/ActivityTimeline";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, SelectInput, TextInput } from "@/components/ui/FormField";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";
import { useEntityDraft } from "@/hooks/useEntityDraft";
import { formStatesEqual } from "@/lib/deep-equal-form";
import { apiFetch, MutationQueuedError, MutationQueueFullError } from "@/lib/api-fetch";
import { isStaleConflictPayload, patchHeaders } from "@/lib/patch-json";
import type { ApiErrorShape, InventoryItem } from "@/types";

const STATUSES = ["Draft", "In stock", "Listed", "Sold", "Reserved", "Retired"] as const;
const CONDITIONS = ["Mint/Near Mint", "Excellent", "Very Good", "Good", "Fair/As-Is"] as const;

export type InventoryItemDetail = InventoryItem & {
  other_costs_total?: number;
  total_cost?: number;
  net_profit?: number;
  margin_pct?: number | null;
  roi_pct?: number | null;
};

type VendorPurchase = {
  id: number;
  inventory_id: number;
  vendor_name: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  shipping_price: number | null;
  reference_number: string | null;
  notes: string | null;
};

type DraftFields = {
  description: string;
  status: string;
  quantity: string;
  purchase_cost: string;
  shipping_cost: string;
  sale_revenue: string;
  category_tags: string;
  date_purchased: string;
  date_listed: string;
  date_of_sale: string;
  shipping_date: string;
  condition_code: string;
  has_condition_issue: boolean;
  condition_notes: string;
  notes: string;
};

function itemToDraft(item: InventoryItemDetail): DraftFields {
  return {
    description: item.description ?? "",
    status: item.status ?? "Draft",
    quantity: String(item.quantity ?? 1),
    purchase_cost: item.purchase_cost != null ? String(item.purchase_cost) : "",
    shipping_cost: item.shipping_cost != null ? String(item.shipping_cost) : "",
    sale_revenue: item.sale_revenue != null ? String(item.sale_revenue) : "",
    category_tags: item.category_tags ?? "",
    date_purchased: item.date_purchased ?? "",
    date_listed: item.date_listed ?? "",
    date_of_sale: item.date_of_sale ?? "",
    shipping_date: item.shipping_date ?? "",
    condition_code: item.condition_code ?? "",
    has_condition_issue: Boolean(item.has_condition_issue),
    condition_notes: item.condition_notes ?? "",
    notes: item.notes ?? "",
  };
}

function formatMoney(value: number | null | undefined): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value ?? 0);
}

function formatPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toFixed(1)}%`;
}

type InventoryDetailPanelProps = {
  item: InventoryItemDetail | null;
  busy: boolean;
  onItemUpdated: (item: InventoryItemDetail) => void;
  onError: (title: string, message: string, err?: unknown) => void;
  onSuccess: (title: string, message: string) => void;
  onReloadItem?: () => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
};

export function InventoryDetailPanel({
  item,
  busy,
  onItemUpdated,
  onError,
  onSuccess,
  onReloadItem,
  onDirtyChange,
}: InventoryDetailPanelProps) {
  const [draft, setDraft] = useState<DraftFields | null>(null);
  const [saving, setSaving] = useState(false);
  const [vendorPurchases, setVendorPurchases] = useState<VendorPurchase[]>([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [addBuyOpen, setAddBuyOpen] = useState(false);
  const [buyForm, setBuyForm] = useState({
    vendor_name: "",
    purchase_date: new Date().toISOString().slice(0, 10),
    purchase_price: "",
    shipping_price: "",
    reference_number: "",
    notes: "",
  });
  const [buyBusy, setBuyBusy] = useState(false);
  const [deleteBuyTarget, setDeleteBuyTarget] = useState<VendorPurchase | null>(null);
  const [recoveryApplied, setRecoveryApplied] = useState(false);

  useEffect(() => {
    setDraft(item ? itemToDraft(item) : null);
    setRecoveryApplied(false);
  }, [item]);

  const isDirty = useMemo(() => {
    if (!item || !draft) return false;
    return !formStatesEqual(draft, itemToDraft(item));
  }, [item, draft]);

  const { registerOnDiscard } = useUnsavedChanges();
  const { recovery, recoveryLabel, dismissRecovery, markDraftClean } = useEntityDraft({
    entityType: "inventory",
    entityId: item?.id ?? null,
    current: draft,
    entityVersion: item?.updated_at,
    isDirty,
    enabled: Boolean(item),
  });

  useEffect(() => {
    if (!item) return;
    return registerOnDiscard(() => {
      setDraft(itemToDraft(item));
      setRecoveryApplied(false);
    });
  }, [item, registerOnDiscard]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const loadVendorPurchases = useCallback(async (inventoryId: number) => {
    setPurchasesLoading(true);
    try {
      const response = await fetch(`/api/purchases?inventory_id=${inventoryId}&limit=50`, {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
        items?: VendorPurchase[];
      };
      if (!response.ok) throw data;
      setVendorPurchases(data.items ?? []);
    } catch (err) {
      onError("Could not load vendor purchases", "We could not load where-you-bought records.", err);
      setVendorPurchases([]);
    } finally {
      setPurchasesLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    if (!item?.id) {
      setVendorPurchases([]);
      return;
    }
    void loadVendorPurchases(item.id);
  }, [item?.id, loadVendorPurchases]);

  const vendorRollup = useMemo(() => {
    return vendorPurchases.reduce(
      (sum, row) => sum + (row.purchase_price ?? 0) + (row.shipping_price ?? 0),
      0
    );
  }, [vendorPurchases]);

  const showProfitability =
    item &&
    (item.status === "Sold" || (Number(item.sale_revenue ?? 0) > 0));

  const saveChanges = async () => {
    if (!item || !draft) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        description: draft.description.trim() || null,
        status: draft.status,
        quantity: Number(draft.quantity) || 1,
        purchase_cost: draft.purchase_cost === "" ? null : Number(draft.purchase_cost),
        shipping_cost: draft.shipping_cost === "" ? null : Number(draft.shipping_cost),
        sale_revenue: draft.sale_revenue === "" ? null : Number(draft.sale_revenue),
        category_tags: draft.category_tags.trim() || null,
        date_purchased: draft.date_purchased || null,
        date_listed: draft.date_listed || null,
        date_of_sale: draft.date_of_sale || null,
        shipping_date: draft.shipping_date || null,
        condition_code: draft.condition_code || null,
        has_condition_issue: draft.has_condition_issue ? 1 : 0,
        condition_notes: draft.condition_notes.trim() || null,
        notes: draft.notes.trim() || null,
      };
      const response = await apiFetch(`/api/inventory/${item.id}`, {
        method: "PATCH",
        headers: patchHeaders(item.updated_at),
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
        item?: InventoryItemDetail;
      };
      if (!response.ok) {
        if (response.status === 409 && isStaleConflictPayload(data)) {
          if (onReloadItem) await onReloadItem();
          onError(
            "Record changed elsewhere",
            "This item was modified in another tab. We reloaded the latest version — re-apply your changes and save again.",
            data
          );
          return;
        }
        throw data;
      }
      if (data.item) {
        onItemUpdated(data.item);
        setDraft(itemToDraft(data.item));
        markDraftClean();
      }
      onSuccess("Item updated", "Inventory details were saved.");
    } catch (err) {
      if (err instanceof MutationQueuedError) {
        onSuccess("Saved locally", err.message);
        return;
      }
      if (err instanceof MutationQueueFullError) {
        onError("Too many pending changes", err.message, err);
        return;
      }
      onError("Could not save item", "We could not save inventory changes.", err);
    } finally {
      setSaving(false);
    }
  };

  const addVendorBuy = async () => {
    if (!item || !buyForm.vendor_name.trim()) return;
    setBuyBusy(true);
    try {
      const response = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          inventory_id: item.id,
          vendor_name: buyForm.vendor_name.trim(),
          purchase_date: buyForm.purchase_date || null,
          purchase_price: buyForm.purchase_price === "" ? null : Number(buyForm.purchase_price),
          shipping_price: buyForm.shipping_price === "" ? null : Number(buyForm.shipping_price),
          reference_number: buyForm.reference_number.trim() || null,
          notes: buyForm.notes.trim() || null,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
      if (!response.ok) throw data;
      setAddBuyOpen(false);
      setBuyForm({
        vendor_name: "",
        purchase_date: new Date().toISOString().slice(0, 10),
        purchase_price: "",
        shipping_price: "",
        reference_number: "",
        notes: "",
      });
      await loadVendorPurchases(item.id);
      onSuccess("Vendor purchase added", "Where-you-bought record was saved.");
    } catch (err) {
      onError("Could not add vendor purchase", "We could not save the vendor purchase.", err);
    } finally {
      setBuyBusy(false);
    }
  };

  const deleteVendorBuy = async () => {
    if (!deleteBuyTarget || !item) return;
    setBuyBusy(true);
    try {
      const response = await fetch(`/api/purchases/${deleteBuyTarget.id}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      if (!response.ok && response.status !== 204) {
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
        throw data;
      }
      setDeleteBuyTarget(null);
      await loadVendorPurchases(item.id);
      onSuccess("Vendor purchase removed", "The vendor purchase record was deleted.");
    } catch (err) {
      onError("Could not delete vendor purchase", "We could not delete that record.", err);
    } finally {
      setBuyBusy(false);
    }
  };

  if (!item || !draft) {
    return (
      <div className="mb-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
        <p className="text-sm text-[var(--ui-muted)]">Select an inventory item to view and edit details.</p>
      </div>
    );
  }

  const inputClass = "w-full";
  const showRecovery =
    recovery && recoveryLabel && !recoveryApplied && !isDirty;

  return (
    <div className="mb-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
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
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-[var(--ui-title)]">
            Item detail — {item.item_number ?? `#${item.id}`}
          </h4>
          <p className="text-xs text-[var(--ui-muted)]">
            Item ID {item.id}
            {item.etsy_listing_id ? ` · Etsy listing ${item.etsy_listing_id}` : ""}
            {item.updated_at ? ` · Updated ${new Date(item.updated_at).toLocaleString()}` : ""}
          </p>
        </div>
        <Badge
          label={item.is_listed ? "Listed on Etsy" : "Not listed"}
          variant={item.is_listed ? "success" : "neutral"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Identity</p>
          <FormField label="Item number">
            <TextInput value={item.item_number ?? ""} onChange={() => {}} disabled className={inputClass} />
          </FormField>
          <FormField label="Description">
            <textarea
              value={draft.description}
              onChange={(e) => setDraft((c) => ({ ...c!, description: e.target.value }))}
              rows={3}
              disabled={busy || saving}
              className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm text-[var(--ui-title)]"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Status">
              <SelectInput
                value={draft.status}
                onChange={(v) => setDraft((c) => ({ ...c!, status: v }))}
                options={STATUSES.map((s) => ({ value: s, label: s }))}
                disabled={busy || saving}
              />
            </FormField>
            <FormField label="Quantity">
              <TextInput
                type="number"
                value={draft.quantity}
                onChange={(v) => setDraft((c) => ({ ...c!, quantity: v }))}
                disabled={busy || saving}
                className={inputClass}
              />
            </FormField>
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Financials</p>
          <div className="grid grid-cols-2 gap-2">
            <FormField
              label="Purchase cost"
              helpText="What you paid to acquire this item from the vendor (not including shipping to you)."
            >
              <TextInput type="number" value={draft.purchase_cost} onChange={(v) => setDraft((c) => ({ ...c!, purchase_cost: v }))} disabled={busy || saving} className={inputClass} />
            </FormField>
            <FormField
              label="Inbound shipping"
              helpText="Your cost to receive this item from the vendor/seller."
            >
              <TextInput type="number" value={draft.shipping_cost} onChange={(v) => setDraft((c) => ({ ...c!, shipping_cost: v }))} disabled={busy || saving} className={inputClass} />
            </FormField>
            <FormField
              label="Sale price"
              helpText="The price the buyer paid (or will pay) for this item."
            >
              <TextInput type="number" value={draft.sale_revenue} onChange={(v) => setDraft((c) => ({ ...c!, sale_revenue: v }))} disabled={busy || saving} className={inputClass} />
            </FormField>
            <FormField
              label="Category / tags"
              helpText="Comma-separated tags for organizing inventory (e.g., 'glassware, depression era, pink')."
            >
              <TextInput value={draft.category_tags} onChange={(v) => setDraft((c) => ({ ...c!, category_tags: v }))} disabled={busy || saving} className={inputClass} />
            </FormField>
          </div>
          {(showProfitability || (item.total_cost != null && item.total_cost > 0)) && (
            <div className="rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-xs text-[var(--ui-body)]">
              <span className="font-medium text-[var(--ui-title)]">Profitability: </span>
              Total cost {formatMoney(item.total_cost)}
              {showProfitability ? (
                <>
                  {" · "}Net profit{" "}
                  <span className={Number(item.net_profit ?? 0) >= 0 ? "text-[var(--ui-green)]" : "text-[var(--ui-red)]"}>
                    {formatMoney(item.net_profit)}
                  </span>
                  {" · "}Margin {formatPct(item.margin_pct)}
                  {" · "}ROI {formatPct(item.roi_pct)}
                </>
              ) : null}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Dates</p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["date_purchased", "Date purchased"],
                ["date_listed", "Date listed"],
                ["date_of_sale", "Date sold"],
                ["shipping_date", "Date shipped"],
              ] as const
            ).map(([key, label]) => (
              <FormField key={key} label={label}>
                <input
                  type="date"
                  value={draft[key]}
                  onChange={(e) => setDraft((c) => ({ ...c!, [key]: e.target.value }))}
                  disabled={busy || saving}
                  className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm"
                />
              </FormField>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Condition</p>
          <FormField
            label="Condition"
            helpText="Rate the item's physical condition using standard vintage/antique grading terms."
          >
            <SelectInput
              value={draft.condition_code}
              onChange={(v) => setDraft((c) => ({ ...c!, condition_code: v }))}
              options={[{ value: "", label: "—" }, ...CONDITIONS.map((c) => ({ value: c, label: c }))]}
              disabled={busy || saving}
            />
          </FormField>
          <label className="flex items-center gap-2 text-sm text-[var(--ui-body)]">
            <input
              type="checkbox"
              checked={draft.has_condition_issue}
              onChange={(e) => setDraft((c) => ({ ...c!, has_condition_issue: e.target.checked }))}
              disabled={busy || saving}
            />
            Has condition issue
          </label>
          <FormField label="Condition notes">
            <textarea
              value={draft.condition_notes}
              onChange={(e) => setDraft((c) => ({ ...c!, condition_notes: e.target.value }))}
              rows={2}
              disabled={busy || saving}
              className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm"
            />
          </FormField>
          <FormField label="Internal notes">
            <textarea
              value={draft.notes}
              onChange={(e) => setDraft((c) => ({ ...c!, notes: e.target.value }))}
              rows={2}
              disabled={busy || saving}
              className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm"
            />
          </FormField>
        </section>
      </div>

      <section className="mt-4 border-t border-[var(--ui-border)] pt-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h5 className="text-sm font-semibold text-[var(--ui-title)]">Where I bought this</h5>
            {vendorPurchases.length > 0 ? (
              <p className="text-xs text-[var(--ui-muted)]">
                Vendor total {formatMoney(vendorRollup)}
                {item.purchase_cost != null ? ` · Inventory purchase cost ${formatMoney(item.purchase_cost)}` : ""}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setAddBuyOpen(true)}
            disabled={busy || saving || buyBusy}
            className="rounded-lg border border-[var(--ui-border)] px-2 py-1 text-xs disabled:opacity-60"
          >
            + Add buy
          </button>
        </div>
        {purchasesLoading ? (
          <p className="text-xs text-[var(--ui-muted)]">Loading vendor purchases…</p>
        ) : vendorPurchases.length === 0 ? (
          <EmptyState
            message="No vendor purchases recorded. Add where you bought this item."
            primaryAction={{ label: "Add buy", onClick: () => setAddBuyOpen(true) }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[var(--ui-muted)]">
                  <th className="py-1 pr-2">Date</th>
                  <th className="py-1 pr-2">Vendor</th>
                  <th className="py-1 pr-2">Price</th>
                  <th className="py-1 pr-2">Ship</th>
                  <th className="py-1 pr-2">Ref #</th>
                  <th className="py-1 w-16" />
                </tr>
              </thead>
              <tbody>
                {vendorPurchases.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--ui-border)]/60">
                    <td className="py-1 pr-2">{row.purchase_date ?? "—"}</td>
                    <td className="py-1 pr-2">{row.vendor_name ?? "—"}</td>
                    <td className="py-1 pr-2">{formatMoney(row.purchase_price)}</td>
                    <td className="py-1 pr-2">{formatMoney(row.shipping_price)}</td>
                    <td className="py-1 pr-2">{row.reference_number ?? "—"}</td>
                    <td className="py-1">
                      <button
                        type="button"
                        onClick={() => setDeleteBuyTarget(row)}
                        className="text-[var(--ui-red)]"
                        disabled={buyBusy}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-4 flex justify-end">
        <Button variant="accent" onClick={() => void saveChanges()} disabled={busy || saving || !isDirty}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>

      <div className="mt-4 border-t border-[var(--ui-border)] pt-4">
        <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
          Recent activity
        </h5>
        <ActivityTimeline entityType="inventory" entityId={item.id} />
      </div>

      {addBuyOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5">
            <h4 className="mb-3 text-lg font-semibold text-[var(--ui-title)]">Add vendor purchase</h4>
            <FormField label="Vendor name">
              <TextInput value={buyForm.vendor_name} onChange={(v) => setBuyForm((c) => ({ ...c, vendor_name: v }))} className={inputClass} />
            </FormField>
            <FormField label="Purchase date">
              <input type="date" value={buyForm.purchase_date} onChange={(e) => setBuyForm((c) => ({ ...c, purchase_date: e.target.value }))} className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm" />
            </FormField>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <FormField label="Purchase price">
                <TextInput type="number" value={buyForm.purchase_price} onChange={(v) => setBuyForm((c) => ({ ...c, purchase_price: v }))} className={inputClass} />
              </FormField>
              <FormField label="Shipping">
                <TextInput type="number" value={buyForm.shipping_price} onChange={(v) => setBuyForm((c) => ({ ...c, shipping_price: v }))} className={inputClass} />
              </FormField>
            </div>
            <FormField label="Reference #">
              <TextInput value={buyForm.reference_number} onChange={(v) => setBuyForm((c) => ({ ...c, reference_number: v }))} className={inputClass} />
            </FormField>
            <FormField label="Notes">
              <textarea value={buyForm.notes} onChange={(e) => setBuyForm((c) => ({ ...c, notes: e.target.value }))} rows={2} className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm" />
            </FormField>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAddBuyOpen(false)}>Cancel</Button>
              <Button variant="accent" onClick={() => void addVendorBuy()} disabled={buyBusy || !buyForm.vendor_name.trim()}>
                {buyBusy ? "Saving…" : "Add buy"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleteBuyTarget != null}
        onClose={() => setDeleteBuyTarget(null)}
        onConfirm={() => void deleteVendorBuy()}
        title="Delete vendor purchase?"
        description="Remove this where-you-bought record?"
        confirmLabel="Delete"
        confirmVariant="danger"
        busy={buyBusy}
      />
    </div>
  );
}
