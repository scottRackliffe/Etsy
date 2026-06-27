"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { useConnection } from "@/context/ConnectionContext";
import { useTrackRecentlyViewed } from "@/context/RecentlyViewedContext";
import { useUndoRedo } from "@/context/UndoRedoContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { BatchActionsBar } from "@/components/ui/BatchActionsBar";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import { ProgressModal } from "@/components/ui/ProgressModal";
import { SemsScreen, type SemsScreenController } from "@/components/sems/SemsScreen";
import { SemsEditor } from "@/components/sems/SemsEditor";
import { useSemsEditorGuard } from "@/components/sems/useSemsEditorGuard";
import {
  InventoryDetailPanel,
  type InventoryItemDetail,
} from "@/components/inventory/InventoryDetailPanel";
import { InventoryImportModal } from "@/components/inventory/InventoryImportModal";
import { ListingQualityScoreBadge } from "@/components/inventory/ListingQualityScore";
import { PictureGrid } from "@/components/inventory/PictureGrid";
import { ConditionPictureGrid } from "@/components/inventory/ConditionPictureGrid";
import { ShotListPanel } from "@/components/inventory/ShotListPanel";
import { MeasurementPhotoPanel } from "@/components/inventory/MeasurementPhotoPanel";
import { DuplicateWarning } from "@/components/ui/DuplicateWarning";
import { apiFetch } from "@/lib/api-fetch";
import { stampUiError } from "@/lib/ui-error";
import { useDirtyTracking } from "@/hooks/useDirtyTracking";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useListSearchFromUrl } from "@/hooks/useListSearchFromUrl";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { usePagination } from "@/hooks/usePagination";
import { useBatchOperation } from "@/hooks/useBatchOperation";
import { useBatchSelection } from "@/hooks/useBatchSelection";
import { inventoryRecentlyViewedLabel } from "@/lib/recently-viewed";
import { computeRubricFastScore, type InventoryRowLike } from "@/lib/listing-rubric";
import { patchHeaders } from "@/lib/patch-json";
import type { InlineEditResult, SortState } from "@/components/ui/DataTable";
import type { ApiErrorShape, InventoryItem, PaginationInfo } from "@/types";

const INVENTORY_STATUSES = ["Draft", "In stock", "Listed", "Sold", "Reserved", "Retired"] as const;
const SLOW_MOVER_DAYS = 90;
const CONDITION_CODES = ["Mint/Near Mint", "Excellent", "Very Good", "Good", "Fair/As-Is"] as const;

/* ─────────────────────────── Inline create form ─────────────────────────── */

type CreateFormFields = {
  item_number: string;
  description: string;
  condition_code: string;
  purchase_cost: string;
  hero_file_name: string;
};

const EMPTY_CREATE_FORM: CreateFormFields = {
  item_number: "",
  description: "",
  condition_code: "",
  purchase_cost: "",
  hero_file_name: "",
};

type InventoryDuplicate = { id: number; item_number: string | null; description: string | null };

function InventoryCreateForm({
  requestClose,
  done,
  onSaved,
}: {
  requestClose: () => void;
  done: () => void;
  onSaved: (item: InventoryItem) => void;
}) {
  const { setApiError, setError } = useApp();
  const { current, setCurrent, savedState, isDirty, markClean } =
    useDirtyTracking<CreateFormFields>(EMPTY_CREATE_FORM);
  const form = current ?? EMPTY_CREATE_FORM;

  const heroFileRef = useRef<File | null>(null);
  const [heroPreviewUrl, setHeroPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof CreateFormFields, string>>>(
    {}
  );
  const [duplicates, setDuplicates] = useState<InventoryDuplicate[]>([]);
  const [dupDismissed, setDupDismissed] = useState(false);

  // Fetch suggested item number on mount
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/inventory/next-number", {
          headers: { Accept: "application/json" },
        });
        const data = (await res.json().catch(() => ({}))) as { next_number?: string };
        if (res.ok && data.next_number) {
          setCurrent((prev) => ({ ...(prev ?? EMPTY_CREATE_FORM), item_number: data.next_number! }));
        }
      } catch {
        /* non-critical */
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = useCallback(
    <K extends keyof CreateFormFields>(key: K, value: CreateFormFields[K]) => {
      setCurrent((prev) => ({ ...(prev ?? EMPTY_CREATE_FORM), [key]: value }));
    },
    [setCurrent]
  );

  const checkDuplicate = useCallback(async () => {
    const desc = (current ?? EMPTY_CREATE_FORM).description.trim();
    if (!desc) {
      setDuplicates([]);
      return;
    }
    try {
      const params = new URLSearchParams({ description: desc });
      const res = await fetch(`/api/inventory/check-duplicate?${params}`, {
        headers: { Accept: "application/json" },
      });
      const data = (await res.json().catch(() => ({}))) as { duplicates?: InventoryDuplicate[] };
      if (res.ok) {
        setDuplicates(data.duplicates ?? []);
        setDupDismissed(false);
      }
    } catch {
      setDuplicates([]);
    }
  }, [current]);

  const applyFile = useCallback(
    (file: File) => {
      heroFileRef.current = file;
      setCurrent((prev) => ({ ...(prev ?? EMPTY_CREATE_FORM), hero_file_name: file.name }));
      setHeroPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
    },
    [setCurrent]
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) applyFile(file);
          break;
        }
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [applyFile]);

  useEffect(
    () => () => {
      if (heroPreviewUrl) URL.revokeObjectURL(heroPreviewUrl);
    },
    [heroPreviewUrl]
  );

  const discard = useCallback(() => {
    setCurrent(savedState);
    heroFileRef.current = null;
    setHeroPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setFieldErrors({});
    setDuplicates([]);
    setDupDismissed(false);
  }, [savedState, setCurrent]);

  const save = useCallback(async (): Promise<boolean> => {
    const value = current ?? EMPTY_CREATE_FORM;
    const errs: Partial<Record<keyof CreateFormFields, string>> = {};
    if (!value.item_number.trim()) errs.item_number = "Item number is required.";
    if (!value.description.trim()) errs.description = "Description is required.";
    if (!value.condition_code) errs.condition_code = "Condition is required.";
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return false;

    setBusy(true);
    try {
      const res = await apiFetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          item_number: value.item_number.trim(),
          description: value.description.trim(),
          condition_code: value.condition_code,
          purchase_cost: value.purchase_cost.trim() ? Number(value.purchase_cost) : null,
          status: "Draft",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as ApiErrorShape & {
        item?: InventoryItem;
      };
      if (!res.ok) throw data;
      const newItem = data.item!;

      // Upload hero photo if provided (non-fatal if it fails)
      if (heroFileRef.current) {
        try {
          const fd = new FormData();
          fd.append("file", heroFileRef.current);
          fd.append("slot", "1");
          fd.append("type", "main");
          const picRes = await apiFetch(`/api/inventory/${newItem.id}/pictures`, {
            method: "POST",
            body: fd,
          });
          const picData = (await picRes.json().catch(() => ({}))) as ApiErrorShape & {
            item?: InventoryItem;
          };
          if (picRes.ok && picData.item) Object.assign(newItem, picData.item);
        } catch {
          /* hero photo upload failure is non-fatal; user can upload in the detail editor */
        }
      }

      markClean(value);
      setError(null);
      onSaved(newItem);
      return true;
    } catch (err) {
      setApiError("Could not create item", "We could not create the inventory item.", err);
      return false;
    } finally {
      setBusy(false);
    }
  }, [current, markClean, onSaved, setApiError, setError]);

  useSemsEditorGuard({ isDirty, onSave: save, onDiscard: discard });

  const handleSaveClick = useCallback(() => {
    void (async () => {
      const ok = await save();
      if (ok) done();
    })();
  }, [save, done]);

  const inputCls =
    "w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm text-[var(--ui-body)] placeholder-[var(--ui-muted)]";
  const labelCls = "mb-1 block text-xs font-medium text-[var(--ui-muted)]";

  return (
    <SemsEditor
      title="New inventory item"
      isDirty={isDirty}
      busy={busy}
      saveLabel="Create item"
      onSave={handleSaveClick}
      onCancel={requestClose}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Item number */}
        <div>
          <label className={labelCls}>Item number *</label>
          <input
            className={`${inputCls}${fieldErrors.item_number ? " border-[var(--ui-red)]" : ""}`}
            value={form.item_number}
            onChange={(e) => set("item_number", e.target.value)}
            placeholder="e.g. ITEM-0001"
          />
          {fieldErrors.item_number ? (
            <p className="mt-1 text-xs text-[var(--ui-red)]">{fieldErrors.item_number}</p>
          ) : null}
        </div>

        {/* Condition */}
        <div>
          <label className={labelCls}>Condition *</label>
          <select
            className={`${inputCls}${fieldErrors.condition_code ? " border-[var(--ui-red)]" : ""}`}
            value={form.condition_code}
            onChange={(e) => set("condition_code", e.target.value)}
          >
            <option value="">Select condition…</option>
            {CONDITION_CODES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {fieldErrors.condition_code ? (
            <p className="mt-1 text-xs text-[var(--ui-red)]">{fieldErrors.condition_code}</p>
          ) : null}
        </div>

        {/* Description — full width */}
        <div className="sm:col-span-2">
          <label className={labelCls}>Description *</label>
          <textarea
            rows={3}
            className={`${inputCls}${fieldErrors.description ? " border-[var(--ui-red)]" : ""}`}
            value={form.description}
            onChange={(e) => {
              set("description", e.target.value);
              setDuplicates([]);
            }}
            onBlur={() => void checkDuplicate()}
            placeholder="Brief description of the item"
          />
          {fieldErrors.description ? (
            <p className="mt-1 text-xs text-[var(--ui-red)]">{fieldErrors.description}</p>
          ) : null}
          {duplicates.length > 0 && !dupDismissed ? (
            <DuplicateWarning
              message={`${duplicates.length} similar item${duplicates.length > 1 ? "s" : ""} found. Review before creating.`}
              links={duplicates.map((d) => ({
                href: `/inventory?itemId=${d.id}`,
                label: `${d.item_number ?? `#${d.id}`}: ${(d.description ?? "").slice(0, 60)}`,
              }))}
              onDismiss={() => setDupDismissed(true)}
            />
          ) : null}
        </div>

        {/* Purchase cost — optional */}
        <div>
          <label className={labelCls}>Purchase cost (optional)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className={inputCls}
            value={form.purchase_cost}
            onChange={(e) => set("purchase_cost", e.target.value)}
            placeholder="0.00"
          />
        </div>

        {/* Hero photo */}
        <div>
          <label className={labelCls}>Hero photo — picture_1 (optional)</label>
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
          <div
            className="flex min-h-[96px] cursor-pointer items-center justify-center rounded-lg border border-dashed border-[var(--ui-border)] bg-[var(--ui-card-bg)] text-center text-xs text-[var(--ui-muted)] transition-colors hover:border-[var(--ui-accent)] hover:bg-[var(--ui-accent)]/5"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) applyFile(file);
            }}
          >
            {heroPreviewUrl ? (
              <img
                src={heroPreviewUrl}
                alt="Hero photo preview"
                className="max-h-20 max-w-full rounded object-contain"
              />
            ) : (
              <span>
                Drag, paste, or click to add
                <br />a hero photo
              </span>
            )}
          </div>
          {form.hero_file_name ? (
            <p className="mt-1 truncate text-xs text-[var(--ui-muted)]">{form.hero_file_name}</p>
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) applyFile(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    </SemsEditor>
  );
}

function getDaysInStock(item: InventoryItem): number {
  const candidates = [item.date_purchased, item.date_listed, item.created_at].filter(
    Boolean
  ) as string[];
  if (candidates.length === 0) return 0;
  const timestamps = candidates.map((d) => new Date(d).getTime()).filter((t) => !isNaN(t));
  if (timestamps.length === 0) return 0;
  return Math.floor((Date.now() - Math.min(...timestamps)) / (1000 * 60 * 60 * 24));
}

/* ─────────────────────────── Editor shell (Region 2 + Region 3) ─────────────────────────── */

type InventoryEditorShellProps = {
  item: InventoryItemDetail | null;
  busy: boolean;
  onItemUpdated: (item: InventoryItemDetail) => void;
  onError: (title: string, message: string, err?: unknown) => void;
  onSuccess: (title: string, message: string) => void;
  onReloadItem: () => Promise<void>;
  onRegenerateAi: (ctx?: { googlePhotos?: File[]; googleText?: string }) => void;
  regenerateAiBusy: boolean;
  lastGenerateResult?: import("@/components/inventory/InventoryDetailPanel").GenerateResult | null;
  requestClose: () => void;
  done: () => void;
  context: ReactNode;
};

function InventoryEditorShell({
  item,
  busy,
  onItemUpdated,
  onError,
  onSuccess,
  onReloadItem,
  onRegenerateAi,
  regenerateAiBusy,
  lastGenerateResult,
  requestClose,
  done,
  context,
}: InventoryEditorShellProps) {
  const [isDirty, setIsDirty] = useState(false);
  // Stable ref that always points to the latest saveChanges closure in InventoryDetailPanel.
  const saveRef = useRef<(() => Promise<boolean>) | null>(null);

  const save = useCallback(async (): Promise<boolean> => {
    if (!saveRef.current) return false;
    return saveRef.current();
  }, []);

  // Panel handles its own discard (registerOnDiscard via useEntityDraft + baseline reset).
  const discard = useCallback(() => {}, []);

  useSemsEditorGuard({ isDirty, onSave: save, onDiscard: discard });

  const handleSaveClick = useCallback(() => {
    void (async () => {
      const ok = await save();
      if (ok) done();
    })();
  }, [save, done]);

  // Generate/quality actions validate the PERSISTED item (server-side), so flush any unsaved
  // form edits (e.g. the just-typed sale price) before generating. Abort if the save fails.
  const handleRegenerate = useCallback(
    (ctx?: { googlePhotos?: File[]; googleText?: string }) => {
      void (async () => {
        if (isDirty) {
          const ok = await save();
          if (!ok) return;
        }
        onRegenerateAi(ctx);
      })();
    },
    [isDirty, save, onRegenerateAi]
  );

  if (!item) return null;

  const subtitle = (
    <span className="text-xs text-[var(--ui-muted)]">
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
      ) : null}
      {item.created_at
        ? ` · Created ${new Date(item.created_at).toLocaleString()}`
        : null}
      {item.updated_at
        ? ` · Updated ${new Date(item.updated_at).toLocaleString()}`
        : null}
    </span>
  );

  return (
    <SemsEditor
      title={`Item ${item.item_number ?? `#${item.id}`}`}
      subtitle={subtitle}
      badges={
        <Badge
          label={item.is_listed ? "Listed on Etsy" : "Not listed"}
          variant={item.is_listed ? "success" : "neutral"}
        />
      }
      isDirty={isDirty}
      busy={busy || false}
      saveLabel="Save changes"
      onSave={handleSaveClick}
      onCancel={requestClose}
      context={context}
    >
      <InventoryDetailPanel
        item={item}
        busy={busy}
        onItemUpdated={onItemUpdated}
        onError={onError}
        onSuccess={onSuccess}
        onReloadItem={onReloadItem}
        onDirtyChange={setIsDirty}
        onRegenerateAi={handleRegenerate}
        regenerateAiBusy={regenerateAiBusy}
        lastGenerateResult={lastGenerateResult}
        saveRef={saveRef}
      />
    </SemsEditor>
  );
}

/* ─────────────────────────── Page inner ─────────────────────────── */

function InventoryPageInner() {
  const {
    setInventory: setGlobalInventory,
    selectedItemId,
    setSelectedItemId,
    selectedItem,
    setSelectedItem,
    publishConfig,
    busyAction,
    setBusyAction,
    setApiError,
    setError,
    pageSize: configPageSize,
  } = useApp();
  const { state: connectionState } = useConnection();
  const isOffline = connectionState !== "online";

  const [pageInventory, setPageInventory] = useState<InventoryItem[]>([]);
  const inventory = pageInventory;
  const setInventory = useCallback(
    (updater: InventoryItem[] | ((prev: InventoryItem[]) => InventoryItem[])) => {
      setPageInventory(updater);
    },
    []
  );

  const inventoryRecentRow =
    (selectedItem as InventoryItem | null) ??
    inventory.find((row) => row.id === selectedItemId) ??
    null;
  useTrackRecentlyViewed(
    "inventory",
    selectedItemId,
    inventoryRecentRow ? inventoryRecentlyViewedLabel(inventoryRecentRow as InventoryItem) : null
  );

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const controllerRef = useRef<SemsScreenController<InventoryItem> | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  const [batchStatusOpen, setBatchStatusOpen] = useState(false);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchRetireOpen, setBatchRetireOpen] = useState(false);
  const [batchStatusValue, setBatchStatusValue] = useState<string>("In stock");
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);
  const [inventorySearch, setInventorySearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const debouncedInventorySearch = useDebouncedValue(inventorySearch, 300);
  const { page, pageSize, offset, total: listTotal, setPage, setTotal } = usePagination(configPageSize);

  useListSearchFromUrl(setInventorySearch, () => setPage(0));

  useKeyboardShortcuts([
    {
      key: "i",
      modifiers: ["meta", "shift"],
      action: () => setImportOpen(true),
    },
    {
      key: "n",
      modifiers: ["meta"],
      action: () => controllerRef.current?.openRecord(null),
    },
  ]);

  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [phaseFilter, setPhaseFilter] = useState<string | null>(null);
  // WS-L3: last generate result (price, citations, compliance) surfaced from generate call
  const [lastGenerateResult, setLastGenerateResult] = useState<
    import("@/components/inventory/InventoryDetailPanel").GenerateResult | null
  >(null);
  const [storeCategoryOptions, setStoreCategoryOptions] = useState<string[]>([]);
  const [sort, setSort] = useState<SortState>({ key: "updated_at", dir: "desc" });

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(
          `/api/settings/${encodeURIComponent("inventory.store_categories")}`,
          { headers: { Accept: "application/json" } }
        );
        if (res.ok) {
          const data = (await res.json()) as { value?: string };
          setStoreCategoryOptions(
            (data.value ?? "").split(",").map((s: string) => s.trim()).filter(Boolean)
          );
        }
      } catch { /* optional */ }
    })();
  }, []);

  const batch = useBatchSelection(inventory, listTotal);
  const {
    runBatch,
    busy: batchBusy,
    progressOpen,
    progressTitle,
    progressTotal,
    progressCurrent,
  } = useBatchOperation();

  const inventoryBatchFilter = useMemo(
    () => ({
      search: debouncedInventorySearch.trim() || undefined,
      status: statusFilter ?? undefined,
      store_category: categoryFilter ?? undefined,
    }),
    [debouncedInventorySearch, statusFilter, categoryFilter]
  );

  const buildInventoryBatchBody = useCallback(
    (action: string, params?: Record<string, unknown>) =>
      batch.selectAllMatching
        ? { action, filter: inventoryBatchFilter, params }
        : { action, ids: batch.selectedIdList, params },
    [batch.selectAllMatching, batch.selectedIdList, inventoryBatchFilter]
  );

  const handleDetailItemUpdated = useCallback(
    (item: InventoryItemDetail) => {
      setSelectedItem(item);
      const updateRow = (current: InventoryItem[]) =>
        current.map((row) => (row.id === item.id ? item : row));
      setInventory(updateRow);
      setGlobalInventory(updateRow);
    },
    [setSelectedItem, setInventory, setGlobalInventory]
  );

  // Called after inline create: add the new item to the list, then open in edit mode.
  const handleNewItemSaved = useCallback(
    (item: InventoryItem) => {
      const addToList = (prev: InventoryItem[]) => [item, ...prev];
      setInventory(addToList);
      setGlobalInventory(addToList);
      // Defer so done() (called by the create form) can clear the create-mode state first.
      setTimeout(() => controllerRef.current?.openRecord(item), 0);
    },
    [setInventory, setGlobalInventory]
  );

  const handlePictureItemUpdated = useCallback(
    (item: InventoryItem) => {
      setSelectedItem(item as InventoryItemDetail);
      const updateRow = (current: InventoryItem[]) =>
        current.map((row) => (row.id === item.id ? item : row));
      setInventory(updateRow);
      setGlobalInventory(updateRow);
    },
    [setSelectedItem, setInventory, setGlobalInventory]
  );

  const reloadSelectedInventoryItem = useCallback(async () => {
    if (!selectedItemId) return;
    const response = await fetch(`/api/inventory/${selectedItemId}`, {
      headers: { Accept: "application/json" },
    });
    const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
      item?: InventoryItemDetail;
    };
    if (!response.ok || !data.item) throw data;
    handleDetailItemUpdated(data.item);
  }, [selectedItemId, handleDetailItemUpdated]);

  const reloadInventory = useCallback(async () => {
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(offset),
    });
    if (debouncedInventorySearch.trim()) params.set("search", debouncedInventorySearch.trim());
    if (statusFilter) params.set("status", statusFilter);
    if (categoryFilter) params.set("store_category", categoryFilter);
    if (phaseFilter) params.set("listing_phase", phaseFilter);
    if (sort) {
      params.set("sort_by", sort.key);
      params.set("sort_dir", sort.dir);
    }
    const response = await fetch(`/api/inventory?${params}`, {
      headers: { Accept: "application/json" },
    });
    const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
      items?: InventoryItem[];
      pagination?: PaginationInfo;
    };
    if (!response.ok) throw data;
    if (data.items) setInventory(data.items);
    if (data.pagination) setTotal(data.pagination.total);
  }, [debouncedInventorySearch, pageSize, offset, statusFilter, categoryFilter, phaseFilter, sort, setInventory, setTotal]);

  useEffect(() => {
    void reloadInventory().catch((err) =>
      setApiError("Could not load inventory", "We could not load inventory.", err)
    );
  }, [reloadInventory, setApiError]);

  // onOpenChange: called by SemsScreen when the user opens or closes an item.
  const handleOpenChange = useCallback(
    (record: InventoryItem | null) => {
      setIsEditMode(record !== null);
      if (record) {
        setSelectedItemId(record.id);
        setSelectedItem(record as InventoryItemDetail);
        batch.clearSelection();
        // Fetch full InventoryItemDetail (includes other_costs_total, net_profit, etc.)
        void (async () => {
          try {
            const resp = await fetch(`/api/inventory/${record.id}`, {
              headers: { Accept: "application/json" },
            });
            const data = (await resp.json().catch(() => ({}))) as ApiErrorShape & {
              item?: InventoryItemDetail;
            };
            if (data.item) handleDetailItemUpdated(data.item);
          } catch { /* panel shows basic item until refresh */ }
        })();
      } else {
        setSelectedItemId(null);
        setSelectedItem(null);
      }
    },
    [setSelectedItemId, setSelectedItem, handleDetailItemUpdated, batch]
  );

  // Deep link: ?itemId=<id> → open in editor via controllerRef.
  useEffect(() => {
    const raw = searchParams.get("itemId");
    if (!raw) return;
    const id = Number(raw);
    router.replace(pathname);
    if (!Number.isFinite(id)) return;
    void (async () => {
      const existing = inventory.find((r) => r.id === id);
      if (existing) {
        controllerRef.current?.openRecord(existing);
        return;
      }
      try {
        const response = await fetch(`/api/inventory/${id}`, {
          headers: { Accept: "application/json" },
        });
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
          item?: InventoryItemDetail;
        };
        if (!response.ok || !data.item) {
          setError({
            title: "Item not found",
            message: "That inventory item may have been deleted.",
            actions: ["Choose another item from the list."],
          });
          return;
        }
        const addIfMissing = (current: InventoryItem[]) =>
          current.some((r) => r.id === id) ? current : [data.item!, ...current];
        setInventory(addIfMissing);
        setGlobalInventory(addIfMissing);
        controllerRef.current?.openRecord(data.item!);
      } catch (err) {
        setApiError("Could not open item", "We could not load the linked inventory item.", err);
      }
    })();
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const { patchWithUndo, clearStacks } = useUndoRedo();

  useEffect(() => {
    clearStacks();
  }, [selectedItemId, clearStacks]);

  const handleInventoryRowPatched = useCallback(
    (rowId: number, patch: Partial<InventoryItem>) => {
      const patchRow = (current: InventoryItem[]) =>
        current.map((row) => (row.id === rowId ? { ...row, ...patch } : row));
      setInventory(patchRow);
      setGlobalInventory(patchRow);
      if (selectedItemId === rowId) {
        setSelectedItem((current) => (current ? { ...current, ...patch } : current));
      }
    },
    [selectedItemId, setInventory, setGlobalInventory, setSelectedItem]
  );

  const handleInventoryInlineEdit = useCallback(
    async (
      row: InventoryItem,
      columnKey: string,
      value: string | number | boolean
    ): Promise<InlineEditResult<InventoryItem>> => {
      const body =
        columnKey === "status" ? { status: String(value) } : { sale_revenue: Number(value) };
      const previousState =
        columnKey === "status"
          ? { status: row.status ?? null }
          : { sale_revenue: row.sale_revenue ?? null };
      const action =
        columnKey === "status"
          ? `Changed status to ${String(value)}`
          : `Changed price to $${Number(value).toFixed(2)}`;
      return patchWithUndo({
        action,
        entity: "inventory",
        id: row.id,
        updatedAt: row.updated_at,
        previousState,
        newState: body,
        pickRecord: (data) => (data.item as InventoryItem | undefined) ?? null,
        onPatched: (record) => handleInventoryRowPatched(row.id, record),
      });
    },
    [patchWithUndo, handleInventoryRowPatched]
  );

  const patchSelectedItem = async (payload: Record<string, unknown>) => {
    if (!selectedItemId) return;
    const response = await apiFetch(`/api/inventory/${selectedItemId}`, {
      method: "PATCH",
      headers: patchHeaders((selectedItem as InventoryItem | null)?.updated_at),
      body: JSON.stringify(payload),
    });
    const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
      item?: InventoryItem;
    };
    if (!response.ok) throw data;
    if (data.item) {
      setSelectedItem(data.item as InventoryItemDetail);
      const updateRow = (current: InventoryItem[]) =>
        current.map((row) => (row.id === data.item!.id ? data.item! : row));
      setInventory(updateRow);
      setGlobalInventory(updateRow);
    }
  };

  const generateIntegrated = async (ctx?: {
    googlePhotos?: File[];
    googleText?: string;
  }) => {
    if (!selectedItemId) return;
    setBusyAction("generate-ai");
    try {
      let response: Response;
      if (ctx?.googlePhotos?.length || ctx?.googleText?.trim()) {
        // Send multipart when Google context is present (WS-L3)
        const fd = new FormData();
        ctx.googlePhotos?.forEach((f) => fd.append("google_photos", f));
        if (ctx.googleText?.trim()) fd.append("google_text", ctx.googleText.trim());
        response = await apiFetch(
          `/api/inventory/${selectedItemId}/generate-listing-content`,
          { method: "POST", body: fd }
        );
      } else {
        response = await apiFetch(
          `/api/inventory/${selectedItemId}/generate-listing-content`,
          { method: "POST", headers: { Accept: "application/json" } }
        );
      }

      type GenerateApiData = ApiErrorShape & {
        price?: import("@/components/inventory/InventoryDetailPanel").GenerateResult["price"];
        citations?: import("@/components/inventory/InventoryDetailPanel").GenerateResult["citations"];
        compliance_check?: import("@/components/inventory/InventoryDetailPanel").GenerateResult["compliance_check"];
      };
      const data = (await response.json().catch(() => ({}))) as GenerateApiData;

      if (!response.ok) {
        const fieldErrors =
          data?.fields ??
          (data as { error?: { fields?: Record<string, string[]> } })?.error?.fields;
        if (fieldErrors && Object.keys(fieldErrors).length > 0) {
          const missing = Object.values(fieldErrors).flat().join(" ");
          setError(
            stampUiError({
              title: "Missing info for AI generation",
              message: missing,
              actions: data?.error?.actions ?? [
                "Fill in the missing fields in the detail panel, then try again.",
              ],
            })
          );
        } else {
          throw data;
        }
        return;
      }

      // WS-L3: capture price/citations/compliance from generate response
      if (data.price || data.citations || data.compliance_check) {
        setLastGenerateResult({
          price: data.price,
          citations: data.citations,
          compliance_check: data.compliance_check,
        });
      }

      // Refresh via GET (not a PATCH): Generate already advanced updated_at server-side, so a
      // PATCH here would send a stale If-Match and 409 — falsely reporting "could not generate"
      // even though the listing saved. A GET reloads the post-generate item + resets the
      // concurrency baseline (WS-CR6).
      await reloadSelectedInventoryItem();
      setError(null);
    } catch (err) {
      setApiError("Could not generate listing", "We could not generate listing content.", err);
    } finally {
      setBusyAction(null);
    }
  };

  // WS-L3: reset generate result when selected item changes
  useEffect(() => {
    setLastGenerateResult(null);
  }, [selectedItemId]);

  const deleteItem = async (item: InventoryItem) => {
    setBusyAction("delete-inventory");
    try {
      const response = await apiFetch(`/api/inventory/${item.id}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      if (!response.ok && response.status !== 204) {
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
        throw data;
      }
      const removeItem = (current: InventoryItem[]) =>
        current.filter((row) => row.id !== item.id);
      setInventory(removeItem);
      setGlobalInventory(removeItem);
      if (selectedItemId === item.id) {
        setSelectedItemId(null);
        setSelectedItem(null);
        controllerRef.current?.closeToList();
      }
      setDeleteTarget(null);
      setError(null);
    } catch (err) {
      setApiError("Could not delete inventory", "We could not delete the selected item.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const batchChangeStatus = async (status: string) => {
    if (batch.selectionCount === 0) return;
    setBusyAction("batch-status");
    try {
      const { ok, feedback } = await runBatch(
        "/api/inventory/batch",
        buildInventoryBatchBody("change_status", { status }),
        { entity: "item", actionPast: `set to ${status}`, count: batch.selectionCount }
      );
      if (!ok) throw new Error(feedback.message);
      await reloadInventory();
      setBatchStatusOpen(false);
      batch.clearSelection();
      setError({ title: feedback.title, message: feedback.message, actions: [] });
    } catch (err) {
      setApiError("Batch status failed", "We could not update selected items.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const batchDeleteInventory = async () => {
    if (batch.selectionCount === 0) return;
    setBusyAction("batch-delete");
    try {
      const { ok, feedback, result } = await runBatch(
        "/api/inventory/batch",
        buildInventoryBatchBody("delete"),
        { entity: "item", actionPast: "deleted", count: batch.selectionCount }
      );
      if (!ok) throw new Error(feedback.message);
      const removed = new Set(
        batch.selectAllMatching
          ? []
          : batch.selectedIdList.filter((id) => !(result?.failed ?? []).some((f) => f.id === id))
      );
      if (batch.selectAllMatching) await reloadInventory();
      else {
        const filterRemoved = (current: InventoryItem[]) =>
          current.filter((row) => !removed.has(row.id));
        setInventory(filterRemoved);
        setGlobalInventory(filterRemoved);
        if (selectedItemId && removed.has(selectedItemId)) {
          setSelectedItemId(null);
          setSelectedItem(null);
        }
      }
      setBatchDeleteOpen(false);
      batch.clearSelection();
      setError({ title: feedback.title, message: feedback.message, actions: [] });
    } catch (err) {
      setApiError("Batch delete failed", "We could not delete selected items.", err);
    } finally {
      setBusyAction(null);
    }
  };

  // Client-side Quality sort — preserves the listing_score column sort.
  // Scores are pre-computed once per render into a Map (O(n)) so the sort comparator
  // does only O(1) Map lookups rather than calling computeRubricFastScore O(n log n) times.
  // The badge column uses the same computeRubricFastScore per item, so badge === sort key.
  const inventoryTableData = useMemo(() => {
    if (sort?.key !== "listing_score") return inventory;
    const scoreMap = new Map<number, number>(
      inventory.map((item) => [
        item.id,
        computeRubricFastScore(item as unknown as InventoryRowLike).score,
      ])
    );
    return [...inventory].sort((a, b) => {
      const scoreA = scoreMap.get(a.id) ?? 0;
      const scoreB = scoreMap.get(b.id) ?? 0;
      return sort.dir === "asc" ? scoreA - scoreB : scoreB - scoreA;
    });
  }, [inventory, sort, publishConfig.minQualityScore]);

  const inventoryColumns = useMemo(
    () => [
      {
        key: "item_number",
        header: "Item #",
        sortable: true,
        render: (item: InventoryItem) => item.item_number ?? `#${item.id}`,
      },
      {
        key: "description",
        header: "Description",
        sortable: true,
        render: (item: InventoryItem) => (item.description ?? "").slice(0, 50) || "—",
      },
      {
        key: "store_category",
        header: "Category",
        sortable: true,
        render: (item: InventoryItem) =>
          item.store_category ? (
            <span className="inline-block rounded-full border border-[var(--ui-border)] bg-[var(--ui-neutral)] px-2 py-0.5 text-xs">
              {item.store_category}
            </span>
          ) : (
            <span className="text-[var(--ui-muted)]">—</span>
          ),
      },
      {
        key: "status",
        header: "Status",
        sortable: true,
        editable: true,
        editType: "select" as const,
        editOptions: INVENTORY_STATUSES.map((status) => ({ value: status, label: status })),
        getEditValue: (item: InventoryItem) => item.status ?? "Draft",
        render: (item: InventoryItem) => {
          const status = item.status ?? "Draft";
          const isSlowMover =
            (status === "In stock" || status === "Listed") &&
            getDaysInStock(item) > SLOW_MOVER_DAYS;
          return (
            <span className="inline-flex items-center gap-1.5">
              {status}
              {isSlowMover && <Badge label="Slow mover" variant="warning" />}
            </span>
          );
        },
      },
      {
        key: "sale_revenue",
        header: "Price",
        sortable: true,
        editable: true,
        editType: "number" as const,
        getEditValue: (item: InventoryItem) => item.sale_revenue ?? 0,
        getDisplayValue: (item: InventoryItem) =>
          item.sale_revenue != null ? `$${item.sale_revenue.toFixed(2)}` : "—",
      },
      {
        key: "margin_pct",
        header: "Margin",
        sortable: true,
        render: (item: InventoryItem) => {
          const extended = item as InventoryItem & { margin_pct?: number | null; net_profit?: number };
          if (extended.margin_pct == null) return <span className="text-[var(--ui-muted)]">—</span>;
          const color = (extended.net_profit ?? 0) >= 0 ? "text-[var(--ui-green)]" : "text-[var(--ui-red)]";
          return <span className={color}>{extended.margin_pct.toFixed(1)}%</span>;
        },
      },
      {
        key: "listing_score",
        header: "Quality",
        sortable: true,
        sortKey: "listing_score",
        render: (item: InventoryItem) => (
          <ListingQualityScoreBadge
            item={item}
            minScore={parseInt(publishConfig.minQualityScore, 10) || 85}
          />
        ),
      },
    ],
    [publishConfig.minQualityScore]
  );

  const filters = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={inventorySearch}
          onChange={(e) => {
            setPage(0);
            setInventorySearch(e.target.value);
          }}
          placeholder="Search item #, description, status…"
          title="Search (⌘K)"
          className="min-w-[10rem] flex-1 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
        />
        <Button variant="secondary" onClick={() => setImportOpen(true)} title="Import CSV (⌘⇧I)">
          Import CSV
        </Button>
      </div>
      <FilterChipRow
        label="Status"
        value={statusFilter}
        onChange={(value) => {
          setPage(0);
          setStatusFilter(value);
        }}
        options={INVENTORY_STATUSES.map((status) => ({ value: status, label: status }))}
      />
      {storeCategoryOptions.length > 0 && (
        <FilterChipRow
          label="Category"
          value={categoryFilter}
          onChange={(value) => {
            setPage(0);
            setCategoryFilter(value);
          }}
          options={storeCategoryOptions.map((cat) => ({ value: cat, label: cat }))}
        />
      )}
      <FilterChipRow
        label="Listing phase"
        value={phaseFilter}
        onChange={(value) => {
          setPage(0);
          setPhaseFilter(value);
        }}
        options={[
          { value: "needs_data", label: "Needs data" },
          { value: "ready_to_generate", label: "Ready to generate" },
          { value: "generated", label: "Generated" },
          { value: "needs_quality_remediation", label: "Needs quality fixes" },
          { value: "listing_ready", label: "Listing ready" },
        ]}
      />
    </div>
  );

  const emptyState = (
    <EmptyState
      message={
        inventorySearch.trim() || statusFilter || categoryFilter
          ? "No items match your filters."
          : "No items yet. Add your first inventory item to get started."
      }
      primaryAction={
        inventorySearch.trim() || statusFilter || categoryFilter
          ? {
              label: "Clear filters",
              onClick: () => {
                setInventorySearch("");
                setStatusFilter(null);
                setCategoryFilter(null);
                setPage(0);
              },
            }
          : {
              label: "Add your first item",
              onClick: () => controllerRef.current?.openRecord(null),
            }
      }
      secondaryAction={
        inventorySearch.trim() || statusFilter || categoryFilter
          ? undefined
          : { label: "Import from CSV", onClick: () => setImportOpen(true) }
      }
    />
  );

  // Region-3 panels (immediate-commit; rendered below the editor in SemsEditor.context).
  const region3 = selectedItemId ? (
    <div id="pictures" className="space-y-4">
      <PictureGrid
        inventoryId={selectedItemId}
        item={selectedItem as InventoryItem | null}
        disabled={busyAction != null}
        onItemUpdated={handlePictureItemUpdated}
        onError={(title, message, err) => setApiError(title, message, err)}
      />
      <ConditionPictureGrid
        inventoryId={selectedItemId}
        item={selectedItem as InventoryItem | null}
        disabled={busyAction != null}
        onItemUpdated={handlePictureItemUpdated}
        onError={(title, message, err) => setApiError(title, message, err)}
      />
      <ShotListPanel
        inventoryId={selectedItemId}
        itemVersion={(selectedItem as InventoryItem | null)?.updated_at ?? null}
        disabled={busyAction != null}
        onError={(title, message, err) => setApiError(title, message, err)}
      />
      <MeasurementPhotoPanel
        inventoryId={selectedItemId}
        item={selectedItem as InventoryItem | null}
        disabled={busyAction != null}
        onItemUpdated={(item) => handlePictureItemUpdated(item as InventoryItem)}
        onError={(title, message, err) => setApiError(title, message, err)}
      />
    </div>
  ) : null;

  return (
    <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm">
      <h3 className="mb-3 text-lg font-semibold text-[var(--ui-title)]">Inventory</h3>

      {/* Batch bar — list mode only */}
      {batch.selectionCount > 0 && !isEditMode ? (
        <BatchActionsBar
          selectionLabel={
            batch.selectAllMatching
              ? `All ${batch.selectionCount} matching selected`
              : `${batch.selectionCount} selected`
          }
          onClear={batch.clearSelection}
          selectAllMatching={
            batch.canSelectAllMatching && !batch.selectAllMatching
              ? {
                  total: listTotal,
                  onSelect: batch.selectAllMatchingRows,
                  tooLarge: batch.selectAllMatchingTooLarge,
                }
              : undefined
          }
        >
          <Button
            variant="secondary"
            size="sm"
            busy={batchBusy}
            onClick={() => setBatchStatusOpen(true)}
          >
            Change status…
          </Button>
          <Button
            variant="secondary"
            size="sm"
            busy={busyAction === "batch-status" || batchBusy}
            disabled={isOffline}
            title={isOffline ? "Unavailable while offline" : undefined}
            onClick={() => setBatchRetireOpen(true)}
          >
            Retire
          </Button>
          <Button
            variant="danger"
            size="sm"
            busy={busyAction === "batch-delete" || batchBusy}
            disabled={isOffline}
            title={isOffline ? "Unavailable while offline" : undefined}
            onClick={() => setBatchDeleteOpen(true)}
          >
            Delete
          </Button>
        </BatchActionsBar>
      ) : null}

      <SemsScreen<InventoryItem>
        entityLabel="Item"
        entityLabelPlural="Inventory items"
        columns={inventoryColumns}
        data={inventoryTableData}
        getRowTitle={(item) => item.item_number ?? `#${item.id}`}
        sort={sort}
        onSortChange={(next) => {
          setPage(0);
          setSort(next ?? { key: "updated_at", dir: "desc" });
        }}
        filters={filters}
        pagination={{ page, pageSize, total: listTotal, onPageChange: setPage }}
        emptyState={emptyState}
        onDeleteRow={(item) => setDeleteTarget(item)}
        onOpenChange={handleOpenChange}
        controllerRef={controllerRef}
        addNewLabel="Add new item"
        batchSelection={{
          selectedIds: batch.selectedIds,
          onToggleRow: batch.toggleRow,
          onToggleAllVisible: batch.toggleAllVisible,
          allVisibleSelected: batch.allVisibleSelected,
          indeterminate: batch.headerIndeterminate,
        }}
        renderEditor={({ record, requestClose, done }) =>
          record === null ? (
            <InventoryCreateForm
              requestClose={requestClose}
              done={done}
              onSaved={handleNewItemSaved}
            />
          ) : (
            <InventoryEditorShell
              key={selectedItemId ?? "none"}
              item={selectedItem as InventoryItemDetail | null}
              busy={busyAction != null}
              onItemUpdated={handleDetailItemUpdated}
              onError={(title, message, err) => setApiError(title, message, err)}
              onSuccess={(title, message) => setError({ title, message, actions: [] })}
              onReloadItem={reloadSelectedInventoryItem}
              onRegenerateAi={(ctx) => void generateIntegrated(ctx)}
              regenerateAiBusy={busyAction === "generate-ai"}
              lastGenerateResult={lastGenerateResult}
              requestClose={requestClose}
              done={done}
              context={region3}
            />
          )
        }
      />

      {/* Import modal */}
      <InventoryImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => void reloadInventory()}
        onError={(title, message, err) => setApiError(title, message, err)}
        onSuccess={(title, message) => setError({ title, message, actions: [] })}
      />

      {/* Batch status picker */}
      {batchStatusOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5">
            <h4 className="mb-3 text-lg font-semibold text-[var(--ui-title)]">Change status</h4>
            <select
              value={batchStatusValue}
              onChange={(e) => setBatchStatusValue(e.target.value)}
              className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-sm"
            >
              {INVENTORY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setBatchStatusOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="accent"
                onClick={() => void batchChangeStatus(batchStatusValue)}
                disabled={busyAction != null}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ProgressModal
        open={progressOpen}
        title={progressTitle}
        statusText={progressTitle}
        mode="determinate"
        current={progressCurrent}
        total={progressTotal}
      />

      <ConfirmDialog
        open={batchRetireOpen}
        onClose={() => setBatchRetireOpen(false)}
        onConfirm={() => {
          setBatchRetireOpen(false);
          void batchChangeStatus("Retired");
        }}
        title={`Retire ${batch.selectionCount} items?`}
        description="These items will be marked as Retired. They will remain in your records but will not appear in active inventory."
        confirmLabel="Retire items"
        confirmVariant="danger"
      />

      <ConfirmDialog
        open={batchDeleteOpen}
        onClose={() => setBatchDeleteOpen(false)}
        onConfirm={() => void batchDeleteInventory()}
        title={`Delete ${batch.selectionCount} items?`}
        description="Items with associated orders cannot be deleted and will be skipped."
        confirmLabel="Delete items"
        confirmVariant="danger"
        busy={busyAction === "batch-delete"}
      />

      <ConfirmDialog
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) void deleteItem(deleteTarget); }}
        title="Delete item?"
        description="This will permanently delete the item. Items linked to orders cannot be deleted."
        affectedLabel={deleteTarget?.item_number ? `Item ${deleteTarget.item_number}` : undefined}
        confirmLabel="Delete"
        confirmVariant="danger"
        busy={busyAction === "delete-inventory"}
      />
    </section>
  );
}

export default function InventoryPage() {
  return (
    <Suspense
      fallback={
        <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 text-sm text-[var(--ui-muted)]">
          Loading inventory...
        </section>
      }
    >
      <InventoryPageInner />
    </Suspense>
  );
}
