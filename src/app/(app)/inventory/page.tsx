"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { ApiErrorShape, InventoryItem, AiConfig, ListingMode, PublishPreview } from "@/types";

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

  useEffect(() => {
    const raw = searchParams.get("itemId");
    if (!raw) return;
    const id = Number(raw);
    if (!Number.isFinite(id)) return;
    if (inventory.some((row) => row.id === id)) {
      setSelectedItemId(id);
    }
  }, [searchParams, inventory, setSelectedItemId]);

  const [newInventoryItemNumber, setNewInventoryItemNumber] = useState("");
  const [newInventoryDescription, setNewInventoryDescription] = useState("");
  const [pictureSlotDraft, setPictureSlotDraft] = useState("1");
  const [picturePathDraft, setPicturePathDraft] = useState("");
  const [pictureReorderDraft, setPictureReorderDraft] = useState("");
  const [listingMode, setListingMode] = useState<ListingMode>("manual");
  const [importPayload, setImportPayload] = useState("");
  const [exportPackage, setExportPackage] = useState<unknown | null>(null);
  const [workflowStep, setWorkflowStep] = useState<0 | 1 | 2>(0);
  const [aiApiKeyDraft, setAiApiKeyDraft] = useState("");
  const [aiSettingsSaving, setAiSettingsSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    if (!selectedItem) {
      setPictureReorderDraft("");
      return;
    }
    const next = Array.from({ length: 10 }, (_, index) => {
      const key = `picture_${index + 1}` as keyof InventoryItem;
      const value = selectedItem[key];
      return typeof value === "string" ? value : "";
    })
      .filter((value) => value.trim().length > 0)
      .join(", ");
    setPictureReorderDraft(next);
  }, [selectedItem]);

  const selectedItemPictures = selectedItem
    ? Array.from({ length: 10 }, (_, index) => {
        const slot = index + 1;
        const key = `picture_${slot}` as keyof InventoryItem;
        const value = selectedItem[key];
        return typeof value === "string" && value.trim().length > 0
          ? { slot, path: value }
          : { slot, path: null };
      })
    : [];

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

  const addPictureToSelected = async () => {
    if (!selectedItemId || !picturePathDraft.trim()) return;
    setBusyAction("add-picture");
    try {
      const response = await fetch(`/api/inventory/${selectedItemId}/pictures`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ slot: Number(pictureSlotDraft), path: picturePathDraft.trim() }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { item?: InventoryItem };
      if (!response.ok) throw data;
      if (data.item) {
        setSelectedItem(data.item);
        setInventory((current) => current.map((row) => (row.id === data.item!.id ? data.item! : row)));
      }
      setPicturePathDraft("");
      setError(null);
    } catch (err) {
      setApiError("Could not add picture", "We could not add this picture reference.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const removePictureFromSelected = async (slot: number) => {
    if (!selectedItemId) return;
    setBusyAction("remove-picture");
    try {
      const response = await fetch(`/api/inventory/${selectedItemId}/pictures/${slot}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { item?: InventoryItem };
      if (!response.ok) throw data;
      if (data.item) {
        setSelectedItem(data.item);
        setInventory((current) => current.map((row) => (row.id === data.item!.id ? data.item! : row)));
      }
      setError(null);
    } catch (err) {
      setApiError("Could not remove picture", "We could not remove this picture slot.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const reorderPicturesForSelected = async () => {
    if (!selectedItemId) return;
    setBusyAction("reorder-pictures");
    try {
      const pictures = pictureReorderDraft
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .slice(0, 10);
      const response = await fetch(`/api/inventory/${selectedItemId}/pictures/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ pictures }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { item?: InventoryItem };
      if (!response.ok) throw data;
      if (data.item) {
        setSelectedItem(data.item);
        setInventory((current) => current.map((row) => (row.id === data.item!.id ? data.item! : row)));
      }
      setError(null);
    } catch (err) {
      setApiError("Could not reorder pictures", "We could not reorder picture references.", err);
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
          <h3 className="text-lg font-semibold text-[var(--ui-title)]">Listing authoring workshop</h3>
          <p className="text-sm text-[var(--ui-muted)]">
            Manual guided form, integrated AI generation, and hybrid import/export.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-[var(--ui-muted)]">Inventory item</label>
          <select
            value={selectedItemId ?? ""}
            onChange={(e) => setSelectedItemId(Number(e.target.value))}
            className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm text-[var(--ui-body)]"
          >
            {inventory.map((item) => (
              <option key={item.id} value={item.id}>
                {item.item_number ?? `Item ${item.id}`} - {(item.description ?? "").slice(0, 40) || "No description"}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 md:grid-cols-4">
        <input value={newInventoryItemNumber} onChange={(e) => setNewInventoryItemNumber(e.target.value)} placeholder="New item number" className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
        <input value={newInventoryDescription} onChange={(e) => setNewInventoryDescription(e.target.value)} placeholder="New item description" className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm md:col-span-2" />
        <div className="flex gap-2">
          <button type="button" onClick={createInventoryRecord} disabled={busyAction != null} className="rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {busyAction === "create-inventory" ? "Creating..." : "Add item"}
          </button>
          <button type="button" onClick={() => setDeleteConfirmOpen(true)} disabled={busyAction != null || !selectedItemId} className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60">
            Delete selected
          </button>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
        <p className="mb-2 text-sm font-semibold">Pictures</p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
          <input value={pictureSlotDraft} onChange={(e) => setPictureSlotDraft(e.target.value)} placeholder="Slot (1-10)" className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
          <input value={picturePathDraft} onChange={(e) => setPicturePathDraft(e.target.value)} placeholder="Picture path or URL" className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm md:col-span-2" />
          <button type="button" onClick={addPictureToSelected} disabled={busyAction != null || !selectedItemId} className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60">
            {busyAction === "add-picture" ? "Saving..." : "Set slot"}
          </button>
          <button type="button" onClick={() => removePictureFromSelected(Number(pictureSlotDraft))} disabled={busyAction != null || !selectedItemId} className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60">
            {busyAction === "remove-picture" ? "Removing..." : "Clear slot"}
          </button>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
          <input value={pictureReorderDraft} onChange={(e) => setPictureReorderDraft(e.target.value)} placeholder="Reorder: comma-separated paths for slots 1..10" className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
          <button type="button" onClick={reorderPicturesForSelected} disabled={busyAction != null || !selectedItemId} className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60">
            {busyAction === "reorder-pictures" ? "Reordering..." : "Reorder"}
          </button>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-1 text-xs md:grid-cols-2">
          {selectedItemPictures.map((entry) => (
            <div key={`pic-slot-${entry.slot}`} className="rounded border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-2 py-1">
              Slot {entry.slot}: {entry.path ?? "(empty)"}
            </div>
          ))}
        </div>
      </div>

      {canWorkListing ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm">
            <p>
              Draft state: <strong>{selectedItem?.listing_draft_state ?? "draft"}</strong> |
              Source: <strong>{selectedItem?.listing_draft_source ?? "manual"}</strong> |
              Ready: <strong>{listingReadiness?.ready ? "yes" : "no"}</strong>
            </p>
          </div>

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

          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <h4 className="mb-2 text-sm font-semibold">Integrated AI settings</h4>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <input value={aiConfig?.model ?? ""} onChange={(e) => setAiConfig((c) => ({ provider: c?.provider ?? "openai", model: e.target.value, baseUrl: c?.baseUrl ?? null, timeoutMs: c?.timeoutMs ?? 30000, retryCount: c?.retryCount ?? 1, tokenBudget: c?.tokenBudget ?? 2000, apiKeyConfigured: c?.apiKeyConfigured ?? false }))} placeholder="Model" className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
              <input value={aiApiKeyDraft} onChange={(e) => setAiApiKeyDraft(e.target.value)} placeholder="New API key (leave blank to keep current)" className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
              <input value={aiConfig?.baseUrl ?? ""} onChange={(e) => setAiConfig((c) => ({ provider: c?.provider ?? "openai", model: c?.model ?? "gpt-4.1-mini", baseUrl: e.target.value, timeoutMs: c?.timeoutMs ?? 30000, retryCount: c?.retryCount ?? 1, tokenBudget: c?.tokenBudget ?? 2000, apiKeyConfigured: c?.apiKeyConfigured ?? false }))} placeholder="Base URL (optional)" className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
              <input value={String(aiConfig?.timeoutMs ?? 30000)} onChange={(e) => setAiConfig((c) => ({ provider: c?.provider ?? "openai", model: c?.model ?? "gpt-4.1-mini", baseUrl: c?.baseUrl ?? null, timeoutMs: Number(e.target.value) || 30000, retryCount: c?.retryCount ?? 1, tokenBudget: c?.tokenBudget ?? 2000, apiKeyConfigured: c?.apiKeyConfigured ?? false }))} placeholder="Timeout ms" className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={saveAiSettings} disabled={aiSettingsSaving} className="rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">Save AI settings</button>
              <button type="button" onClick={testAiSettings} disabled={aiSettingsSaving} className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm">Test connection</button>
            </div>
          </div>

          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <h4 className="mb-2 text-sm font-semibold">Etsy publish defaults</h4>
            <p className="mb-3 text-xs text-[var(--ui-muted)]">Required by Etsy publish flow. Images upload one-by-one with retry and optional downscaling/compression.</p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <input value={publishConfig.taxonomyId} onChange={(e) => setPublishConfig((c) => ({ ...c, taxonomyId: e.target.value }))} placeholder="taxonomy_id" className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
              <input value={publishConfig.shippingProfileId} onChange={(e) => setPublishConfig((c) => ({ ...c, shippingProfileId: e.target.value }))} placeholder="shipping_profile_id" className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
              <input value={publishConfig.readinessStateId} onChange={(e) => setPublishConfig((c) => ({ ...c, readinessStateId: e.target.value }))} placeholder="readiness_state_id" className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
              <input value={publishConfig.imageIds} onChange={(e) => setPublishConfig((c) => ({ ...c, imageIds: e.target.value }))} placeholder="image_ids (comma-separated)" className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
              <input value={publishConfig.whoMade} onChange={(e) => setPublishConfig((c) => ({ ...c, whoMade: e.target.value }))} placeholder="who_made" className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
              <input value={publishConfig.whenMade} onChange={(e) => setPublishConfig((c) => ({ ...c, whenMade: e.target.value }))} placeholder="when_made" className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
              <input value={publishConfig.imageMaxDimension} onChange={(e) => setPublishConfig((c) => ({ ...c, imageMaxDimension: e.target.value }))} placeholder="image_max_dimension (default 2000)" className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
              <input value={publishConfig.imageTargetDpi} onChange={(e) => setPublishConfig((c) => ({ ...c, imageTargetDpi: e.target.value }))} placeholder="image_target_dpi (default 300)" className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
              <input value={publishConfig.imageJpegQuality} onChange={(e) => setPublishConfig((c) => ({ ...c, imageJpegQuality: e.target.value }))} placeholder="image_jpeg_quality (default 82)" className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
              <input value={publishConfig.imageUploadAttempts} onChange={(e) => setPublishConfig((c) => ({ ...c, imageUploadAttempts: e.target.value }))} placeholder="image_upload_attempts (default 3)" className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
              <input value={publishConfig.allowPartialImageUpload} onChange={(e) => setPublishConfig((c) => ({ ...c, allowPartialImageUpload: e.target.value }))} placeholder="allow_partial_image_upload (true/false)" className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm md:col-span-2" />
            </div>
            <div className="mt-3">
              <button type="button" onClick={savePublishSettings} disabled={aiSettingsSaving} className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm">Save publish defaults</button>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-[var(--ui-muted)]">Create inventory items first to use listing authoring features.</p>
      )}

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
