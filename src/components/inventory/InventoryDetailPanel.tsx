"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { formatCurrency } from "@/lib/format-currency";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DraftRecoveryBanner } from "@/components/ui/DraftRecoveryBanner";
import { ActivityTimeline } from "@/components/activity/ActivityTimeline";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, SelectInput, TextInput } from "@/components/ui/FormField";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";
import { pickChangedFields, useUndoRedo } from "@/context/UndoRedoContext";
import { useEntityDraft } from "@/hooks/useEntityDraft";
import { formStatesEqual } from "@/lib/deep-equal-form";
import { MutationQueueFullError } from "@/lib/api-fetch";
import { OtherCostsManager } from "@/components/inventory/OtherCostsManager";
import { VendorPicker } from "@/components/ui/VendorPicker";
import TaxonomyCategoryPicker from "@/components/etsy/TaxonomyCategoryPicker";
import type { ApiErrorShape, InventoryItem } from "@/types";

const STATUSES = ["Draft", "In stock", "Listed", "Sold", "Reserved", "Retired"] as const;
const CONDITIONS = ["Mint/Near Mint", "Excellent", "Very Good", "Good", "Fair/As-Is"] as const;
const WHEN_MADE_OPTIONS = [
  { value: "", label: "—" },
  { value: "made_to_order", label: "Made to order" },
  { value: "2020_2026", label: "2020–2026" },
  { value: "2010_2019", label: "2010–2019" },
  { value: "2004_2009", label: "2004–2009" },
  { value: "2000_2003", label: "2000–2003" },
  { value: "1990s", label: "1990s" },
  { value: "1980s", label: "1980s" },
  { value: "1970s", label: "1970s" },
  { value: "1960s", label: "1960s" },
  { value: "1950s", label: "1950s" },
  { value: "1940s", label: "1940s" },
  { value: "1930s", label: "1930s" },
  { value: "1920s", label: "1920s" },
  { value: "1910s", label: "1910s" },
  { value: "1900s", label: "1900s" },
  { value: "1800s", label: "1800s" },
  { value: "1700s", label: "1700s" },
  { value: "before_1700", label: "Before 1700" },
] as const;
const WEIGHT_UNITS = [
  { value: "", label: "—" },
  { value: "oz", label: "oz" },
  { value: "lb", label: "lb" },
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
] as const;
const DIMENSION_UNITS = [
  { value: "", label: "—" },
  { value: "in", label: "in" },
  { value: "ft", label: "ft" },
  { value: "mm", label: "mm" },
  { value: "cm", label: "cm" },
  { value: "m", label: "m" },
] as const;

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
  vendor_id: number | null;
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
  store_category: string;
  date_purchased: string;
  date_listed: string;
  date_of_sale: string;
  shipping_date: string;
  condition_code: string;
  has_condition_issue: boolean;
  condition_notes: string;
  notes: string;
  etsy_when_made: string;
  etsy_taxonomy_id: string;
  listing_category_path: string;
  materials: string;
  item_weight: string;
  item_weight_unit: string;
  item_length: string;
  item_width: string;
  item_height: string;
  item_dimensions_unit: string;
  is_supply: boolean;
  listing_title: string;
  listing_description: string;
  listing_tags: string;
  listing_title_strategy: string;
  listing_product_story: string;
  listing_condition_clarity: string;
  listing_attributes: string;
  listing_pricing_shipping_notes: string;
  listing_quality_checklist: string;
};

function materialsToDisplay(json: string | null): string {
  if (!json) return "";
  try {
    const arr: unknown = JSON.parse(json);
    return Array.isArray(arr) ? arr.join(", ") : json;
  } catch {
    return json;
  }
}

function displayToMaterialsJson(display: string): string | null {
  const trimmed = display.trim();
  if (!trimmed) return null;
  const arr = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  return JSON.stringify(arr);
}

function itemToDraft(item: InventoryItemDetail): DraftFields {
  return {
    description: item.description ?? "",
    status: item.status ?? "Draft",
    quantity: String(item.quantity ?? 1),
    purchase_cost: item.purchase_cost != null ? String(item.purchase_cost) : "",
    shipping_cost: item.shipping_cost != null ? String(item.shipping_cost) : "",
    sale_revenue: item.sale_revenue != null ? String(item.sale_revenue) : "",
    category_tags: item.category_tags ?? "",
    store_category: item.store_category ?? "",
    date_purchased: item.date_purchased ?? "",
    date_listed: item.date_listed ?? "",
    date_of_sale: item.date_of_sale ?? "",
    shipping_date: item.shipping_date ?? "",
    condition_code: item.condition_code ?? "",
    has_condition_issue: Boolean(item.has_condition_issue),
    condition_notes: item.condition_notes ?? "",
    notes: item.notes ?? "",
    etsy_when_made: item.etsy_when_made ?? "",
    etsy_taxonomy_id: item.etsy_taxonomy_id != null ? String(item.etsy_taxonomy_id) : "",
    listing_category_path: item.listing_category_path ?? "",
    materials: materialsToDisplay(item.materials),
    item_weight: item.item_weight != null ? String(item.item_weight) : "",
    item_weight_unit: item.item_weight_unit ?? "",
    item_length: item.item_length != null ? String(item.item_length) : "",
    item_width: item.item_width != null ? String(item.item_width) : "",
    item_height: item.item_height != null ? String(item.item_height) : "",
    item_dimensions_unit: item.item_dimensions_unit ?? "",
    is_supply: Boolean(item.is_supply),
    listing_title: item.listing_title ?? "",
    listing_description: item.listing_description ?? "",
    listing_tags: item.listing_tags ?? "",
    listing_title_strategy: item.listing_title_strategy ?? "",
    listing_product_story: item.listing_product_story ?? "",
    listing_condition_clarity: item.listing_condition_clarity ?? "",
    listing_attributes: item.listing_attributes ?? "",
    listing_pricing_shipping_notes: item.listing_pricing_shipping_notes ?? "",
    listing_quality_checklist: item.listing_quality_checklist ?? "",
  };
}

function formatMoney(value: number | null | undefined, currCode = "USD"): string {
  return formatCurrency(value ?? 0, currCode);
}

function formatPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toFixed(1)}%`;
}

type PhaseInfo = { label: string; className: string };

const PHASE_DISPLAY: Record<string, PhaseInfo> = {
  needs_data: { label: "Needs data", className: "text-[var(--ui-yellow)]" },
  ready_to_generate: { label: "Ready to generate", className: "text-[var(--ui-accent)]" },
  generated: { label: "Generated", className: "text-[var(--ui-body)]" },
  needs_quality_remediation: { label: "Needs quality fixes", className: "text-[var(--ui-yellow)]" },
  listing_ready: { label: "Listing ready", className: "text-[var(--ui-green)]" },
};

type RemediationItem = {
  field: string;
  label: string;
  present: boolean;
  required: boolean;
  shortcoming: string;
  resolution_link: string;
};

type ReadinessResponse = {
  ok: boolean;
  listing_phase: string;
  button: { label: string; action: "evaluate_data" | "generate" | "evaluate_quality" };
  data_remediation: RemediationItem[];
};

type QualityRemediation = {
  category?: string;
  ref?: string;
  shortcoming: string;
  mitigation?: string;
  weight?: number;
  resolution_link?: string;
};

type QualityCategory = { name: string; earned: number; possible: number };

type QualityResult = {
  score: number;
  passed: boolean;
  target: number;
  categories?: QualityCategory[];
  quality_remediation: QualityRemediation[];
  photo_ai_evaluated?: boolean;
};

/**
 * One context-aware listing button + remediation panels (ADR-081 §3/§4).
 * Generation reuses the parent's handler; quality evaluation calls the
 * listing-quality endpoint directly.
 */
function ListingLifecycleControls({
  itemId,
  updatedAt,
  busy,
  onRegenerateAi,
  regenerateAiBusy,
  onReloadItem,
  onError,
}: {
  itemId: number;
  updatedAt: string | null;
  busy: boolean;
  onRegenerateAi?: () => void;
  regenerateAiBusy?: boolean;
  onReloadItem?: () => Promise<void>;
  onError: (title: string, message: string, err?: unknown) => void;
}) {
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [showData, setShowData] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [quality, setQuality] = useState<QualityResult | null>(null);

  const loadReadiness = useCallback(async () => {
    try {
      const res = await fetch(`/api/inventory/${itemId}/listing-readiness`, {
        headers: { Accept: "application/json" },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) setReadiness(data as ReadinessResponse);
    } catch {
      /* readiness is advisory; ignore transient errors */
    }
  }, [itemId]);

  useEffect(() => {
    setShowData(false);
    setQuality(null);
    void loadReadiness();
  }, [loadReadiness, updatedAt]);

  const runQuality = useCallback(async () => {
    setEvaluating(true);
    try {
      const res = await fetch(`/api/inventory/${itemId}/listing-quality`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        onError(
          "Quality evaluation",
          data?.error?.user_message ?? "We could not evaluate listing quality."
        );
      } else {
        setQuality(data as QualityResult);
        if (onReloadItem) await onReloadItem();
        else await loadReadiness();
      }
    } catch (err) {
      onError("Quality evaluation", "We could not evaluate listing quality.", err);
    } finally {
      setEvaluating(false);
    }
  }, [itemId, onError, onReloadItem, loadReadiness]);

  if (!readiness) return null;

  const phase =
    PHASE_DISPLAY[readiness.listing_phase] ?? {
      label: readiness.listing_phase,
      className: "text-[var(--ui-muted)]",
    };
  const action = readiness.button.action;
  const buttonBusy =
    action === "generate" ? regenerateAiBusy : action === "evaluate_quality" ? evaluating : false;
  const onClick = () => {
    if (action === "evaluate_data") setShowData((s) => !s);
    else if (action === "generate") onRegenerateAi?.();
    else void runQuality();
  };

  return (
    <div className="mb-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-[var(--ui-muted)]">Listing phase</span>
          <span className={`text-sm font-semibold ${phase.className}`}>{phase.label}</span>
        </div>
        <Button
          variant="accent"
          size="sm"
          onClick={onClick}
          busy={buttonBusy}
          disabled={busy || (action === "generate" && !onRegenerateAi)}
        >
          {readiness.button.label}
        </Button>
      </div>

      {action === "evaluate_data" && showData ? (
        <ul className="mt-3 space-y-1.5">
          {readiness.data_remediation.map((r) => (
            <li
              key={r.field}
              className="flex items-start justify-between gap-3 text-sm"
            >
              <span className="flex items-center gap-2">
                <span
                  className={
                    r.present
                      ? "text-[var(--ui-green)]"
                      : r.required
                        ? "text-[var(--ui-red)]"
                        : "text-[var(--ui-muted)]"
                  }
                  aria-hidden
                >
                  {r.present ? "✓" : r.required ? "✗" : "•"}
                </span>
                <span
                  className={
                    !r.present && r.required
                      ? "font-medium text-[var(--ui-title)]"
                      : "text-[var(--ui-body)]"
                  }
                >
                  {r.label}
                  {r.required ? "" : " (recommended)"}
                  {!r.present ? (
                    <span className="block text-xs text-[var(--ui-muted)]">{r.shortcoming}</span>
                  ) : null}
                </span>
              </span>
              {!r.present ? (
                <a
                  href={r.resolution_link}
                  className="shrink-0 text-xs font-medium text-[var(--ui-accent)] hover:underline"
                >
                  Fix →
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {quality ? (
        <div className="mt-3 border-t border-[var(--ui-border)] pt-3">
          <p className="text-sm">
            <span className="text-[var(--ui-muted)]">Quality score: </span>
            <span
              className={`font-semibold ${
                quality.passed ? "text-[var(--ui-green)]" : "text-[var(--ui-yellow)]"
              }`}
            >
              {quality.score}
            </span>
            <span className="text-[var(--ui-muted)]">
              {" "}
              / 100 {quality.target ? `(target ${quality.target})` : ""}
            </span>
          </p>
          {quality.categories && quality.categories.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {quality.categories.map((c) => (
                <span
                  key={c.name}
                  className="rounded border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-2 py-0.5 text-xs capitalize text-[var(--ui-body)]"
                >
                  {c.name}: {c.earned}/{c.possible}
                </span>
              ))}
            </div>
          ) : null}
          {quality.photo_ai_evaluated === false ? (
            <p className="mt-2 text-xs text-[var(--ui-muted)]">
              Per-photo AI review pending — photo score is provisional.
            </p>
          ) : null}
          {quality.quality_remediation.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {quality.quality_remediation.map((q, idx) => (
                <li key={`${q.ref ?? "item"}-${idx}`} className="text-sm text-[var(--ui-body)]">
                  <span className="font-medium text-[var(--ui-title)]">{q.shortcoming}</span>
                  {q.mitigation ? (
                    <span className="block text-xs text-[var(--ui-muted)]">{q.mitigation}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-[var(--ui-muted)]">No outstanding quality items.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

type InventoryDetailPanelProps = {
  item: InventoryItemDetail | null;
  busy: boolean;
  onItemUpdated: (item: InventoryItemDetail) => void;
  onError: (title: string, message: string, err?: unknown) => void;
  onSuccess: (title: string, message: string) => void;
  onReloadItem?: () => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  onRegenerateAi?: () => void;
  regenerateAiBusy?: boolean;
};

export function InventoryDetailPanel({
  item,
  busy,
  onItemUpdated,
  onError,
  onSuccess,
  onReloadItem,
  onDirtyChange,
  onRegenerateAi,
  regenerateAiBusy,
}: InventoryDetailPanelProps) {
  const { currencyCode } = useApp();
  const fmtMoney = (v: number | null | undefined) => formatMoney(v, currencyCode);
  const [draft, setDraft] = useState<DraftFields | null>(null);
  const [saving, setSaving] = useState(false);
  const [storeCategoryList, setStoreCategoryList] = useState<string[]>([]);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(
          `/api/settings/${encodeURIComponent("inventory.store_categories")}`,
          { headers: { Accept: "application/json" } }
        );
        if (res.ok) {
          const data = (await res.json()) as { value?: string };
          setStoreCategoryList(
            (data.value ?? "").split(",").map((s) => s.trim()).filter(Boolean)
          );
        }
      } catch { /* categories optional */ }
    })();
  }, []);

  const addNewCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    const updated = [...storeCategoryList, name];
    setStoreCategoryList(updated);
    setDraft((c) => (c ? { ...c, store_category: name } : c));
    setAddingCategory(false);
    setNewCategoryName("");
    try {
      await fetch(`/api/settings/${encodeURIComponent("inventory.store_categories")}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ value: updated.join(",") }),
      });
    } catch { /* best-effort save */ }
  };
  const [vendorPurchases, setVendorPurchases] = useState<VendorPurchase[]>([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [addBuyOpen, setAddBuyOpen] = useState(false);
  const [buyForm, setBuyForm] = useState({
    vendor_id: null as number | null,
    vendor_name: "",
    purchase_date: new Date().toISOString().slice(0, 10),
    purchase_price: "",
    shipping_price: "",
    reference_number: "",
    notes: "",
  });
  const [buyBusy, setBuyBusy] = useState(false);
  const [deleteBuyTarget, setDeleteBuyTarget] = useState<VendorPurchase | null>(null);
  const [editBuyTarget, setEditBuyTarget] = useState<VendorPurchase | null>(null);
  const [editBuyForm, setEditBuyForm] = useState({
    vendor_id: null as number | null,
    vendor_name: "",
    purchase_date: "",
    purchase_price: "",
    shipping_price: "",
    reference_number: "",
    notes: "",
  });
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
  const { patchWithUndo } = useUndoRedo();
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

  const loadVendorPurchases = useCallback(
    async (inventoryId: number) => {
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
        onError(
          "Could not load vendor purchases",
          "We could not load where-you-bought records.",
          err
        );
        setVendorPurchases([]);
      } finally {
        setPurchasesLoading(false);
      }
    },
    [onError]
  );

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

  const showProfitability = item && (item.status === "Sold" || Number(item.sale_revenue ?? 0) > 0);

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
        store_category: draft.store_category.trim() || null,
        date_purchased: draft.date_purchased || null,
        date_listed: draft.date_listed || null,
        date_of_sale: draft.date_of_sale || null,
        shipping_date: draft.shipping_date || null,
        condition_code: draft.condition_code || null,
        has_condition_issue: draft.has_condition_issue ? 1 : 0,
        condition_notes: draft.condition_notes.trim() || null,
        notes: draft.notes.trim() || null,
        etsy_when_made: draft.etsy_when_made || null,
        etsy_taxonomy_id: draft.etsy_taxonomy_id === "" ? null : Number(draft.etsy_taxonomy_id),
        listing_category_path: draft.listing_category_path.trim() || null,
        listing_title: draft.listing_title.trim() || null,
        listing_description: draft.listing_description.trim() || null,
        listing_tags: draft.listing_tags.trim() || null,
        listing_title_strategy: draft.listing_title_strategy.trim() || null,
        listing_product_story: draft.listing_product_story.trim() || null,
        listing_condition_clarity: draft.listing_condition_clarity.trim() || null,
        listing_attributes: draft.listing_attributes.trim() || null,
        listing_pricing_shipping_notes: draft.listing_pricing_shipping_notes.trim() || null,
        listing_quality_checklist: draft.listing_quality_checklist.trim() || null,
        materials: displayToMaterialsJson(draft.materials),
        item_weight: draft.item_weight === "" ? null : Number(draft.item_weight),
        item_weight_unit: draft.item_weight_unit || null,
        item_length: draft.item_length === "" ? null : Number(draft.item_length),
        item_width: draft.item_width === "" ? null : Number(draft.item_width),
        item_height: draft.item_height === "" ? null : Number(draft.item_height),
        item_dimensions_unit: draft.item_dimensions_unit || null,
        is_supply: draft.is_supply ? 1 : 0,
      };
      const { previousState, newState } = pickChangedFields(
        item as unknown as Record<string, unknown>,
        body
      );
      const result = await patchWithUndo({
        action: "Updated inventory details",
        entity: "inventory",
        id: item.id,
        updatedAt: item.updated_at,
        previousState,
        newState,
        pickRecord: (data) => (data.item as InventoryItemDetail | undefined) ?? null,
        onPatched: (record) => {
          onItemUpdated(record);
          setDraft(itemToDraft(record));
        },
      });
      if (result.status === "stale") {
        if (onReloadItem) await onReloadItem();
        onError(
          "Record changed elsewhere",
          "This item was modified in another tab. We reloaded the latest version — re-apply your changes and save again."
        );
        return;
      }
      if (result.status === "error") {
        throw new Error(result.message);
      }
      markDraftClean();
      onSuccess("Item updated", "Inventory details were saved.");
    } catch (err) {
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
    if (!item || (!buyForm.vendor_id && !buyForm.vendor_name.trim())) return;
    setBuyBusy(true);
    try {
      const response = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          inventory_id: item.id,
          vendor_id: buyForm.vendor_id ?? undefined,
          vendor_name: buyForm.vendor_name.trim() || null,
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
        vendor_id: null,
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

  const openEditBuy = (row: VendorPurchase) => {
    setEditBuyTarget(row);
    setEditBuyForm({
      vendor_id: row.vendor_id ?? null,
      vendor_name: row.vendor_name ?? "",
      purchase_date: row.purchase_date ?? "",
      purchase_price: row.purchase_price != null ? String(row.purchase_price) : "",
      shipping_price: row.shipping_price != null ? String(row.shipping_price) : "",
      reference_number: row.reference_number ?? "",
      notes: row.notes ?? "",
    });
  };

  const saveVendorBuy = async () => {
    if (!editBuyTarget || !item) return;
    setBuyBusy(true);
    try {
      const response = await fetch(`/api/purchases/${editBuyTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          vendor_id: editBuyForm.vendor_id ?? null,
          vendor_name: editBuyForm.vendor_name.trim() || null,
          purchase_date: editBuyForm.purchase_date || null,
          purchase_price: editBuyForm.purchase_price === "" ? null : Number(editBuyForm.purchase_price),
          shipping_price: editBuyForm.shipping_price === "" ? null : Number(editBuyForm.shipping_price),
          reference_number: editBuyForm.reference_number.trim() || null,
          notes: editBuyForm.notes.trim() || null,
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
        throw data;
      }
      setEditBuyTarget(null);
      await loadVendorPurchases(item.id);
      onSuccess("Vendor purchase updated", "The vendor purchase record was saved.");
    } catch (err) {
      onError("Could not update vendor purchase", "We could not save the changes.", err);
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
        <p className="text-sm text-[var(--ui-muted)]">
          Select an inventory item to view and edit details.
        </p>
      </div>
    );
  }

  const inputClass = "w-full";
  const showRecovery = recovery && recoveryLabel && !recoveryApplied && !isDirty;

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
            {item.etsy_listing_id ? (
              <>
                {" · Etsy listing "}
                <a
                  href={`https://www.etsy.com/listing/${item.etsy_listing_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--ui-accent)] hover:underline"
                >
                  {item.etsy_listing_id}
                </a>
              </>
            ) : ""}
            {item.created_at ? ` · Created ${new Date(item.created_at).toLocaleString()}` : ""}
            {item.updated_at ? ` · Updated ${new Date(item.updated_at).toLocaleString()}` : ""}
          </p>
        </div>
        <Badge
          label={item.is_listed ? "Listed on Etsy" : "Not listed"}
          variant={item.is_listed ? "success" : "neutral"}
        />
      </div>

      <p className="mb-2 text-xs text-[var(--ui-muted)]">
        <span className="text-[var(--ui-red)]">*</span> Required field
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
            Identity
          </p>
          <FormField label="Item number">
            <TextInput
              value={item.item_number ?? ""}
              onChange={() => {}}
              disabled
              className={inputClass}
            />
          </FormField>
          <FormField label="Description" required>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft((c) => ({ ...c!, description: e.target.value }))}
              rows={3}
              disabled={busy || saving}
              spellCheck
              className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm text-[var(--ui-title)]"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Status" helpText="Current inventory status of this item." required>
              <SelectInput
                value={draft.status}
                onChange={(v) => setDraft((c) => ({ ...c!, status: v }))}
                options={STATUSES.map((s) => ({ value: s, label: s }))}
                disabled={busy || saving}
              />
            </FormField>
            <FormField label="Quantity" helpText="Number of units available for this item.">
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
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
            Financials
          </p>
          <div className="grid grid-cols-2 gap-2">
            <FormField
              label="Purchase cost"
              helpText="What you paid to acquire this item from the vendor (not including shipping to you)."
            >
              <TextInput
                type="number"
                value={draft.purchase_cost}
                onChange={(v) => setDraft((c) => ({ ...c!, purchase_cost: v }))}
                disabled={busy || saving}
                className={inputClass}
              />
            </FormField>
            <FormField
              label="Shipping cost (inbound)"
              helpText="Your cost to receive this item from the vendor/seller."
            >
              <TextInput
                type="number"
                value={draft.shipping_cost}
                onChange={(v) => setDraft((c) => ({ ...c!, shipping_cost: v }))}
                disabled={busy || saving}
                className={inputClass}
              />
            </FormField>
            <FormField
              label="Sale price"
              helpText="The price the buyer paid (or will pay) for this item."
              required
            >
              <TextInput
                type="number"
                value={draft.sale_revenue}
                onChange={(v) => setDraft((c) => ({ ...c!, sale_revenue: v }))}
                disabled={busy || saving}
                className={inputClass}
              />
            </FormField>
            <FormField
              label="Category / tags"
              helpText="Comma-separated tags for organizing inventory (e.g., 'glassware, depression era, pink')."
            >
              <TextInput
                value={draft.category_tags}
                onChange={(v) => setDraft((c) => ({ ...c!, category_tags: v }))}
                disabled={busy || saving}
                className={inputClass}
              />
            </FormField>
            <FormField
              label="Store category"
              helpText="Your internal category for grouping and reporting."
            >
              {addingCategory ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); void addNewCategory(); }
                      if (e.key === "Escape") { setAddingCategory(false); setNewCategoryName(""); }
                    }}
                    placeholder="New category name"
                    className="flex-1 rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm text-[var(--ui-title)]"
                  />
                  <Button variant="accent" size="sm" onClick={() => void addNewCategory()} disabled={!newCategoryName.trim()}>
                    Add
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setAddingCategory(false); setNewCategoryName(""); }}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <select
                  value={draft.store_category}
                  onChange={(e) => {
                    if (e.target.value === "__add_new__") {
                      setAddingCategory(true);
                    } else {
                      setDraft((c) => ({ ...c!, store_category: e.target.value }));
                    }
                  }}
                  disabled={busy || saving}
                  className={inputClass}
                >
                  <option value="">— No category —</option>
                  {storeCategoryList.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  <option value="__add_new__">+ Add new category...</option>
                </select>
              )}
            </FormField>
          </div>
          {(showProfitability || (item.total_cost != null && item.total_cost > 0)) && (
            <div className="rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-xs text-[var(--ui-body)]">
              <span className="font-medium text-[var(--ui-title)]">Profitability: </span>
              Total cost {fmtMoney(item.total_cost)}
              {showProfitability ? (
                <>
                  {" · "}Net profit{" "}
                  <span
                    className={
                      Number(item.net_profit ?? 0) >= 0
                        ? "text-[var(--ui-green)]"
                        : "text-[var(--ui-red)]"
                    }
                  >
                    {fmtMoney(item.net_profit)}
                  </span>
                  {" · "}Margin {formatPct(item.margin_pct)}
                  {" · "}ROI {formatPct(item.roi_pct)}
                </>
              ) : null}
            </div>
          )}
          <OtherCostsManager
            inventoryId={item.id}
            disabled={busy || saving}
            onTotalChanged={onReloadItem}
          />
        </section>

        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
            Dates
          </p>
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
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
            Condition
          </p>
          <FormField
            label="Condition"
            helpText="Rate the item's physical condition using standard vintage/antique grading terms."
            required
          >
            <SelectInput
              value={draft.condition_code}
              onChange={(v) => setDraft((c) => ({ ...c!, condition_code: v }))}
              options={[
                { value: "", label: "—" },
                ...CONDITIONS.map((c) => ({ value: c, label: c })),
              ]}
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
            <span className="inline-flex items-center">
              Has condition issue
              <HelpTooltip text="Check this if the item has notable damage, wear, or defects that a buyer should know about." />
            </span>
          </label>
          <FormField label="Condition notes">
            <textarea
              value={draft.condition_notes}
              onChange={(e) => setDraft((c) => ({ ...c!, condition_notes: e.target.value }))}
              rows={2}
              disabled={busy || saving}
              spellCheck
              className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm"
            />
          </FormField>
          <FormField label="Internal notes">
            <textarea
              value={draft.notes}
              onChange={(e) => setDraft((c) => ({ ...c!, notes: e.target.value }))}
              rows={2}
              disabled={busy || saving}
              spellCheck
              className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm"
            />
          </FormField>
        </section>
        <section className="space-y-2 lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
            Etsy Listing Details
          </p>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <FormField
              label="Era (when made)"
              helpText="Etsy-required era/date range for vintage and handmade items."
              required
            >
              <SelectInput
                value={draft.etsy_when_made}
                onChange={(v) => setDraft((c) => ({ ...c!, etsy_when_made: v }))}
                options={[...WHEN_MADE_OPTIONS]}
                disabled={busy || saving}
              />
            </FormField>
            <FormField
              label="Etsy Category"
              helpText="Select the Etsy category for this item. Required for publishing."
              required
            >
              <TaxonomyCategoryPicker
                value={draft.etsy_taxonomy_id ? Number(draft.etsy_taxonomy_id) : null}
                valuePath={draft.listing_category_path || undefined}
                onChange={(id, fullPath) => {
                  setDraft((c) => ({
                    ...c!,
                    etsy_taxonomy_id: id != null ? String(id) : "",
                    listing_category_path: fullPath,
                  }));
                }}
                disabled={busy || saving}
              />
            </FormField>
            <FormField
              label="Materials"
              helpText="Comma-separated list of materials (e.g. ceramic, glaze). Max 45 chars each."
            >
              <TextInput
                value={draft.materials}
                onChange={(v) => setDraft((c) => ({ ...c!, materials: v }))}
                disabled={busy || saving}
                className={inputClass}
              />
            </FormField>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-[var(--ui-body)]">
              <input
                type="checkbox"
                checked={draft.is_supply}
                onChange={(e) => setDraft((c) => ({ ...c!, is_supply: e.target.checked }))}
                disabled={busy || saving}
              />
              Is supply
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <FormField label="Weight" helpText="Item weight for shipping calculation.">
              <TextInput
                type="number"
                value={draft.item_weight}
                onChange={(v) => setDraft((c) => ({ ...c!, item_weight: v }))}
                disabled={busy || saving}
                className={inputClass}
              />
            </FormField>
            <FormField label="Weight unit">
              <SelectInput
                value={draft.item_weight_unit}
                onChange={(v) => setDraft((c) => ({ ...c!, item_weight_unit: v }))}
                options={[...WEIGHT_UNITS]}
                disabled={busy || saving}
              />
            </FormField>
            <div className="lg:col-span-2">
              <FormField label="Video">
                <p className="rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm text-[var(--ui-muted)]">
                  Managed in the photo grid above
                </p>
              </FormField>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 lg:grid-cols-4">
            <FormField label="Length">
              <TextInput
                type="number"
                value={draft.item_length}
                onChange={(v) => setDraft((c) => ({ ...c!, item_length: v }))}
                disabled={busy || saving}
                className={inputClass}
              />
            </FormField>
            <FormField label="Width">
              <TextInput
                type="number"
                value={draft.item_width}
                onChange={(v) => setDraft((c) => ({ ...c!, item_width: v }))}
                disabled={busy || saving}
                className={inputClass}
              />
            </FormField>
            <FormField label="Height">
              <TextInput
                type="number"
                value={draft.item_height}
                onChange={(v) => setDraft((c) => ({ ...c!, item_height: v }))}
                disabled={busy || saving}
                className={inputClass}
              />
            </FormField>
            <FormField label="Dim. unit" helpText="Required when any dimension is set.">
              <SelectInput
                value={draft.item_dimensions_unit}
                onChange={(v) => setDraft((c) => ({ ...c!, item_dimensions_unit: v }))}
                options={[...DIMENSION_UNITS]}
                disabled={busy || saving}
              />
            </FormField>
          </div>
        </section>
      </div>

      <section className="mt-4 border-t border-[var(--ui-border)] pt-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
            Listing Content
          </p>
        </div>
        {item ? (
          <ListingLifecycleControls
            itemId={item.id}
            updatedAt={(item as { updated_at?: string | null }).updated_at ?? null}
            busy={busy || saving}
            onRegenerateAi={onRegenerateAi}
            regenerateAiBusy={regenerateAiBusy}
            onReloadItem={onReloadItem}
            onError={onError}
          />
        ) : null}
        <div className="space-y-3">
          <FormField label="Listing title" required>
            <input
              value={draft.listing_title}
              onChange={(e) => setDraft((c) => ({ ...c!, listing_title: e.target.value }))}
              placeholder="e.g. Vintage 1950s Pink Depression Glass..."
              spellCheck
              disabled={busy || saving}
              className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm"
            />
          </FormField>
          <FormField label="Listing description" required>
            <textarea
              value={draft.listing_description}
              onChange={(e) => setDraft((c) => ({ ...c!, listing_description: e.target.value }))}
              placeholder="Full listing description for Etsy..."
              spellCheck
              disabled={busy || saving}
              rows={4}
              className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm"
            />
          </FormField>
          <FormField label="Listing tags" required helpText="Comma-separated, up to 13 tags. Choose words buyers would search for.">
            <input
              value={draft.listing_tags}
              onChange={(e) => setDraft((c) => ({ ...c!, listing_tags: e.target.value }))}
              placeholder="Comma separated, up to 13"
              disabled={busy || saving}
              className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm"
            />
            {draft.listing_tags.trim() && (
              <div className="mt-1 flex flex-wrap gap-1">
                {draft.listing_tags.split(",").map((t) => t.trim()).filter(Boolean).map((tag) => (
                  <span key={tag} className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-2 py-0.5 text-xs text-[var(--ui-body)]">{tag}</span>
                ))}
              </div>
            )}
          </FormField>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <FormField label="Title strategy">
              <textarea
                value={draft.listing_title_strategy}
                onChange={(e) => setDraft((c) => ({ ...c!, listing_title_strategy: e.target.value }))}
                placeholder="Naming approach and keyword strategy..."
                spellCheck
                disabled={busy || saving}
                rows={2}
                className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm"
              />
            </FormField>
            <FormField label="Product story / details">
              <textarea
                value={draft.listing_product_story}
                onChange={(e) => setDraft((c) => ({ ...c!, listing_product_story: e.target.value }))}
                placeholder="History, origin, notable features..."
                spellCheck
                disabled={busy || saving}
                rows={2}
                className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm"
              />
            </FormField>
            <FormField label="Condition clarity">
              <textarea
                value={draft.listing_condition_clarity}
                onChange={(e) => setDraft((c) => ({ ...c!, listing_condition_clarity: e.target.value }))}
                placeholder="Condition details and any defect disclosure"
                spellCheck
                disabled={busy || saving}
                rows={2}
                className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm"
              />
            </FormField>
            <FormField label="Attributes and category fit">
              <textarea
                value={draft.listing_attributes}
                onChange={(e) => setDraft((c) => ({ ...c!, listing_attributes: e.target.value }))}
                placeholder="Material, era, dimensions, style..."
                spellCheck
                disabled={busy || saving}
                rows={2}
                className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm"
              />
            </FormField>
            <FormField label="Pricing and shipping notes">
              <textarea
                value={draft.listing_pricing_shipping_notes}
                onChange={(e) => setDraft((c) => ({ ...c!, listing_pricing_shipping_notes: e.target.value }))}
                placeholder="Pricing rationale, shipping instructions..."
                spellCheck
                disabled={busy || saving}
                rows={2}
                className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm"
              />
            </FormField>
            <FormField label="Quality checklist">
              <textarea
                value={draft.listing_quality_checklist}
                onChange={(e) => setDraft((c) => ({ ...c!, listing_quality_checklist: e.target.value }))}
                placeholder="Pre-publish review notes..."
                spellCheck
                disabled={busy || saving}
                rows={2}
                className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm"
              />
            </FormField>
          </div>
        </div>
      </section>

      <section className="mt-4 border-t border-[var(--ui-border)] pt-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h5 className="text-sm font-semibold text-[var(--ui-title)]">Where I bought this</h5>
            {vendorPurchases.length > 0 ? (
              <p className="text-xs text-[var(--ui-muted)]">
                Vendor total {fmtMoney(vendorRollup)}
                {item.purchase_cost != null
                  ? ` · Inventory purchase cost ${fmtMoney(item.purchase_cost)}`
                  : ""}
              </p>
            ) : null}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAddBuyOpen(true)}
            disabled={busy || saving || buyBusy}
          >
            + Add buy
          </Button>
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
                  <th className="py-1 pr-2">Notes</th>
                  <th className="py-1 w-16" />
                </tr>
              </thead>
              <tbody>
                {vendorPurchases.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--ui-border)]/60">
                    <td className="py-1 pr-2">{row.purchase_date ?? "—"}</td>
                    <td className="py-1 pr-2">{row.vendor_name ?? "—"}</td>
                    <td className="py-1 pr-2">{fmtMoney(row.purchase_price)}</td>
                    <td className="py-1 pr-2">{fmtMoney(row.shipping_price)}</td>
                    <td className="py-1 pr-2">{row.reference_number ?? "—"}</td>
                    <td className="py-1 pr-2">{row.notes ?? "—"}</td>
                    <td className="py-1">
                      <div className="flex gap-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openEditBuy(row)}
                          disabled={buyBusy}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setDeleteBuyTarget(row)}
                          disabled={buyBusy}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-4 flex justify-end">
        <Button
          variant="accent"
          onClick={() => void saveChanges()}
          disabled={busy || !isDirty}
          busy={saving}
          title="Save (⌘S)"
          data-save-button
        >
          Save changes
        </Button>
      </div>

      <div className="mt-4 border-t border-[var(--ui-border)] pt-4">
        <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
          Recent activity
        </h5>
        <ActivityTimeline entityType="inventory" entityId={item.id} />
      </div>

      {addBuyOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5">
            <h4 className="mb-3 text-lg font-semibold text-[var(--ui-title)]">
              Add vendor purchase
            </h4>
            <FormField label="Vendor">
              <VendorPicker
                vendorId={buyForm.vendor_id}
                onChange={(id, name) => setBuyForm((c) => ({ ...c, vendor_id: id, vendor_name: name ?? "" }))}
                placeholder="Select vendor..."
                allowEmpty={false}
                className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm"
              />
            </FormField>
            <FormField label="Purchase date">
              <input
                type="date"
                value={buyForm.purchase_date}
                onChange={(e) => setBuyForm((c) => ({ ...c, purchase_date: e.target.value }))}
                className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm"
              />
            </FormField>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <FormField label="Purchase price">
                <TextInput
                  type="number"
                  value={buyForm.purchase_price}
                  onChange={(v) => setBuyForm((c) => ({ ...c, purchase_price: v }))}
                  className={inputClass}
                />
              </FormField>
              <FormField label="Shipping">
                <TextInput
                  type="number"
                  value={buyForm.shipping_price}
                  onChange={(v) => setBuyForm((c) => ({ ...c, shipping_price: v }))}
                  className={inputClass}
                />
              </FormField>
            </div>
            <FormField label="Reference #">
              <TextInput
                value={buyForm.reference_number}
                onChange={(v) => setBuyForm((c) => ({ ...c, reference_number: v }))}
                className={inputClass}
              />
            </FormField>
            <FormField label="Notes">
              <textarea
                value={buyForm.notes}
                onChange={(e) => setBuyForm((c) => ({ ...c, notes: e.target.value }))}
                rows={2}
                spellCheck
                className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm"
              />
            </FormField>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAddBuyOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="accent"
                onClick={() => void addVendorBuy()}
                disabled={!buyForm.vendor_id && !buyForm.vendor_name.trim()}
                busy={buyBusy}
              >
                Add buy
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {editBuyTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5">
            <h4 className="mb-3 text-lg font-semibold text-[var(--ui-title)]">
              Edit vendor purchase
            </h4>
            <FormField label="Vendor">
              <VendorPicker
                vendorId={editBuyForm.vendor_id}
                onChange={(id, name) => setEditBuyForm((c) => ({ ...c, vendor_id: id, vendor_name: name ?? "" }))}
                placeholder="Select vendor..."
                allowEmpty={false}
                className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm"
              />
              {editBuyForm.vendor_name && !editBuyForm.vendor_id && (
                <p className="mt-1 text-xs text-[var(--ui-yellow)]">
                  Unlinked vendor: &quot;{editBuyForm.vendor_name}&quot; — select a vendor above to link it
                </p>
              )}
            </FormField>
            <FormField label="Purchase date">
              <input
                type="date"
                value={editBuyForm.purchase_date}
                onChange={(e) => setEditBuyForm((c) => ({ ...c, purchase_date: e.target.value }))}
                className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm"
              />
            </FormField>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <FormField label="Purchase price">
                <TextInput
                  type="number"
                  value={editBuyForm.purchase_price}
                  onChange={(v) => setEditBuyForm((c) => ({ ...c, purchase_price: v }))}
                  className={inputClass}
                />
              </FormField>
              <FormField label="Shipping">
                <TextInput
                  type="number"
                  value={editBuyForm.shipping_price}
                  onChange={(v) => setEditBuyForm((c) => ({ ...c, shipping_price: v }))}
                  className={inputClass}
                />
              </FormField>
            </div>
            <FormField label="Reference #">
              <TextInput
                value={editBuyForm.reference_number}
                onChange={(v) => setEditBuyForm((c) => ({ ...c, reference_number: v }))}
                className={inputClass}
              />
            </FormField>
            <FormField label="Notes">
              <textarea
                value={editBuyForm.notes}
                onChange={(e) => setEditBuyForm((c) => ({ ...c, notes: e.target.value }))}
                rows={2}
                spellCheck
                className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm"
              />
            </FormField>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditBuyTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="accent"
                onClick={() => void saveVendorBuy()}
                disabled={!editBuyForm.vendor_id && !editBuyForm.vendor_name.trim()}
                busy={buyBusy}
              >
                Save changes
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
