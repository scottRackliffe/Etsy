"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
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
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import { PaginationBar } from "@/components/ui/PaginationBar";
import {
  InventoryDetailPanel,
  type InventoryItemDetail,
} from "@/components/inventory/InventoryDetailPanel";
import { InventoryImportModal } from "@/components/inventory/InventoryImportModal";
import {
  ListingQualityScoreBadge,
} from "@/components/inventory/ListingQualityScore";
import { PictureGrid } from "@/components/inventory/PictureGrid";
import { ConditionPictureGrid } from "@/components/inventory/ConditionPictureGrid";
import { ShotListPanel } from "@/components/inventory/ShotListPanel";
import { MeasurementPhotoPanel } from "@/components/inventory/MeasurementPhotoPanel";
import { apiFetch } from "@/lib/api-fetch";
import { stampUiError } from "@/lib/ui-error";
import { clearDraft, draftKey } from "@/lib/form-draft";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useListSearchFromUrl } from "@/hooks/useListSearchFromUrl";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { usePagination } from "@/hooks/usePagination";
import { Badge } from "@/components/ui/Badge";
import { inventoryRecentlyViewedLabel } from "@/lib/recently-viewed";
import { computeListingScore } from "@/lib/listing-score";
import { patchHeaders } from "@/lib/patch-json";
import type { InlineEditResult } from "@/components/ui/DataTable";
import type {
  ApiErrorShape,
  InventoryItem,
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

  useEffect(() => {
    const raw = searchParams.get("itemId");
    if (!raw) return;
    const id = Number(raw);
    if (!Number.isFinite(id)) return;

    const applyDeepLink = async () => {
      if (inventory.some((row) => row.id === id)) {
        const row = inventory.find((r) => r.id === id) ?? null;
        setSelectedItemId(id);
        setSelectedItem(row);
        setScrollToItemId(id);
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
        router.replace(pathname);
      } catch (err) {
        setApiError("Could not open item", "We could not load the linked inventory item.", err);
      }
    };

    void applyDeepLink();
  }, [searchParams, inventory, setSelectedItemId, setSelectedItem, setInventory, setGlobalInventory, router, pathname, setError, setApiError]);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [batchStatusOpen, setBatchStatusOpen] = useState(false);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchRetireOpen, setBatchRetireOpen] = useState(false);
  const [batchStatusValue, setBatchStatusValue] = useState<string>("In stock");
  const [inventorySearch, setInventorySearch] = useState("");
  const [detailDirty, setDetailDirty] = useState(false);
  const [pendingItemId, setPendingItemId] = useState<number | null>(null);
  const [discardDirtyOpen, setDiscardDirtyOpen] = useState(false);
  const { setFormDirty } = useUnsavedChanges();

  useEffect(() => {
    setFormDirty(detailDirty);
  }, [detailDirty, setFormDirty]);
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
  ]);

  useEffect(() => {
    const handler = () => router.push("/listing-coach");
    window.addEventListener("esm-new-record", handler);
    return () => window.removeEventListener("esm-new-record", handler);
  }, [router]);

  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [phaseFilter, setPhaseFilter] = useState<string | null>(null);
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
    if (detailDirty && id !== selectedItemId) {
      setPendingItemId(id);
      setDiscardDirtyOpen(true);
      return;
    }
    const row = inventory.find((r) => r.id === id) ?? null;
    setSelectedItemId(id);
    setSelectedItem(row);
  };

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
    if (data.items) {
      setInventory(data.items);
      if (selectedItemId != null && !data.items.some((row) => row.id === selectedItemId)) {
        setSelectedItemId(data.items[0]?.id ?? null);
        setSelectedItem(data.items[0] ?? null);
      }
    }
    if (data.pagination) setTotal(data.pagination.total);
  }, [debouncedInventorySearch, pageSize, offset, statusFilter, categoryFilter, phaseFilter, sort, setInventory, setTotal, selectedItemId, setSelectedItemId, setSelectedItem]);

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
        render: (item: InventoryItem) => <ListingQualityScoreBadge item={item} minScore={parseInt(publishConfig.minQualityScore, 10) || 85} />,
      },
    ],
    []
  );

  const inventoryTableData = useMemo(() => {
    if (sort?.key !== "listing_score") return inventory;
    return [...inventory].sort((a, b) => {
      const ms = parseInt(publishConfig.minQualityScore, 10) || 85;
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
      {/* Items toolbar */}
      <div className="mb-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/listing-coach"
              className="rounded-lg bg-[var(--ui-green)] px-4 py-2 text-sm font-semibold text-black hover:opacity-90"
            >
              Add New Item
            </Link>
            <Button variant="danger" onClick={() => setDeleteConfirmOpen(true)} disabled={busyAction != null || !selectedItemId || isOffline} title={isOffline ? "Unavailable while offline" : "Delete selected item"}>
              Delete selected
            </Button>
          </div>
          {selectedItemId ? (
            <p className="mt-2 text-xs text-[var(--ui-muted)]">
              Selected: <strong className="text-[var(--ui-body)]">{selectedItem?.item_number ?? `#${selectedItemId}`}</strong>
              {selectedItem?.listing_title ? ` — ${selectedItem.listing_title}` : ""}
            </p>
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
                : { label: "Add your first item", onClick: () => router.push("/listing-coach") }
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
        onRegenerateAi={() => void generateIntegrated()}
        regenerateAiBusy={busyAction === "generate-ai"}
      />

      <div id="pictures" className="mb-4 space-y-4">
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
        <ShotListPanel
          inventoryId={selectedItemId}
          itemVersion={selectedItem?.updated_at ?? null}
          disabled={busyAction != null}
          onError={(title, message, err) => setApiError(title, message, err)}
        />
        <MeasurementPhotoPanel
          inventoryId={selectedItemId}
          item={selectedItem}
          disabled={busyAction != null}
          onItemUpdated={(item) => handlePictureItemUpdated(item as InventoryItem)}
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
              <Button variant="secondary" onClick={() => setBatchStatusOpen(false)}>
                Cancel
              </Button>
              <Button variant="accent" onClick={() => void batchChangeStatus(batchStatusValue)} disabled={busyAction != null}>
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
        open={discardDirtyOpen}
        onClose={() => {
          setDiscardDirtyOpen(false);
          setPendingItemId(null);
        }}
        onConfirm={() => {
          if (selectedItemId != null) {
            clearDraft(draftKey("inventory", selectedItemId));
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
