"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { useConnection } from "@/context/ConnectionContext";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";
import { useTrackRecentlyViewed } from "@/context/RecentlyViewedContext";
import { useUndoRedo } from "@/context/UndoRedoContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { BatchActionsBar } from "@/components/ui/BatchActionsBar";
import { Button } from "@/components/ui/Button";
import { DataTable, type SortState } from "@/components/ui/DataTable";
import { ProgressModal } from "@/components/ui/ProgressModal";
import { useBatchOperation } from "@/hooks/useBatchOperation";
import { useBatchSelection } from "@/hooks/useBatchSelection";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import { PaginationBar } from "@/components/ui/PaginationBar";
import {
  InventoryDetailPanel,
  type InventoryItemDetail,
} from "@/components/inventory/InventoryDetailPanel";
import { InventoryImportModal } from "@/components/inventory/InventoryImportModal";
import {
  ListingQualityScore,
  ListingQualityScoreBadge,
  QualityChecklist,
  type AiImproveStatus,
} from "@/components/inventory/ListingQualityScore";
import { PictureGrid } from "@/components/inventory/PictureGrid";
import { ConditionPictureGrid } from "@/components/inventory/ConditionPictureGrid";
import { DraftRecoveryBanner } from "@/components/ui/DraftRecoveryBanner";
import { FormField } from "@/components/ui/FormField";
import { apiFetch } from "@/lib/api-fetch";
import { stampUiError } from "@/lib/ui-error";
import { useEntityDraft } from "@/hooks/useEntityDraft";
import { clearDraft, draftKey } from "@/lib/form-draft";
import { formStatesEqual } from "@/lib/deep-equal-form";
import {
  itemToListingWorkshopDraft,
  type ListingWorkshopDraft,
} from "@/lib/listing-workshop-draft";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useListSearchFromUrl } from "@/hooks/useListSearchFromUrl";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { usePagination } from "@/hooks/usePagination";
import { Badge } from "@/components/ui/Badge";
import { DuplicateWarning } from "@/components/ui/DuplicateWarning";
import { inventoryRecentlyViewedLabel } from "@/lib/recently-viewed";
import { computeListingScore } from "@/lib/listing-score";
import { patchHeaders } from "@/lib/patch-json";
import type { InlineEditResult } from "@/components/ui/DataTable";
import type {
  ApiErrorShape,
  InventoryItem,
  ListingMode,
  PublishPreview,
  PaginationInfo,
} from "@/types";

const INVENTORY_STATUSES = ["Draft", "In stock", "Listed", "Sold", "Reserved", "Retired"] as const;
const SLOW_MOVER_DAYS = 90;

function getDaysInStock(item: InventoryItem): number {
  const candidates = [item.date_purchased, item.date_listed, item.created_at].filter(
    Boolean
  ) as string[];
  if (candidates.length === 0) return 0;
  const timestamps = candidates.map((d) => new Date(d).getTime()).filter((t) => !isNaN(t));
  if (timestamps.length === 0) return 0;
  return Math.floor((Date.now() - Math.min(...timestamps)) / (1000 * 60 * 60 * 24));
}

type PublishHistory = {
  item?: {
    id: number;
    listing_draft_state: string | null;
    listing_approved_at: string | null;
    listing_published_at: string | null;
    is_listed: number | null;
    etsy_listing_id: string | null;
  };
  previews: Array<{ preview_hash: string; created_at: string; payload_preview: unknown }>;
  imports: Array<{
    id: number;
    export_id: string | null;
    source_label: string | null;
    created_at: string;
  }>;
  exports: Array<{ export_id: string; created_at: string }>;
};

function InventoryPageInner() {
  const {
    setInventory: setGlobalInventory,
    selectedItemId,
    setSelectedItemId,
    selectedItem,
    setSelectedItem,
    publishPreview,
    setPublishPreview,
    publishHistory,
    setPublishHistory,
    publishConfig,
    aiConfig,
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
    selectedItem ?? inventory.find((row) => row.id === selectedItemId) ?? null;
  useTrackRecentlyViewed(
    "inventory",
    selectedItemId,
    inventoryRecentRow ? inventoryRecentlyViewedLabel(inventoryRecentRow) : null
  );

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [scrollToItemId, setScrollToItemId] = useState<number | null>(null);
  const [workshopOpen, setWorkshopOpen] = useState(false);

  useEffect(() => {
    const raw = searchParams.get("itemId");
    const openWorkshop = searchParams.get("openWorkshop") === "1";
    if (!raw) return;
    const id = Number(raw);
    if (!Number.isFinite(id)) return;

    const applyDeepLink = async () => {
      if (inventory.some((row) => row.id === id)) {
        const row = inventory.find((r) => r.id === id) ?? null;
        setSelectedItemId(id);
        setSelectedItem(row);
        setScrollToItemId(id);
        if (openWorkshop) setWorkshopOpen(true);
        router.replace(pathname);
        return;
      }
      try {
        const response = await fetch(`/api/inventory/${id}`, {
          headers: { Accept: "application/json" },
        });
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
          item?: InventoryItem;
        };
        if (!response.ok || !data.item) {
          setError({
            title: "Item not found",
            message: "That inventory item may have been deleted.",
            actions: ["Choose another item from the list."],
          });
          router.replace(pathname);
          return;
        }
        const addIfMissing = (current: InventoryItem[]) =>
          current.some((row) => row.id === id) ? current : [data.item!, ...current];
        setInventory(addIfMissing);
        setGlobalInventory(addIfMissing);
        setSelectedItemId(id);
        setSelectedItem(data.item!);
        setScrollToItemId(id);
        if (openWorkshop) setWorkshopOpen(true);
        router.replace(pathname);
      } catch (err) {
        setApiError("Could not open item", "We could not load the linked inventory item.", err);
      }
    };

    void applyDeepLink();
  }, [searchParams, inventory, setSelectedItemId, setSelectedItem, setInventory, setGlobalInventory, router, pathname, setError, setApiError]);

  useEffect(() => {
    if (!selectedItem) return;
    if (
      selectedItem.listing_draft_state === "generated" ||
      selectedItem.listing_draft_state === "imported"
    ) {
      setWorkshopOpen(true);
    }
  }, [selectedItem]);

  const [newInventoryItemNumber, setNewInventoryItemNumber] = useState("");
  const [newInventoryDescription, setNewInventoryDescription] = useState("");
  const [autoItemNumber, setAutoItemNumber] = useState<string | null>(null);

  const fetchNextItemNumber = useCallback(async () => {
    try {
      const res = await fetch("/api/inventory/next-number", {
        headers: { Accept: "application/json" },
      });
      const data = (await res.json().catch(() => ({}))) as { next_number?: string };
      if (res.ok && data.next_number) {
        setAutoItemNumber(data.next_number);
        setNewInventoryItemNumber(data.next_number);
      }
    } catch {
      /* silent — manual entry still works */
    }
  }, []);

  useEffect(() => {
    void fetchNextItemNumber();
  }, [fetchNextItemNumber]);
  const [listingMode, setListingMode] = useState<ListingMode>("manual");
  const [importPayload, setImportPayload] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [exportPackage, setExportPackage] = useState<unknown | null>(null);
  const [workflowStep, setWorkflowStep] = useState<0 | 1 | 2>(0);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [rejectDraftOpen, setRejectDraftOpen] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [batchStatusOpen, setBatchStatusOpen] = useState(false);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchRetireOpen, setBatchRetireOpen] = useState(false);
  const [batchStatusValue, setBatchStatusValue] = useState<string>("In stock");
  const [inventorySearch, setInventorySearch] = useState("");
  const createItemRef = useRef<HTMLInputElement>(null);
  const [detailDirty, setDetailDirty] = useState(false);
  const listingBaselineKey = selectedItem ? `${selectedItemId}:${selectedItem.updated_at}` : "";
  const [listingBaselineSyncKey, setListingBaselineSyncKey] = useState("");
  const [listingBaseline, setListingBaseline] = useState<ListingWorkshopDraft | null>(null);
  const [pendingItemId, setPendingItemId] = useState<number | null>(null);
  const [discardDirtyOpen, setDiscardDirtyOpen] = useState(false);
  const { setFormDirty, registerOnDiscard } = useUnsavedChanges();

  const listingDirty = useMemo(() => {
    if (!selectedItem || !listingBaseline) return false;
    return !formStatesEqual(itemToListingWorkshopDraft(selectedItem), listingBaseline);
  }, [selectedItem, listingBaseline]);

  useEffect(() => {
    setFormDirty(detailDirty || listingDirty);
  }, [detailDirty, listingDirty, setFormDirty]);

  if (listingBaselineKey !== listingBaselineSyncKey) {
    setListingBaselineSyncKey(listingBaselineKey);
    setListingBaseline(selectedItem ? itemToListingWorkshopDraft(selectedItem) : null);
  }

  const listingDraftCurrent = selectedItem ? itemToListingWorkshopDraft(selectedItem) : null;
  const {
    recovery: listingRecovery,
    recoveryLabel: listingRecoveryLabel,
    dismissRecovery: dismissListingRecovery,
    markDraftClean: markListingDraftClean,
  } = useEntityDraft({
    entityType: "listing_workshop",
    entityId: selectedItemId,
    current: listingDraftCurrent,
    entityVersion: selectedItem?.updated_at,
    isDirty: listingDirty,
    enabled: workshopOpen && selectedItemId != null,
  });
  const [importOpen, setImportOpen] = useState(false);
  const [inventoryDuplicates, setInventoryDuplicates] = useState<
    Array<{ id: number; item_number: string | null; description: string | null }>
  >([]);
  const debouncedInventorySearch = useDebouncedValue(inventorySearch, 300);
  const { page, pageSize, offset, total: listTotal, setPage, setTotal } = usePagination(configPageSize);

  useListSearchFromUrl(setInventorySearch, () => setPage(0));

  useKeyboardShortcuts([
    {
      key: "i",
      modifiers: ["meta", "shift"],
      action: () => setImportOpen(true),
    },
  ]);

  useEffect(() => {
    const handler = () => createItemRef.current?.focus();
    window.addEventListener("esm-new-record", handler);
    return () => window.removeEventListener("esm-new-record", handler);
  }, []);

  const checkInventoryDuplicate = async () => {
    const desc = newInventoryDescription.trim();
    if (desc.length < 5) {
      setInventoryDuplicates([]);
      return;
    }
    try {
      const response = await fetch(
        `/api/inventory/check-duplicate?description=${encodeURIComponent(desc)}`,
        { headers: { Accept: "application/json" } }
      );
      const data = (await response.json().catch(() => ({}))) as {
        duplicates?: Array<{ id: number; item_number: string | null; description: string | null }>;
      };
      if (response.ok) setInventoryDuplicates(data.duplicates ?? []);
    } catch {
      setInventoryDuplicates([]);
    }
  };
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
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

  const handlePictureItemUpdated = (item: InventoryItem) => {
    setSelectedItem(item);
    const updateRow = (current: InventoryItem[]) =>
      current.map((row) => (row.id === item.id ? item : row));
    setInventory(updateRow);
    setGlobalInventory(updateRow);
  };

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

  const selectInventoryItem = (id: number) => {
    if ((detailDirty || listingDirty) && id !== selectedItemId) {
      setPendingItemId(id);
      setDiscardDirtyOpen(true);
      return;
    }
    const row = inventory.find((r) => r.id === id) ?? null;
    setSelectedItemId(id);
    setSelectedItem(row);
  };

  useEffect(() => {
    return registerOnDiscard(() => {
      if (!selectedItem || !listingBaseline) return;
      setSelectedItem({
        ...selectedItem,
        listing_title: listingBaseline.listing_title,
        listing_description: listingBaseline.listing_description,
        listing_tags: listingBaseline.listing_tags,
        listing_category_path: listingBaseline.listing_category_path,
        listing_title_strategy: listingBaseline.listing_title_strategy,
        listing_product_story: listingBaseline.listing_product_story,
        listing_condition_clarity: listingBaseline.listing_condition_clarity,
        listing_attributes: listingBaseline.listing_attributes,
        listing_pricing_shipping_notes: listingBaseline.listing_pricing_shipping_notes,
        listing_quality_checklist: listingBaseline.listing_quality_checklist,
      });
    });
  }, [selectedItem, listingBaseline, registerOnDiscard, setSelectedItem]);

  const applyListingRecovery = (state: ListingWorkshopDraft) => {
    if (!selectedItem) return;
    setSelectedItem({
      ...selectedItem,
      listing_title: state.listing_title,
      listing_description: state.listing_description,
      listing_tags: state.listing_tags,
      listing_category_path: state.listing_category_path,
      listing_title_strategy: state.listing_title_strategy,
      listing_product_story: state.listing_product_story,
      listing_condition_clarity: state.listing_condition_clarity,
      listing_attributes: state.listing_attributes,
      listing_pricing_shipping_notes: state.listing_pricing_shipping_notes,
      listing_quality_checklist: state.listing_quality_checklist,
    });
    dismissListingRecovery();
  };

  const reloadInventory = useCallback(async () => {
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(offset),
    });
    if (debouncedInventorySearch.trim()) params.set("search", debouncedInventorySearch.trim());
    if (statusFilter) params.set("status", statusFilter);
    if (categoryFilter) params.set("store_category", categoryFilter);
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
  }, [debouncedInventorySearch, pageSize, offset, statusFilter, categoryFilter, sort, setInventory, setTotal]);

  useEffect(() => {
    void reloadInventory().catch((err) =>
      setApiError("Could not load inventory", "We could not load inventory.", err)
    );
  }, [reloadInventory, setApiError]);

  const { patchWithUndo, clearStacks } = useUndoRedo();

  useEffect(() => {
    clearStacks();
  }, [selectedItemId, clearStacks]);

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
        render: (item: InventoryItem) => <ListingQualityScoreBadge item={item} minScore={parseInt(publishConfig.minQualityScore, 10) || 80} />,
      },
    ],
    []
  );

  const inventoryTableData = useMemo(() => {
    if (sort?.key !== "listing_score") return inventory;
    return [...inventory].sort((a, b) => {
      const ms = parseInt(publishConfig.minQualityScore, 10) || 80;
      const scoreA = computeListingScore(a, ms).score;
      const scoreB = computeListingScore(b, ms).score;
      return sort.dir === "asc" ? scoreA - scoreB : scoreB - scoreA;
    });
  }, [inventory, sort]);

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
          const remaining = inventory.filter((row) => !removed.has(row.id));
          setSelectedItemId(remaining[0]?.id ?? null);
          setSelectedItem(remaining[0] ?? null);
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

  const canWorkListing = Boolean(selectedItem);
  const canPublish =
    selectedItem?.listing_draft_state === "approved" &&
    Boolean(selectedItem?.listing_approved_at) &&
    (publishPreview?.can_publish ?? false) &&
    (!selectedItem?.updated_at ||
      (selectedItem.listing_approved_at != null &&
        new Date(selectedItem.updated_at).getTime() <=
          new Date(selectedItem.listing_approved_at).getTime()));

  const patchSelectedItem = async (payload: Record<string, unknown>) => {
    if (!selectedItemId) return;
    const response = await apiFetch(`/api/inventory/${selectedItemId}`, {
      method: "PATCH",
      headers: patchHeaders(selectedItem?.updated_at),
      body: JSON.stringify(payload),
    });
    const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
      item?: InventoryItem;
    };
    if (!response.ok) throw data;
    if (data.item) {
      setSelectedItem(data.item);
      const updateRow = (current: InventoryItem[]) =>
        current.map((row) => (row.id === data.item!.id ? data.item! : row));
      setInventory(updateRow);
      setGlobalInventory(updateRow);
    }
  };

  const saveManualListing = async () => {
    if (!selectedItem) return;
    setBusyAction("save-manual");
    try {
      await patchSelectedItem({
        listing_title: selectedItem.listing_title ?? "",
        listing_description: selectedItem.listing_description ?? "",
        listing_tags: selectedItem.listing_tags ?? "",
        listing_category_path: selectedItem.listing_category_path ?? "",
        listing_title_strategy: selectedItem.listing_title_strategy ?? "",
        listing_product_story: selectedItem.listing_product_story ?? "",
        listing_condition_clarity: selectedItem.listing_condition_clarity ?? "",
        listing_attributes: selectedItem.listing_attributes ?? "",
        listing_pricing_shipping_notes: selectedItem.listing_pricing_shipping_notes ?? "",
        listing_quality_checklist: selectedItem.listing_quality_checklist ?? "",
        listing_draft_state: "draft",
        listing_draft_source: "manual",
      });
      markListingDraftClean();
      setError(null);
    } catch (err) {
      setApiError("Could not save listing draft", "We could not save this draft.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const generateIntegrated = async () => {
    if (!selectedItemId) return;
    setBusyAction("generate-ai");
    try {
      const response = await apiFetch(`/api/inventory/${selectedItemId}/generate-listing-content`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
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
      await patchSelectedItem({});
      setError(null);
    } catch (err) {
      setApiError("Could not generate listing", "We could not generate listing content.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const [aiImproveStatus, setAiImproveStatus] = useState<AiImproveStatus>(null);

  const improveWithAi = async () => {
    if (!selectedItemId || aiImproveStatus) return;

    const attempt = async (retryCount: number): Promise<void> => {
      setAiImproveStatus("analyzing");
      await new Promise((r) => setTimeout(r, 400));

      setAiImproveStatus("calling-ai");
      try {
        const response = await apiFetch(`/api/inventory/${selectedItemId}/improve-listing`, {
          method: "POST",
          headers: { Accept: "application/json" },
        });
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
          improved?: boolean;
          previous_score?: number;
          new_score?: number;
          fields_improved?: string[];
          message?: string;
          item?: InventoryItem;
        };

        if (response.status === 429 && retryCount < 2) {
          const canRetry = data?.error?.can_retry !== false;
          if (canRetry) {
            const waitSec = 30;
            for (let s = waitSec; s > 0; s--) {
              setAiImproveStatus(`retry-${s}`);
              await new Promise((r) => setTimeout(r, 1000));
            }
            return attempt(retryCount + 1);
          }
        }

        if (!response.ok) throw data;

        setAiImproveStatus("saving");
        await new Promise((r) => setTimeout(r, 300));

        if (data.improved && data.item) {
          const updatedItem = data.item as InventoryItem;
          setSelectedItem(updatedItem);
          const updateRow = (current: InventoryItem[]) =>
            current.map((row) => (row.id === updatedItem.id ? updatedItem : row));
          setInventory(updateRow);
          setGlobalInventory(updateRow);
          setAiImproveStatus("done");
          setError({
            title: "Listing improved by AI",
            message: `Score: ${data.previous_score ?? "?"} → ${data.new_score ?? "?"}. Updated: ${data.fields_improved?.join(", ") ?? "listing fields"}.`,
            actions: [],
          });
        } else {
          setAiImproveStatus("done");
          setError({
            title: "No changes needed",
            message: data.message ?? "The AI found no text-based improvements to make.",
            actions: [],
          });
        }

        setTimeout(() => setAiImproveStatus(null), 2000);
      } catch (err) {
        setAiImproveStatus(null);
        setApiError("AI improvement failed", "Something went wrong while improving this listing.", err);
      }
    };

    await attempt(0);
  };

  const exportForPortableAi = async () => {
    if (!selectedItemId) return;
    setBusyAction("export-ai");
    try {
      const response = await apiFetch(`/api/inventory/${selectedItemId}/listing-export`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
        package?: unknown;
      };
      if (!response.ok) throw data;
      setExportPackage(data.package ?? null);
      setError(null);
    } catch (err) {
      setApiError("Could not export package", "We could not export the AI handoff package.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const importPortableAiDraft = async () => {
    if (!selectedItemId) return;
    setImportError(null);
    setImportSuccess(false);
    setBusyAction("import-ai");
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(importPayload);
      } catch {
        setImportError("The pasted text is not valid JSON. Copy the AI's full response and try again.");
        setBusyAction(null);
        return;
      }
      const response = await apiFetch(`/api/inventory/${selectedItemId}/listing-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
      if (!response.ok) {
        const msg = data?.error?.user_message ?? data?.error?.message ?? "Import failed.";
        setImportError(msg);
        return;
      }
      await patchSelectedItem({});
      setImportPayload("");
      setImportSuccess(true);
      setError(null);
    } catch (err) {
      const apiErr = err as ApiErrorShape;
      const msg = apiErr?.error?.user_message ?? apiErr?.error?.message ?? "Import failed — check the JSON format.";
      setImportError(msg);
    } finally {
      setBusyAction(null);
    }
  };

  const loadPublishHistory = async () => {
    if (!selectedItemId) return;
    const response = await fetch(`/api/inventory/${selectedItemId}/publish-history?limit=5`, {
      headers: { Accept: "application/json" },
    });
    const data = (await response.json().catch(() => ({}))) as ApiErrorShape & PublishHistory;
    if (!response.ok) throw data;
    setPublishHistory({
      item: data.item,
      previews: Array.isArray(data.previews) ? data.previews : [],
      imports: Array.isArray(data.imports) ? data.imports : [],
      exports: Array.isArray(data.exports) ? data.exports : [],
    });
  };

  const approveDraft = async () => {
    if (!selectedItemId) return;
    setBusyAction("approve-draft");
    try {
      const response = await apiFetch(`/api/inventory/${selectedItemId}/listing-approve`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
      if (!response.ok) throw data;
      await patchSelectedItem({});
      setWorkflowStep(2);
      await loadPublishHistory();
      setError(null);
    } catch (err) {
      setApiError("Could not approve draft", "We could not approve this draft.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const publishApprovedDraft = async () => {
    if (!selectedItemId) return;
    setBusyAction("publish-draft");
    try {
      const response = await apiFetch(`/api/inventory/${selectedItemId}/publish-to-etsy`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ preview_hash: publishPreview?.preview_hash ?? "" }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
      if (!response.ok) throw data;
      await patchSelectedItem({});
      await loadPublishHistory();
      setError(null);
    } catch (err) {
      setApiError("Could not publish listing", "We could not publish this listing.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const reviewPublishPayload = async () => {
    if (!selectedItemId) return;
    setBusyAction("review-publish");
    try {
      const response = await fetch(`/api/inventory/${selectedItemId}/publish-preview`, {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & PublishPreview;
      if (!response.ok) throw data;
      setPublishPreview({
        can_publish: Boolean(data.can_publish),
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
        preview_hash: typeof data.preview_hash === "string" ? data.preview_hash : "",
        preview_generated_at:
          typeof data.preview_generated_at === "string" ? data.preview_generated_at : "",
        staged_flow: Array.isArray(data.staged_flow) ? data.staged_flow : [],
        payload_preview: data.payload_preview ?? null,
      });
      setWorkflowStep(0);
      await loadPublishHistory();
      setError(null);
    } catch (err) {
      setApiError(
        "Could not build publish review",
        "We could not prepare the publish review.",
        err
      );
    } finally {
      setBusyAction(null);
    }
  };

  const rejectDraft = async () => {
    if (!selectedItemId) return;
    setBusyAction("reject-draft");
    try {
      const response = await apiFetch(`/api/inventory/${selectedItemId}/listing-reject`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
      if (!response.ok) throw data;
      await patchSelectedItem({});
      setPublishPreview(null);
      setWorkflowStep(0);
      await loadPublishHistory();
      setError(null);
    } catch (err) {
      setApiError("Could not reject draft", "We could not reject this draft.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const createInventoryRecord = async () => {
    if (!newInventoryItemNumber.trim()) {
      setError({
        title: "Item number required",
        message: "Provide an item number before creating inventory.",
        actions: ["Enter an item number and try again."],
      });
      return;
    }
    setBusyAction("create-inventory");
    try {
      const response = await apiFetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          item_number: newInventoryItemNumber.trim(),
          description: newInventoryDescription.trim(),
          status: "Draft",
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
        item?: InventoryItem;
      };
      if (!response.ok) throw data;
      if (data.item) {
        const addItem = (current: InventoryItem[]) => [
          data.item!,
          ...current.filter((row) => row.id !== data.item!.id),
        ];
        setInventory(addItem);
        setGlobalInventory(addItem);
        setSelectedItemId(data.item.id);
      }
      setNewInventoryDescription("");
      setInventoryDuplicates([]);
      void fetchNextItemNumber();
      setError({ title: "Item created", message: "New inventory item was created successfully.", actions: [] });
    } catch (err) {
      setApiError("Could not create inventory", "We could not create the inventory item.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const deleteSelectedInventory = async () => {
    if (!selectedItemId) return;
    setBusyAction("delete-inventory");
    try {
      const response = await apiFetch(`/api/inventory/${selectedItemId}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      if (!response.ok && response.status !== 204) {
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
        throw data;
      }
      const removeItem = (current: InventoryItem[]) =>
        current.filter((row) => row.id !== selectedItemId);
      setInventory((current) => {
        const remaining = removeItem(current);
        setSelectedItemId(remaining[0]?.id ?? null);
        setSelectedItem(remaining[0] ?? null);
        return remaining;
      });
      setGlobalInventory(removeItem);
      setError(null);
    } catch (err) {
      setApiError("Could not delete inventory", "We could not delete the selected item.", err);
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[var(--ui-title)]">Inventory</h3>
          <p className="text-sm text-[var(--ui-muted)]">
            Item details, pictures, and listing workshop for the selected record.
          </p>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <input
            ref={createItemRef}
            value={newInventoryItemNumber}
            onChange={(e) => setNewInventoryItemNumber(e.target.value)}
            placeholder={autoItemNumber ?? "Item number"}
            className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
          />
          <input
            value={newInventoryDescription}
            onChange={(e) => setNewInventoryDescription(e.target.value)}
            onBlur={() => void checkInventoryDuplicate()}
            placeholder="New item description"
            className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm md:col-span-2"
          />
          <div className="flex flex-wrap gap-2">
            <Link
              href="/listing-coach"
              className="rounded-lg bg-[var(--ui-green)] px-3 py-2 text-sm font-semibold text-black hover:opacity-90"
            >
              Add with Listing Coach
            </Link>
            <button
              type="button"
              onClick={createInventoryRecord}
              disabled={busyAction != null}
              title="New item (⌘N)"
              className="rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busyAction === "create-inventory" ? "Creating..." : "Add item"}
            </button>
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={busyAction != null || !selectedItemId || isOffline}
              title={isOffline ? "Unavailable while offline" : "Delete selected item"}
              className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60"
            >
              Delete selected
            </button>
            <Button
              variant="primary"
              size="sm"
              disabled={!selectedItemId}
              onClick={() => {
                const next = !workshopOpen;
                setWorkshopOpen(next);
                if (next) {
                  requestAnimationFrame(() => {
                    document
                      .getElementById("listing-workshop-panel")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  });
                }
              }}
            >
              {workshopOpen ? "Hide workshop" : "Listing workshop"}
            </Button>
          </div>
        </div>
        {selectedItemId ? (
          <p className="mt-2 text-xs text-[var(--ui-muted)]">
            Selected: <strong className="text-[var(--ui-body)]">{selectedItem?.item_number ?? `#${selectedItemId}`}</strong>
            {selectedItem?.listing_title ? ` — ${selectedItem.listing_title}` : ""}
          </p>
        ) : null}
        {inventoryDuplicates.length > 0 ? (
          <DuplicateWarning
            message="Similar items found. Continue creating?"
            links={inventoryDuplicates.map((row) => ({
              href: `/inventory?itemId=${row.id}`,
              label: `${row.item_number ?? `#${row.id}`} — ${(row.description ?? "").slice(0, 40)}`,
            }))}
            onDismiss={() => setInventoryDuplicates([])}
          />
        ) : null}
      </div>

      {batch.selectionCount > 0 ? (
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

      <div className="mb-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-[var(--ui-title)]">Inventory items</p>
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
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            title="Import CSV (⌘⇧I)"
            className="rounded-lg border border-[var(--ui-border)] px-3 py-1.5 text-sm"
          >
            Import CSV
          </button>
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
        {listTotal === 0 ? (
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
                : { label: "Add your first item", onClick: () => createItemRef.current?.focus() }
            }
            secondaryAction={
              inventorySearch.trim() || statusFilter || categoryFilter
                ? undefined
                : { label: "Import from CSV", onClick: () => setImportOpen(true) }
            }
          />
        ) : (
          <>
            <DataTable
              columns={inventoryColumns}
              data={inventoryTableData}
              selectedId={selectedItemId}
              selection={{
                selectedIds: batch.selectedIds,
                onToggleRow: batch.toggleRow,
                onToggleAllVisible: batch.toggleAllVisible,
                allVisibleSelected: batch.allVisibleSelected,
                indeterminate: batch.headerIndeterminate,
              }}
              onRowClick={(item) => selectInventoryItem(item.id)}
              onDeleteRow={(item) => {
                setSelectedItemId(item.id);
                setSelectedItem(item);
                setDeleteConfirmOpen(true);
              }}
              onInlineEdit={handleInventoryInlineEdit}
              onRowPatched={handleInventoryRowPatched}
              sort={sort}
              onSortChange={(next) => {
                setPage(0);
                setSort(next ?? { key: "updated_at", dir: "desc" });
              }}
              emptyMessage="No items on this page."
              scrollToId={scrollToItemId}
              keyboardNav
            />
            <PaginationBar
              page={page}
              pageSize={pageSize}
              total={listTotal}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      <InventoryDetailPanel
        item={selectedItem as InventoryItemDetail | null}
        busy={busyAction != null}
        onItemUpdated={handleDetailItemUpdated}
        onError={(title, message, err) => setApiError(title, message, err)}
        onSuccess={(title, message) => setError({ title, message, actions: [] })}
        onReloadItem={reloadSelectedInventoryItem}
        onDirtyChange={setDetailDirty}
      />

      {workshopOpen && selectedItemId ? (
        <div id="listing-workshop-panel" className="mb-4">
          {canWorkListing ? (
            <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1 space-y-4">
              {selectedItem ? null : null}
              {listingRecovery && listingRecoveryLabel ? (
                <DraftRecoveryBanner
                  savedAtLabel={listingRecoveryLabel}
                  onRestore={() => applyListingRecovery(listingRecovery.formState)}
                  onDiscard={dismissListingRecovery}
                />
              ) : null}
              <p className="text-xs text-[var(--ui-muted)]">
                <Link href="/config" className="text-[var(--ui-accent)] hover:underline">
                  Configure AI and publish settings →
                </Link>
              </p>

              <div className="flex flex-wrap gap-2">
                {(["manual", "integrated_ai", "portable_import"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setListingMode(mode)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium ${
                      listingMode === mode
                        ? "bg-[var(--ui-accent)] text-white"
                        : "border border-[var(--ui-border)]"
                    }`}
                  >
                    {mode === "manual"
                      ? "Manual"
                      : mode === "integrated_ai"
                        ? "Generate in app"
                        : "Import AI draft"}
                  </button>
                ))}
              </div>

              {listingMode === "manual" && selectedItem && (
                <div className="space-y-3">
                  <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3 text-xs text-[var(--ui-body)]">
                    <p className="mb-1 font-semibold text-[var(--ui-title)]">
                      Manual mode requirements
                    </p>
                    <p>
                      Fill in the listing fields below by hand.{" "}
                      <span className="text-[var(--ui-red)]">*</span> fields are required before
                      you can save and approve a draft.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <FormField label="Title strategy">
                      <textarea
                        placeholder="How will you position this item?"
                        value={selectedItem.listing_title_strategy ?? ""}
                        onChange={(e) =>
                          setSelectedItem({
                            ...selectedItem,
                            listing_title_strategy: e.target.value,
                          })
                        }
                        spellCheck
                        className="min-h-24 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm"
                      />
                    </FormField>
                    <FormField label="Product story / details">
                      <textarea
                        placeholder="History, provenance, key features…"
                        value={selectedItem.listing_product_story ?? ""}
                        onChange={(e) =>
                          setSelectedItem({
                            ...selectedItem,
                            listing_product_story: e.target.value,
                          })
                        }
                        spellCheck
                        className="min-h-24 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm"
                      />
                    </FormField>
                    <FormField label="Condition clarity">
                      <textarea
                        placeholder="Condition details and any defect disclosure"
                        value={selectedItem.listing_condition_clarity ?? ""}
                        onChange={(e) =>
                          setSelectedItem({
                            ...selectedItem,
                            listing_condition_clarity: e.target.value,
                          })
                        }
                        spellCheck
                        className="min-h-24 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm"
                      />
                    </FormField>
                    <FormField label="Attributes and category fit">
                      <textarea
                        placeholder="Material, era, dimensions, style…"
                        value={selectedItem.listing_attributes ?? ""}
                        onChange={(e) =>
                          setSelectedItem({
                            ...selectedItem,
                            listing_attributes: e.target.value,
                          })
                        }
                        spellCheck
                        className="min-h-24 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm"
                      />
                    </FormField>
                    <FormField label="Pricing and shipping notes">
                      <textarea
                        placeholder="Pricing rationale, shipping instructions…"
                        value={selectedItem.listing_pricing_shipping_notes ?? ""}
                        onChange={(e) =>
                          setSelectedItem({
                            ...selectedItem,
                            listing_pricing_shipping_notes: e.target.value,
                          })
                        }
                        spellCheck
                        className="min-h-24 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm"
                      />
                    </FormField>
                    <FormField label="Final quality checklist">
                      <textarea
                        placeholder="Pre-publish review notes…"
                        value={selectedItem.listing_quality_checklist ?? ""}
                        onChange={(e) =>
                          setSelectedItem({
                            ...selectedItem,
                            listing_quality_checklist: e.target.value,
                          })
                        }
                        spellCheck
                        className="min-h-24 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm"
                      />
                    </FormField>
                    <FormField label="Listing title" required>
                      <input
                        placeholder="e.g. Vintage 1950s Pink Depression Glass…"
                        value={selectedItem.listing_title ?? ""}
                        onChange={(e) =>
                          setSelectedItem({ ...selectedItem, listing_title: e.target.value })
                        }
                        spellCheck
                        className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm"
                      />
                    </FormField>
                    <FormField label="Listing tags" required helpText="Search tags for Etsy. Up to 13 tags, each up to 20 characters. Choose words buyers would search for.">
                      <input
                        placeholder="Comma separated, up to 13"
                        value={selectedItem.listing_tags ?? ""}
                        onChange={(e) =>
                          setSelectedItem({ ...selectedItem, listing_tags: e.target.value })
                        }
                        className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm"
                      />
                    </FormField>
                    <FormField label="Category path">
                      <input
                        placeholder="e.g. Home & Living > Kitchen > Glassware"
                        value={selectedItem.listing_category_path ?? ""}
                        onChange={(e) =>
                          setSelectedItem({
                            ...selectedItem,
                            listing_category_path: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm lg:col-span-2"
                      />
                    </FormField>
                    <FormField label="Listing description" required>
                      <textarea
                        placeholder="Full listing description for Etsy…"
                        value={selectedItem.listing_description ?? ""}
                        onChange={(e) =>
                          setSelectedItem({
                            ...selectedItem,
                            listing_description: e.target.value,
                          })
                        }
                        spellCheck
                        className="min-h-28 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm lg:col-span-2"
                      />
                    </FormField>
                    <div className="lg:col-span-2">
                      <button
                        type="button"
                        onClick={saveManualListing}
                        disabled={busyAction != null}
                        className="rounded-lg bg-[var(--ui-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {busyAction === "save-manual" ? "Saving..." : "Save manual draft"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {listingMode === "integrated_ai" && (
                <div className="space-y-3">
                  <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3 text-xs text-[var(--ui-body)]">
                    <p className="mb-1 font-semibold text-[var(--ui-title)]">
                      Generate in app — requirements
                    </p>
                    <ul className="list-disc space-y-0.5 pl-4">
                      <li>
                        OpenAI API key —{" "}
                        <strong
                          className={
                            aiConfig?.apiKeyConfigured
                              ? "text-[var(--ui-green)]"
                              : "text-[var(--ui-red)]"
                          }
                        >
                          {aiConfig?.apiKeyConfigured ? "configured" : "missing"}
                        </strong>
                      </li>
                      <li>Item number, description, condition code, and sale price must be set</li>
                      <li>At least one photo uploaded</li>
                    </ul>
                    {!aiConfig?.apiKeyConfigured ? (
                      <p className="mt-2 text-[var(--ui-yellow)]">
                        Set your API key in{" "}
                        <Link href="/config" className="text-[var(--ui-accent)] hover:underline">
                          Config → AI Settings
                        </Link>{" "}
                        or in <code className="text-[var(--ui-body)]">.env.local</code>.
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm">
                    <p>
                      Provider: <strong>{aiConfig?.provider ?? "openai"}</strong> | Model:{" "}
                      <strong>{aiConfig?.model ?? "gpt-4.1-mini"}</strong>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={generateIntegrated}
                    disabled={busyAction != null || !aiConfig?.apiKeyConfigured}
                    className="rounded-lg bg-[var(--ui-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {busyAction === "generate-ai" ? "Generating..." : "Generate listing in app"}
                  </button>
                </div>
              )}

              {listingMode === "portable_import" && (
                <div className="space-y-3">
                  <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3 text-xs text-[var(--ui-body)]">
                    <p className="mb-1 font-semibold text-[var(--ui-title)]">
                      Import AI draft — how it works
                    </p>
                    <ol className="list-decimal space-y-0.5 pl-4">
                      <li>Click <strong>Export package</strong> to get the item context as JSON</li>
                      <li>Paste it into your preferred AI (ChatGPT, Claude, etc.)</li>
                      <li>Copy the AI&apos;s JSON response and paste it into the import box</li>
                      <li>Click <strong>Import AI draft</strong> to save</li>
                    </ol>
                    <p className="mt-2 text-[var(--ui-yellow)]">
                      Required fields in the AI response: <strong>listing_title</strong>,{" "}
                      <strong>listing_description</strong>, and <strong>listing_tags</strong>.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={exportForPortableAi}
                      disabled={busyAction != null}
                      className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm"
                    >
                      {busyAction === "export-ai" ? "Exporting..." : "Export package"}
                    </button>
                    <button
                      type="button"
                      onClick={importPortableAiDraft}
                      disabled={busyAction != null || importPayload.trim().length === 0}
                      className="rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {busyAction === "import-ai" ? "Importing..." : "Import AI draft"}
                    </button>
                  </div>
                  {exportPackage != null && (
                    <textarea
                      readOnly
                      value={JSON.stringify(exportPackage, null, 2) ?? ""}
                      className="min-h-40 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 font-mono text-xs"
                    />
                  )}
                  <textarea
                    placeholder="Paste AI output JSON here for import"
                    value={importPayload}
                    onChange={(e) => {
                      setImportPayload(e.target.value);
                      setImportError(null);
                      setImportSuccess(false);
                    }}
                    className="min-h-40 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 font-mono text-xs"
                  />
                  {importError ? (
                    <p className="text-sm text-[var(--ui-red)]">{importError}</p>
                  ) : null}
                  {importSuccess ? (
                    <p className="text-sm text-[var(--ui-green)]">Draft imported successfully.</p>
                  ) : null}
                </div>
              )}

              {listingMode !== "manual" && selectedItem && (selectedItem.listing_title || selectedItem.listing_description || selectedItem.listing_tags) ? (
                <div className="space-y-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
                  <p className="text-xs font-semibold text-[var(--ui-title)]">Etsy Listing Details</p>
                  {selectedItem.listing_title ? (
                    <div>
                      <p className="text-[10px] font-medium text-[var(--ui-muted)]">Title</p>
                      <p className="text-sm text-[var(--ui-body)]">{selectedItem.listing_title}</p>
                    </div>
                  ) : null}
                  {selectedItem.listing_tags ? (
                    <div>
                      <p className="text-[10px] font-medium text-[var(--ui-muted)]">Tags</p>
                      <p className="text-sm text-[var(--ui-body)]">{selectedItem.listing_tags}</p>
                    </div>
                  ) : null}
                  {selectedItem.listing_category_path ? (
                    <div>
                      <p className="text-[10px] font-medium text-[var(--ui-muted)]">Category path</p>
                      <p className="text-sm text-[var(--ui-body)]">{selectedItem.listing_category_path}</p>
                    </div>
                  ) : null}
                  {selectedItem.category_tags ? (
                    <div>
                      <p className="text-[10px] font-medium text-[var(--ui-muted)]">Category tags</p>
                      <p className="text-sm text-[var(--ui-body)]">{selectedItem.category_tags}</p>
                    </div>
                  ) : null}
                  {selectedItem.listing_description ? (
                    <div>
                      <p className="text-[10px] font-medium text-[var(--ui-muted)]">Description</p>
                      <p className="whitespace-pre-wrap text-sm text-[var(--ui-body)]">{selectedItem.listing_description}</p>
                    </div>
                  ) : null}
                  {selectedItem.listing_title_strategy ? (
                    <div>
                      <p className="text-[10px] font-medium text-[var(--ui-muted)]">Title strategy</p>
                      <p className="text-sm text-[var(--ui-body)]">{selectedItem.listing_title_strategy}</p>
                    </div>
                  ) : null}
                  {selectedItem.listing_product_story ? (
                    <div>
                      <p className="text-[10px] font-medium text-[var(--ui-muted)]">Product story</p>
                      <p className="whitespace-pre-wrap text-sm text-[var(--ui-body)]">{selectedItem.listing_product_story}</p>
                    </div>
                  ) : null}
                  {selectedItem.listing_condition_clarity ? (
                    <div>
                      <p className="text-[10px] font-medium text-[var(--ui-muted)]">Condition clarity</p>
                      <p className="text-sm text-[var(--ui-body)]">{selectedItem.listing_condition_clarity}</p>
                    </div>
                  ) : null}
                  {selectedItem.listing_attributes ? (
                    <div>
                      <p className="text-[10px] font-medium text-[var(--ui-muted)]">Attributes</p>
                      <p className="text-sm text-[var(--ui-body)]">{selectedItem.listing_attributes}</p>
                    </div>
                  ) : null}
                  {selectedItem.listing_pricing_shipping_notes ? (
                    <div>
                      <p className="text-[10px] font-medium text-[var(--ui-muted)]">Pricing &amp; shipping notes</p>
                      <p className="text-sm text-[var(--ui-body)]">{selectedItem.listing_pricing_shipping_notes}</p>
                    </div>
                  ) : null}
                  {selectedItem.listing_quality_checklist ? (
                    <div>
                      <p className="text-[10px] font-medium text-[var(--ui-muted)]">Quality checklist</p>
                      <p className="whitespace-pre-wrap text-sm text-[var(--ui-body)]">{selectedItem.listing_quality_checklist}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <FormField label="Draft state" helpText="Listing drafts progress through stages: draft → generated/imported → approved → published. Only approved drafts can be published to Etsy.">
                <input
                  readOnly
                  value={selectedItem?.listing_draft_state ?? "none"}
                  className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm text-[var(--ui-muted)]"
                />
              </FormField>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={reviewPublishPayload}
                  disabled={busyAction != null}
                  className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm"
                >
                  {busyAction === "review-publish" ? "Reviewing..." : "Review"}
                </button>
                <button
                  type="button"
                  onClick={() => setWorkflowStep((s) => (s > 0 ? ((s - 1) as 0 | 1 | 2) : s))}
                  disabled={busyAction != null || workflowStep === 0}
                  className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setWorkflowStep((s) => (s < 2 ? ((s + 1) as 0 | 1 | 2) : s))}
                  disabled={busyAction != null || workflowStep === 2}
                  className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60"
                >
                  Continue
                </button>
                <button
                  type="button"
                  onClick={approveDraft}
                  disabled={busyAction != null}
                  className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm"
                >
                  {busyAction === "approve-draft" ? "Approving..." : "Approve draft"}
                </button>
                <button
                  type="button"
                  onClick={() => setRejectDraftOpen(true)}
                  disabled={busyAction != null}
                  className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm"
                >
                  {busyAction === "reject-draft" ? "Rejecting..." : "Reject"}
                </button>
                <button
                  type="button"
                  onClick={() => setPublishConfirmOpen(true)}
                  disabled={busyAction != null || !canPublish || workflowStep < 2}
                  className="rounded-lg bg-[var(--ui-green)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busyAction === "publish-draft" ? "Publishing..." : "Publish to Etsy"}
                </button>
              </div>
              {!canPublish && (
                <p className="text-xs text-[var(--ui-yellow)]">
                  Publish is locked until review is completed and this exact draft is approved.
                </p>
              )}

              {publishPreview && (
                <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
                  <p className="text-sm">
                    Review status:{" "}
                    <strong>
                      {publishPreview.can_publish ? "ready to publish" : "action needed"}
                    </strong>
                  </p>
                  <p className="mt-1 text-xs text-[var(--ui-muted)]">
                    Preview hash: {publishPreview.preview_hash || "not available"} | Generated:{" "}
                    {publishPreview.preview_generated_at || "unknown"}
                  </p>
                  {publishPreview.warnings.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--ui-yellow)]">
                      {publishPreview.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  )}
                  {publishPreview.staged_flow.length > 0 && (
                    <div className="mt-2 text-xs text-[var(--ui-muted)]">
                      Flow: {publishPreview.staged_flow.join(" -> ")}
                    </div>
                  )}
                  <textarea
                    readOnly
                    value={JSON.stringify(publishPreview.payload_preview, null, 2)}
                    className="mt-2 min-h-40 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3 font-mono text-xs"
                  />
                </div>
              )}

              <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Publish audit</p>
                  <button
                    type="button"
                    onClick={async () => {
                      setBusyAction("refresh-history");
                      try {
                        await loadPublishHistory();
                        setError(null);
                      } catch (err) {
                        setApiError(
                          "Could not refresh publish audit",
                          "We could not refresh publish audit history.",
                          err
                        );
                      } finally {
                        setBusyAction(null);
                      }
                    }}
                    disabled={busyAction != null}
                    className="rounded-lg border border-[var(--ui-border)] px-3 py-1.5 text-xs"
                  >
                    {busyAction === "refresh-history" ? "Refreshing..." : "Refresh"}
                  </button>
                </div>
                {!publishHistory ? (
                  <p className="mt-2 text-xs text-[var(--ui-muted)]">No audit data loaded yet.</p>
                ) : (
                  <>
                    <p className="mt-2 text-xs text-[var(--ui-muted)]">
                      Listed: {publishHistory.item?.is_listed ? "yes" : "no"} | Etsy listing id:{" "}
                      {publishHistory.item?.etsy_listing_id || "not set"} | Approved:{" "}
                      {publishHistory.item?.listing_approved_at || "not approved"} | Published:{" "}
                      {publishHistory.item?.listing_published_at || "not published"}
                    </p>
                    <div className="mt-2 text-xs text-[var(--ui-muted)]">
                      Latest previews:{" "}
                      {publishHistory.previews
                        .slice(0, 3)
                        .map((entry) => `${entry.created_at} (${entry.preview_hash.slice(0, 12)})`)
                        .join(" | ") || "none"}
                    </div>
                    <div className="mt-1 text-xs text-[var(--ui-muted)]">
                      Imports: {publishHistory.imports.length} | Exports:{" "}
                      {publishHistory.exports.length}
                    </div>
                  </>
                )}
              </div>
            </div>
            {selectedItem ? (
              <div className="hidden w-[240px] shrink-0 self-start lg:block">
                <QualityChecklist
                  item={selectedItem}
                  minScore={parseInt(publishConfig.minQualityScore, 10) || 80}
                  onImproveWithAi={improveWithAi}
                  aiStatus={aiImproveStatus}
                  aiConfigured={aiConfig?.apiKeyConfigured ?? false}
                />
              </div>
            ) : null}
            </div>
          ) : (
            <p className="text-sm text-[var(--ui-muted)]">Loading listing workshop…</p>
          )}
        </div>
      ) : null}

      <div className="mb-4 space-y-4">
        <PictureGrid
          inventoryId={selectedItemId}
          item={selectedItem}
          disabled={busyAction != null}
          onItemUpdated={handlePictureItemUpdated}
          onError={(title, message, err) => setApiError(title, message, err)}
        />
        <ConditionPictureGrid
          inventoryId={selectedItemId}
          item={selectedItem}
          disabled={busyAction != null}
          onItemUpdated={handlePictureItemUpdated}
          onError={(title, message, err) => setApiError(title, message, err)}
        />
      </div>

      <InventoryImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => void reloadInventory()}
        onError={(title, message, err) => setApiError(title, message, err)}
        onSuccess={(title, message) => setError({ title, message, actions: [] })}
      />

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
              <button
                type="button"
                onClick={() => setBatchStatusOpen(false)}
                className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void batchChangeStatus(batchStatusValue)}
                disabled={busyAction != null}
                className="rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Apply
              </button>
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
        open={discardDirtyOpen}
        onClose={() => {
          setDiscardDirtyOpen(false);
          setPendingItemId(null);
        }}
        onConfirm={() => {
          if (selectedItemId != null) {
            clearDraft(draftKey("inventory", selectedItemId));
            clearDraft(draftKey("listing_workshop", selectedItemId));
          }
          setDiscardDirtyOpen(false);
          if (pendingItemId != null) setSelectedItemId(pendingItemId);
          setPendingItemId(null);
          setDetailDirty(false);
        }}
        title="Unsaved changes"
        description="You have unsaved changes that will be lost. What would you like to do?"
        cancelLabel="Keep editing"
        confirmLabel="Discard changes"
        confirmVariant="danger"
      />

      <ConfirmDialog
        open={rejectDraftOpen}
        onClose={() => setRejectDraftOpen(false)}
        onConfirm={() => {
          setRejectDraftOpen(false);
          void rejectDraft();
        }}
        title="Reject draft?"
        description="This will reset the listing to draft state. You can generate or write new content afterward."
        confirmLabel="Reject"
        confirmVariant="danger"
      />
      <ConfirmDialog
        open={publishConfirmOpen}
        onClose={() => setPublishConfirmOpen(false)}
        onConfirm={() => {
          setPublishConfirmOpen(false);
          void publishApprovedDraft();
        }}
        title="Publish to Etsy?"
        description={`Publish ${selectedItem?.item_number ? `item ${selectedItem.item_number}` : "this item"}${selectedItem?.listing_title ? ` — "${selectedItem.listing_title}"` : ""} to your Etsy shop.`}
        confirmLabel="Publish"
        confirmVariant="accent"
      />
      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          setDeleteConfirmOpen(false);
          void deleteSelectedInventory();
        }}
        title="Delete item?"
        description="This will permanently delete the item. Items linked to orders cannot be deleted."
        affectedLabel={selectedItem?.item_number ? `Item ${selectedItem.item_number}` : undefined}
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
