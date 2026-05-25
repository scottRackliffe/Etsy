"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";
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
import { InventoryDetailPanel, type InventoryItemDetail } from "@/components/inventory/InventoryDetailPanel";
import { InventoryImportModal } from "@/components/inventory/InventoryImportModal";
import { PictureGrid } from "@/components/inventory/PictureGrid";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useListSearchFromUrl } from "@/hooks/useListSearchFromUrl";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { usePagination } from "@/hooks/usePagination";
import { DuplicateWarning } from "@/components/ui/DuplicateWarning";
import type { ApiErrorShape, InventoryItem, AiConfig, ListingMode, PublishPreview, PaginationInfo } from "@/types";

const INVENTORY_STATUSES = ["Draft", "In stock", "Listed", "Sold", "Reserved", "Retired"] as const;

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
  imports: Array<{ id: number; export_id: string | null; source_label: string | null; created_at: string }>;
  exports: Array<{ export_id: string; created_at: string }>;
};

function InventoryPageInner() {
  const {
    inventory, setInventory,
    selectedItemId, setSelectedItemId,
    selectedItem, setSelectedItem,
    listingReadiness, publishPreview, setPublishPreview,
    publishHistory, setPublishHistory,
    aiConfig, setAiConfig, publishConfig, setPublishConfig,
    busyAction, setBusyAction, setApiError, setError,
  } = useApp();

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
        setSelectedItemId(id);
        setScrollToItemId(id);
        router.replace(pathname);
        return;
      }
      try {
        const response = await fetch(`/api/inventory/${id}`, { headers: { Accept: "application/json" } });
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { item?: InventoryItem };
        if (!response.ok || !data.item) {
          setError({
            title: "Item not found",
            message: "That inventory item may have been deleted.",
            actions: ["Choose another item from the list."],
          });
          router.replace(pathname);
          return;
        }
        setInventory((current) =>
          current.some((row) => row.id === id) ? current : [data.item!, ...current]
        );
        setSelectedItemId(id);
        setSelectedItem(data.item!);
        setScrollToItemId(id);
        router.replace(pathname);
      } catch (err) {
        setApiError("Could not open item", "We could not load the linked inventory item.", err);
      }
    };

    void applyDeepLink();
  }, [searchParams, inventory, setSelectedItemId, setSelectedItem, setInventory, router, pathname, setError, setApiError]);

  const [newInventoryItemNumber, setNewInventoryItemNumber] = useState("");
  const [newInventoryDescription, setNewInventoryDescription] = useState("");
  const [listingMode, setListingMode] = useState<ListingMode>("manual");
  const [importPayload, setImportPayload] = useState("");
  const [exportPackage, setExportPackage] = useState<unknown | null>(null);
  const [workflowStep, setWorkflowStep] = useState<0 | 1 | 2>(0);
  const [aiApiKeyDraft, setAiApiKeyDraft] = useState("");
  const [aiSettingsSaving, setAiSettingsSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [batchStatusOpen, setBatchStatusOpen] = useState(false);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchStatusValue, setBatchStatusValue] = useState<string>("In stock");
  const [inventorySearch, setInventorySearch] = useState("");
  const createItemRef = useRef<HTMLInputElement>(null);
  const [detailDirty, setDetailDirty] = useState(false);
  const { setFormDirty } = useUnsavedChanges();

  useEffect(() => {
    setFormDirty(detailDirty);
  }, [detailDirty, setFormDirty]);
  const [pendingItemId, setPendingItemId] = useState<number | null>(null);
  const [discardDirtyOpen, setDiscardDirtyOpen] = useState(false);
  const [workshopOpen, setWorkshopOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [inventoryDuplicates, setInventoryDuplicates] = useState<
    Array<{ id: number; item_number: string | null; description: string | null }>
  >([]);
  const debouncedInventorySearch = useDebouncedValue(inventorySearch, 300);
  const { page, pageSize, offset, total: listTotal, setPage, setTotal } = usePagination(25);

  useListSearchFromUrl(setInventorySearch, () => setPage(0));

  useKeyboardShortcuts([
    {
      key: "i",
      modifiers: ["meta", "shift"],
      action: () => setImportOpen(true),
    },
  ]);

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
  const [sort, setSort] = useState<SortState>({ key: "updated_at", dir: "desc" });
  const batch = useBatchSelection(inventory, listTotal);
  const { runBatch, busy: batchBusy, progressOpen, progressTitle, progressTotal } = useBatchOperation();

  const inventoryBatchFilter = useMemo(
    () => ({
      search: debouncedInventorySearch.trim() || undefined,
      status: statusFilter ?? undefined,
    }),
    [debouncedInventorySearch, statusFilter]
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
    setInventory((current) => current.map((row) => (row.id === item.id ? item : row)));
  };

  const handleDetailItemUpdated = (item: InventoryItemDetail) => {
    setSelectedItem(item);
    setInventory((current) => current.map((row) => (row.id === item.id ? item : row)));
  };

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
  }, [selectedItemId]);

  const selectInventoryItem = (id: number) => {
    if (detailDirty && id !== selectedItemId) {
      setPendingItemId(id);
      setDiscardDirtyOpen(true);
      return;
    }
    setSelectedItemId(id);
  };

  const reloadInventory = useCallback(async () => {
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(offset),
    });
    if (debouncedInventorySearch.trim()) params.set("search", debouncedInventorySearch.trim());
    if (statusFilter) params.set("status", statusFilter);
    if (sort) {
      params.set("sort_by", sort.key);
      params.set("sort_dir", sort.dir);
    }
    const response = await fetch(`/api/inventory?${params}`, { headers: { Accept: "application/json" } });
    const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
      items?: InventoryItem[];
      pagination?: PaginationInfo;
    };
    if (!response.ok) throw data;
    if (data.items) setInventory(data.items);
    if (data.pagination) setTotal(data.pagination.total);
  }, [debouncedInventorySearch, pageSize, offset, statusFilter, sort, setInventory, setTotal]);

  useEffect(() => {
    void reloadInventory().catch((err) =>
      setApiError("Could not load inventory", "We could not load inventory.", err)
    );
  }, [reloadInventory, setApiError]);

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
      { key: "status", header: "Status", sortable: true },
    ],
    []
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
          : batch.selectedIdList.filter(
              (id) => !(result?.failed ?? []).some((f) => f.id === id)
            )
      );
      if (batch.selectAllMatching) await reloadInventory();
      else {
        setInventory((current) => current.filter((row) => !removed.has(row.id)));
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
    const response = await fetch(`/api/inventory/${selectedItemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { item?: InventoryItem };
    if (!response.ok) throw data;
    if (data.item) {
      setSelectedItem(data.item);
      setInventory((current) => current.map((row) => (row.id === data.item!.id ? data.item! : row)));
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
      const response = await fetch(`/api/inventory/${selectedItemId}/generate-listing-content`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
      if (!response.ok) throw data;
      await patchSelectedItem({});
      setError(null);
    } catch (err) {
      setApiError("Could not generate listing", "We could not generate listing content.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const exportForPortableAi = async () => {
    if (!selectedItemId) return;
    setBusyAction("export-ai");
    try {
      const response = await fetch(`/api/inventory/${selectedItemId}/listing-export`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { package?: unknown };
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
    setBusyAction("import-ai");
    try {
      const parsed = JSON.parse(importPayload);
      const response = await fetch(`/api/inventory/${selectedItemId}/listing-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
      if (!response.ok) throw data;
      await patchSelectedItem({});
      setError(null);
    } catch (err) {
      setApiError("Could not import package", "We could not import the AI draft package.", err);
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
      const response = await fetch(`/api/inventory/${selectedItemId}/listing-approve`, {
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
      const response = await fetch(`/api/inventory/${selectedItemId}/publish-to-etsy`, {
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
        preview_generated_at: typeof data.preview_generated_at === "string" ? data.preview_generated_at : "",
        staged_flow: Array.isArray(data.staged_flow) ? data.staged_flow : [],
        payload_preview: data.payload_preview ?? null,
      });
      setWorkflowStep(0);
      await loadPublishHistory();
      setError(null);
    } catch (err) {
      setApiError("Could not build publish review", "We could not prepare the publish review.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const rejectDraft = async () => {
    if (!selectedItemId) return;
    setBusyAction("reject-draft");
    try {
      const response = await fetch(`/api/inventory/${selectedItemId}/listing-reject`, {
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
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          item_number: newInventoryItemNumber.trim(),
          description: newInventoryDescription.trim(),
          status: "Draft",
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { item?: InventoryItem };
      if (!response.ok) throw data;
      if (data.item) {
        setInventory((current) => [data.item!, ...current.filter((row) => row.id !== data.item!.id)]);
        setSelectedItemId(data.item.id);
      }
      setNewInventoryItemNumber("");
      setNewInventoryDescription("");
      setInventoryDuplicates([]);
      setError(null);
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
      const response = await fetch(`/api/inventory/${selectedItemId}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
      if (!response.ok) throw data;
      setInventory((current) => {
        const remaining = current.filter((row) => row.id !== selectedItemId);
        setSelectedItemId(remaining[0]?.id ?? null);
        setSelectedItem(remaining[0] ?? null);
        return remaining;
      });
      setError(null);
    } catch (err) {
      setApiError("Could not delete inventory", "We could not delete the selected item.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const saveAiSettings = async () => {
    setAiSettingsSaving(true);
    try {
      const response = await fetch("/api/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          provider: "openai",
          model: aiConfig?.model ?? "gpt-4.1-mini",
          api_key: aiApiKeyDraft || undefined,
          base_url: aiConfig?.baseUrl ?? "",
          timeout_ms: aiConfig?.timeoutMs ?? 30000,
          retry_count: aiConfig?.retryCount ?? 1,
          token_budget: aiConfig?.tokenBudget ?? 2000,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { config?: AiConfig };
      if (!response.ok) throw data;
      if (data.config) setAiConfig(data.config);
      setAiApiKeyDraft("");
      setError(null);
    } catch (err) {
      setApiError("Could not save AI settings", "We could not save AI settings.", err);
    } finally {
      setAiSettingsSaving(false);
    }
  };

  const testAiSettings = async () => {
    setAiSettingsSaving(true);
    try {
      const response = await fetch("/api/settings/ai/test-connection", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
      if (!response.ok) throw data;
      setError({
        title: "AI connection is ready",
        message: "Your integrated AI provider responded successfully.",
        actions: ["You can now use Generate in app for listing drafts."],
      });
    } catch (err) {
      setApiError("AI connection test failed", "We could not verify AI connection.", err);
    } finally {
      setAiSettingsSaving(false);
    }
  };

  const savePublishSettings = async () => {
    setAiSettingsSaving(true);
    try {
      const updates: Array<{ key: string; value: string }> = [
        { key: "etsy.publish.taxonomy_id", value: publishConfig.taxonomyId.trim() },
        { key: "etsy.publish.shipping_profile_id", value: publishConfig.shippingProfileId.trim() },
        { key: "etsy.publish.readiness_state_id", value: publishConfig.readinessStateId.trim() },
        { key: "etsy.publish.image_ids", value: publishConfig.imageIds.trim() },
        { key: "etsy.publish.who_made", value: publishConfig.whoMade.trim() || "i_did" },
        { key: "etsy.publish.when_made", value: publishConfig.whenMade.trim() || "before_2000" },
        { key: "etsy.publish.image_max_dimension", value: publishConfig.imageMaxDimension.trim() || "2000" },
        { key: "etsy.publish.image_target_dpi", value: publishConfig.imageTargetDpi.trim() || "300" },
        { key: "etsy.publish.image_jpeg_quality", value: publishConfig.imageJpegQuality.trim() || "82" },
        { key: "etsy.publish.allow_partial_image_upload", value: publishConfig.allowPartialImageUpload.trim() || "false" },
        { key: "etsy.publish.image_upload_attempts", value: publishConfig.imageUploadAttempts.trim() || "3" },
      ];
      for (const update of updates) {
        const response = await fetch(`/api/settings/${encodeURIComponent(update.key)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ value: update.value }),
        });
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
        if (!response.ok) throw data;
      }
      setError({
        title: "Publish settings saved",
        message: "Etsy publish defaults were saved successfully.",
        actions: ["You can now publish approved listing drafts to Etsy."],
      });
    } catch (err) {
      setApiError("Could not save publish settings", "We could not save Etsy publish settings.", err);
    } finally {
      setAiSettingsSaving(false);
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
          <input ref={createItemRef} value={newInventoryItemNumber} onChange={(e) => setNewInventoryItemNumber(e.target.value)} placeholder="New item number" className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
          <input
            value={newInventoryDescription}
            onChange={(e) => setNewInventoryDescription(e.target.value)}
            onBlur={() => void checkInventoryDuplicate()}
            placeholder="New item description"
            className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm md:col-span-2"
          />
          <div className="flex gap-2">
            <button type="button" onClick={createInventoryRecord} disabled={busyAction != null} className="rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {busyAction === "create-inventory" ? "Creating..." : "Add item"}
            </button>
            <button type="button" onClick={() => setDeleteConfirmOpen(true)} disabled={busyAction != null || !selectedItemId} className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60">
              Delete selected
            </button>
          </div>
        </div>
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
              ? { total: listTotal, onSelect: batch.selectAllMatchingRows, tooLarge: batch.selectAllMatchingTooLarge }
              : undefined
          }
        >
          <Button variant="secondary" size="sm" busy={batchBusy} onClick={() => setBatchStatusOpen(true)}>
            Change status…
          </Button>
          <Button variant="secondary" size="sm" busy={busyAction === "batch-status" || batchBusy} onClick={() => void batchChangeStatus("Retired")}>
            Retire
          </Button>
          <Button variant="danger" size="sm" busy={busyAction === "batch-delete" || batchBusy} onClick={() => setBatchDeleteOpen(true)}>
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
            className="min-w-[10rem] flex-1 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
          />
          <button
            type="button"
            onClick={() => setImportOpen(true)}
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
        {listTotal === 0 ? (
          <EmptyState
            message={inventorySearch.trim() || statusFilter ? "No items match your filters." : "Your inventory is empty."}
            primaryAction={
              inventorySearch.trim() || statusFilter
                ? {
                    label: "Clear filters",
                    onClick: () => {
                      setInventorySearch("");
                      setStatusFilter(null);
                      setPage(0);
                    },
                  }
                : { label: "Add first item", onClick: () => createItemRef.current?.focus() }
            }
            secondaryAction={
              inventorySearch.trim() || statusFilter
                ? undefined
                : { label: "Import from CSV", onClick: () => setImportOpen(true) }
            }
          />
        ) : (
          <>
            <DataTable
              columns={inventoryColumns}
              data={inventory}
              selectedId={selectedItemId}
              selection={{
                selectedIds: batch.selectedIds,
                onToggleRow: batch.toggleRow,
                onToggleAllVisible: batch.toggleAllVisible,
                allVisibleSelected: batch.allVisibleSelected,
                indeterminate: batch.headerIndeterminate,
              }}
              onRowClick={(item) => selectInventoryItem(item.id)}
              sort={sort}
              onSortChange={(next) => {
                setPage(0);
                setSort(next ?? { key: "updated_at", dir: "desc" });
              }}
              emptyMessage="No items on this page."
              scrollToId={scrollToItemId}
              keyboardNav
            />
            <PaginationBar page={page} pageSize={pageSize} total={listTotal} onPageChange={setPage} />
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

      <div className="mb-4">
        <PictureGrid
          inventoryId={selectedItemId}
          item={selectedItem}
          disabled={busyAction != null}
          onItemUpdated={handlePictureItemUpdated}
          onError={(title, message, err) => setApiError(title, message, err)}
        />
      </div>
      {canWorkListing ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
            <div className="text-sm">
              <p className="font-semibold text-[var(--ui-title)]">Listing workshop</p>
              <p className="text-xs text-[var(--ui-muted)]">
                Draft: <strong>{selectedItem?.listing_draft_state ?? "draft"}</strong> · Ready:{" "}
                <strong>{listingReadiness?.ready ? "yes" : "no"}</strong>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWorkshopOpen((open) => !open)}
              className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm"
            >
              {workshopOpen ? "Collapse workshop" : "Open listing workshop"}
            </button>
          </div>

          {workshopOpen ? (
          <div className="space-y-4">
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
                  listingMode === mode ? "bg-[var(--ui-accent)] text-white" : "border border-[var(--ui-border)]"
                }`}
              >
                {mode === "manual" ? "Manual" : mode === "integrated_ai" ? "Generate in app" : "Import AI draft"}
              </button>
            ))}
          </div>

          {listingMode === "manual" && selectedItem && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <textarea placeholder="Title strategy" value={selectedItem.listing_title_strategy ?? ""} onChange={(e) => setSelectedItem({ ...selectedItem, listing_title_strategy: e.target.value })} className="min-h-24 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm" />
              <textarea placeholder="Product story/details" value={selectedItem.listing_product_story ?? ""} onChange={(e) => setSelectedItem({ ...selectedItem, listing_product_story: e.target.value })} className="min-h-24 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm" />
              <textarea placeholder="Condition clarity + defect disclosure" value={selectedItem.listing_condition_clarity ?? ""} onChange={(e) => setSelectedItem({ ...selectedItem, listing_condition_clarity: e.target.value })} className="min-h-24 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm" />
              <textarea placeholder="Attributes and category fit" value={selectedItem.listing_attributes ?? ""} onChange={(e) => setSelectedItem({ ...selectedItem, listing_attributes: e.target.value })} className="min-h-24 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm" />
              <textarea placeholder="Pricing and shipping notes" value={selectedItem.listing_pricing_shipping_notes ?? ""} onChange={(e) => setSelectedItem({ ...selectedItem, listing_pricing_shipping_notes: e.target.value })} className="min-h-24 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm" />
              <textarea placeholder="Final quality checklist" value={selectedItem.listing_quality_checklist ?? ""} onChange={(e) => setSelectedItem({ ...selectedItem, listing_quality_checklist: e.target.value })} className="min-h-24 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm" />
              <input placeholder="Listing title" value={selectedItem.listing_title ?? ""} onChange={(e) => setSelectedItem({ ...selectedItem, listing_title: e.target.value })} className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm" />
              <input placeholder="Listing tags (comma separated)" value={selectedItem.listing_tags ?? ""} onChange={(e) => setSelectedItem({ ...selectedItem, listing_tags: e.target.value })} className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm" />
              <input placeholder="Listing category path" value={selectedItem.listing_category_path ?? ""} onChange={(e) => setSelectedItem({ ...selectedItem, listing_category_path: e.target.value })} className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm lg:col-span-2" />
              <textarea placeholder="Listing description" value={selectedItem.listing_description ?? ""} onChange={(e) => setSelectedItem({ ...selectedItem, listing_description: e.target.value })} className="min-h-28 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm lg:col-span-2" />
              <div className="lg:col-span-2">
                <button type="button" onClick={saveManualListing} disabled={busyAction != null} className="rounded-lg bg-[var(--ui-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {busyAction === "save-manual" ? "Saving..." : "Save manual draft"}
                </button>
              </div>
            </div>
          )}

          {listingMode === "integrated_ai" && (
            <div className="space-y-3">
              <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm">
                <p>Provider: <strong>{aiConfig?.provider ?? "openai"}</strong> | Model: <strong>{aiConfig?.model ?? "gpt-4.1-mini"}</strong> | API key: <strong>{aiConfig?.apiKeyConfigured ? "configured" : "missing"}</strong></p>
              </div>
              <button type="button" onClick={generateIntegrated} disabled={busyAction != null} className="rounded-lg bg-[var(--ui-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {busyAction === "generate-ai" ? "Generating..." : "Generate listing in app"}
              </button>
            </div>
          )}

          {listingMode === "portable_import" && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={exportForPortableAi} disabled={busyAction != null} className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm">
                  {busyAction === "export-ai" ? "Exporting..." : "Export package"}
                </button>
                <button type="button" onClick={importPortableAiDraft} disabled={busyAction != null || importPayload.trim().length === 0} className="rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {busyAction === "import-ai" ? "Importing..." : "Import AI draft"}
                </button>
              </div>
              {exportPackage != null && (
                <textarea readOnly value={JSON.stringify(exportPackage, null, 2) ?? ""} className="min-h-40 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 font-mono text-xs" />
              )}
              <textarea placeholder="Paste AI output JSON here for import" value={importPayload} onChange={(e) => setImportPayload(e.target.value)} className="min-h-40 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 font-mono text-xs" />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={reviewPublishPayload} disabled={busyAction != null} className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm">
              {busyAction === "review-publish" ? "Reviewing..." : "Review"}
            </button>
            <button type="button" onClick={() => setWorkflowStep((s) => (s > 0 ? ((s - 1) as 0 | 1 | 2) : s))} disabled={busyAction != null || workflowStep === 0} className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60">
              Back
            </button>
            <button type="button" onClick={() => setWorkflowStep((s) => (s < 2 ? ((s + 1) as 0 | 1 | 2) : s))} disabled={busyAction != null || workflowStep === 2} className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60">
              Continue
            </button>
            <button type="button" onClick={approveDraft} disabled={busyAction != null} className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm">
              {busyAction === "approve-draft" ? "Approving..." : "Approve draft"}
            </button>
            <button type="button" onClick={rejectDraft} disabled={busyAction != null} className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm">
              {busyAction === "reject-draft" ? "Rejecting..." : "Reject"}
            </button>
            <button type="button" onClick={publishApprovedDraft} disabled={busyAction != null || !canPublish || workflowStep < 2} className="rounded-lg bg-[var(--ui-green)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {busyAction === "publish-draft" ? "Publishing..." : "Publish to Etsy"}
            </button>
          </div>
          {!canPublish && (
            <p className="text-xs text-[var(--ui-yellow)]">Publish is locked until review is completed and this exact draft is approved.</p>
          )}

          {publishPreview && (
            <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
              <p className="text-sm">Review status: <strong>{publishPreview.can_publish ? "ready to publish" : "action needed"}</strong></p>
              <p className="mt-1 text-xs text-[var(--ui-muted)]">Preview hash: {publishPreview.preview_hash || "not available"} | Generated: {publishPreview.preview_generated_at || "unknown"}</p>
              {publishPreview.warnings.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--ui-yellow)]">
                  {publishPreview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              )}
              {publishPreview.staged_flow.length > 0 && (
                <div className="mt-2 text-xs text-[var(--ui-muted)]">Flow: {publishPreview.staged_flow.join(" -> ")}</div>
              )}
              <textarea readOnly value={JSON.stringify(publishPreview.payload_preview, null, 2)} className="mt-2 min-h-40 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3 font-mono text-xs" />
            </div>
          )}

          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Publish audit</p>
              <button
                type="button"
                onClick={async () => {
                  setBusyAction("refresh-history");
                  try { await loadPublishHistory(); setError(null); } catch (err) { setApiError("Could not refresh publish audit", "We could not refresh publish audit history.", err); } finally { setBusyAction(null); }
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
                  Listed: {publishHistory.item?.is_listed ? "yes" : "no"} | Etsy listing id: {publishHistory.item?.etsy_listing_id || "not set"} | Approved: {publishHistory.item?.listing_approved_at || "not approved"} | Published: {publishHistory.item?.listing_published_at || "not published"}
                </p>
                <div className="mt-2 text-xs text-[var(--ui-muted)]">
                  Latest previews: {publishHistory.previews.slice(0, 3).map((entry) => `${entry.created_at} (${entry.preview_hash.slice(0, 12)})`).join(" | ") || "none"}
                </div>
                <div className="mt-1 text-xs text-[var(--ui-muted)]">
                  Imports: {publishHistory.imports.length} | Exports: {publishHistory.exports.length}
                </div>
              </>
            )}
          </div>

          </div>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-[var(--ui-muted)]">Create inventory items first to use listing authoring features.</p>
      )}


      <InventoryImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => void reloadInventory()}
        onError={(title, message, err) => setApiError(title, message, err)}
        onSuccess={(title, message) => setError({ title, message, actions: [] })}
      />

      {batchStatusOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5">
            <h4 className="mb-3 text-lg font-semibold text-[var(--ui-title)]">Change status</h4>
            <select value={batchStatusValue} onChange={(e) => setBatchStatusValue(e.target.value)} className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-sm">
              {INVENTORY_STATUSES.map((status) => (<option key={status} value={status}>{status}</option>))}
            </select>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setBatchStatusOpen(false)} className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm">Cancel</button>
              <button type="button" onClick={() => void batchChangeStatus(batchStatusValue)} disabled={busyAction != null} className="rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">Apply</button>
            </div>
          </div>
        </div>
      ) : null}

      <ProgressModal
        open={progressOpen}
        title={progressTitle}
        statusText={progressTitle}
        mode="indeterminate"
        total={progressTotal}
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
          setDiscardDirtyOpen(false);
          if (pendingItemId != null) setSelectedItemId(pendingItemId);
          setPendingItemId(null);
          setDetailDirty(false);
        }}
        title="Discard unsaved changes?"
        description="You have unsaved inventory edits. Switch items anyway?"
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
    <Suspense fallback={<section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 text-sm text-[var(--ui-muted)]">Loading inventory...</section>}>
      <InventoryPageInner />
    </Suspense>
  );
}
