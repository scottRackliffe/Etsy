"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleResultsPasteZone } from "@/components/listing-coach/GoogleResultsPasteZone";
import { PhotoPasteZone } from "@/components/listing-coach/PhotoPasteZone";
import {
  appendCoachPhotos,
  createCoachPhoto,
  revokeCoachPhotos,
  SHOT_LABELS,
  SHOT_DESCRIPTIONS,
  SHOT_SLOT_ORDER,
  type CoachPhoto,
  type CoachStep,
  type ComposeResponse,
  type ResearchResponse,
  type FieldEvidence,
} from "@/components/listing-coach/types";
import type { SlotGuidance } from "@/components/listing-coach/PhotoPasteZone";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { VendorPicker } from "@/components/ui/VendorPicker";
import { useToast } from "@/hooks/useToast";
import { createUiError } from "@/lib/ui-error";
import { computeListingScore, type ListingScoreResult } from "@/lib/listing-score";
import TaxonomyCategoryPicker from "@/components/etsy/TaxonomyCategoryPicker";
import TaxonomyAttributesPanel from "@/components/etsy/TaxonomyAttributesPanel";
import type { AiConfig, ApiErrorShape, UiError } from "@/types";

const ITEM_PHOTO_GUIDANCE: SlotGuidance[] = SHOT_SLOT_ORDER.map((type) => ({
  label: SHOT_LABELS[type] ?? type,
  description: SHOT_DESCRIPTIONS[type] ?? "",
}));

function parseApiError(data: ApiErrorShape, fallback: string): UiError {
  return createUiError({
    title: fallback,
    message: data.error?.user_message ?? data.error?.message ?? fallback,
    actions: data.error?.actions ?? [],
  });
}

function EvidenceBadge({ evidence }: { evidence: FieldEvidence }) {
  const colors: Record<string, string> = {
    photo: "bg-[var(--ui-accent)]/20 text-[var(--ui-accent)]",
    web_search: "bg-[var(--ui-green)]/20 text-[var(--ui-green)]",
    operator_input: "bg-[var(--ui-body)]/20 text-[var(--ui-body)]",
    unverified: "bg-[var(--ui-yellow)]/20 text-[var(--ui-yellow)]",
  };
  const labels: Record<string, string> = {
    photo: "From photo",
    web_search: "Web verified",
    operator_input: "Your input",
    unverified: "Needs verification",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${colors[evidence.evidence] ?? colors.unverified}`}
    >
      {labels[evidence.evidence] ?? "Unverified"}
      {evidence.confidence === "low" ? " (low confidence)" : ""}
    </span>
  );
}

/* ---------- Per-field "Fix" button ---------- */

function FieldFixButton({
  fieldName,
  currentValue,
  context,
  onFixed,
}: {
  fieldName: string;
  currentValue: string;
  context: Record<string, unknown>;
  onFixed: (newValue: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!instruction.trim()) return;
    setBusy(true);
    try {
      const resp = await fetch("/api/listing-coach/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "field",
          field_name: fieldName,
          current_value: currentValue,
          instruction: instruction.trim(),
          context,
        }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        fields?: Record<string, string>;
      };
      if (data.ok && data.fields?.[fieldName]) {
        onFixed(data.fields[fieldName]);
        setOpen(false);
        setInstruction("");
      }
    } catch {
      /* silent */
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ml-1 shrink-0 rounded px-1.5 py-0.5 text-xs text-[var(--ui-accent)] hover:bg-[var(--ui-accent)]/10"
        title="Ask AI to fix this field"
      >
        Fix
      </button>
    );
  }

  return (
    <div className="mt-1 flex gap-1">
      <input
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); void submit(); }
          if (e.key === "Escape") { setOpen(false); setInstruction(""); }
        }}
        className="flex-1 rounded border border-[var(--ui-accent)]/40 bg-[var(--ui-card-bg)] px-2 py-1 text-xs"
        placeholder="What should the AI change?"
        autoFocus
        spellCheck
      />
      <Button variant="primary" size="sm" onClick={() => void submit()} busy={busy} disabled={!instruction.trim()}>
        Fix
      </Button>
      <Button variant="ghost" size="sm" onClick={() => { setOpen(false); setInstruction(""); }}>
        Cancel
      </Button>
    </div>
  );
}

/* ---------- Section header ---------- */

function SectionHeader({ title }: { title: string }) {
  return (
    <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
      {title}
    </p>
  );
}

/* ---------- Main component ---------- */

export default function ListingCoachPage() {
  const router = useRouter();
  const toast = useToast();

  const [step, setStep] = useState<CoachStep>("welcome");
  const [itemPhotos, setItemPhotos] = useState<CoachPhoto[]>([]);
  const [conditionPhotos, setConditionPhotos] = useState<CoachPhoto[]>([]);
  const [googlePhotos, setGooglePhotos] = useState<CoachPhoto[]>([]);
  const [googleText, setGoogleText] = useState("");
  const [showResearch, setShowResearch] = useState(false);

  // Phase 1: Purchase / acquisition inputs
  const [datePurchased, setDatePurchased] = useState("");
  const [purchasePrice, setPurchasePrice] = useState<number | null>(null);
  const [conditionCode, setConditionCode] = useState("Good");
  const [conditionNotes, setConditionNotes] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [storeCategory, setStoreCategory] = useState("");
  const [storeCategoryList, setStoreCategoryList] = useState<string[]>([]);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  // Phase 2: AI-populated (editable on form)
  const [researchResult, setResearchResult] = useState<ResearchResponse | null>(null);
  const [identification, setIdentification] = useState("");
  const [saleRevenue, setSaleRevenue] = useState<number | null>(null);
  const [etsyWhenMade, setEtsyWhenMade] = useState("");
  const [etsyTaxonomyId, setEtsyTaxonomyId] = useState<number | null>(null);
  const [materialsText, setMaterialsText] = useState("");
  const [isSupply, setIsSupply] = useState(false);
  const [itemWeight, setItemWeight] = useState<number | null>(null);
  const [itemWeightUnit, setItemWeightUnit] = useState("oz");
  const [itemLength, setItemLength] = useState<number | null>(null);
  const [itemWidth, setItemWidth] = useState<number | null>(null);
  const [itemHeight, setItemHeight] = useState<number | null>(null);
  const [itemDimensionsUnit, setItemDimensionsUnit] = useState("in");
  const [photoClassifications, setPhotoClassifications] = useState<
    Array<{ photo_index: number; type: string; confidence: number }>
  >([]);

  // Listing content (editable)
  const [listingTitle, setListingTitle] = useState("");
  const [listingDescription, setListingDescription] = useState("");
  const [listingTags, setListingTags] = useState("");
  const [listingCategoryPath, setListingCategoryPath] = useState("");
  const [listingTitleStrategy, setListingTitleStrategy] = useState("");
  const [listingProductStory, setListingProductStory] = useState("");
  const [listingConditionClarity, setListingConditionClarity] = useState("");
  const [listingAttributes, setListingAttributes] = useState("");
  const [taxonomyAttributes, setTaxonomyAttributes] = useState<Record<string, string>>({});
  const [listingPricingShippingNotes, setListingPricingShippingNotes] = useState("");
  const [listingQualityChecklist, setListingQualityChecklist] = useState("");

  // Save fields
  const [itemNumber, setItemNumber] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"In stock" | "Draft">("In stock");
  const [quantity, setQuantity] = useState(1);
  const [shippingCostInbound, setShippingCostInbound] = useState<number | null>(null);
  const [categoryTags, setCategoryTags] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [vendorId, setVendorId] = useState<number | null>(null);
  const [vendorName, setVendorName] = useState("");
  const [vendorShippingPrice, setVendorShippingPrice] = useState<number | null>(null);
  const [vendorReferenceNumber, setVendorReferenceNumber] = useState("");
  const [vendorNotes, setVendorNotes] = useState("");
  const [receiptPhoto, setReceiptPhoto] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);

  // Receipts
  type ReceiptSummary = { id: number; vendor_name: string; purchase_date: string | null; reference_number: string | null; total_items: number; unassigned_items: number; receipt_image: string | null; shipping_price: number | null; notes: string | null };
  type ReceiptItem = { id: number; receipt_id: number; description: string; cost: number | null; inventory_id: number | null; item_number?: string | null };
  const [vendorReceipts, setVendorReceipts] = useState<ReceiptSummary[]>([]);
  const [selectedReceiptId, setSelectedReceiptId] = useState<number | null>(null);
  const [receiptItems, setReceiptItems] = useState<ReceiptItem[]>([]);
  const [selectedReceiptItemId, setSelectedReceiptItemId] = useState<number | null>(null);
  const [showReceiptPicker, setShowReceiptPicker] = useState(false);
  const [extraReceiptItems, setExtraReceiptItems] = useState<Array<{ description: string; cost: string }>>([]);
  const [receiptItemDescription, setReceiptItemDescription] = useState("");

  // Video
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [liveScore, setLiveScore] = useState<ListingScoreResult | null>(null);

  // UI state
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [startOverOpen, setStartOverOpen] = useState(false);
  const [globalFeedback, setGlobalFeedback] = useState("");
  const [refining, setRefining] = useState(false);

  useEffect(() => {
    void fetch("/api/settings/ai", { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((data: { config?: AiConfig }) => {
        setAiConfigured(Boolean(data.config?.apiKeyConfigured));
      })
      .catch(() => setAiConfigured(false));
    void fetch(`/api/settings/${encodeURIComponent("inventory.store_categories")}`, {
      headers: { Accept: "application/json" },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { value?: string } | null) => {
        if (data?.value) {
          setStoreCategoryList(data.value.split(",").map((s) => s.trim()).filter(Boolean));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      if (receiptPreview) URL.revokeObjectURL(receiptPreview);
      revokeCoachPhotos([...itemPhotos, ...conditionPhotos, ...googlePhotos]);
    };
  }, [itemPhotos, conditionPhotos, googlePhotos]);

  useEffect(() => {
    if (step !== "input") return;
    const handler = (e: ClipboardEvent) => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        const room = 20 - itemPhotos.length;
        if (room <= 0) return;
        const next = [...itemPhotos];
        for (const file of files.slice(0, room)) {
          if (!file.type.startsWith("image/")) continue;
          if (file.size > 15 * 1024 * 1024) continue;
          next.push(createCoachPhoto(file));
        }
        if (next.length !== itemPhotos.length) setItemPhotos(next);
      }
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [step, itemPhotos]);

  const resetSession = useCallback(() => {
    revokeCoachPhotos([...itemPhotos, ...conditionPhotos, ...googlePhotos]);
    setStep("welcome");
    setItemPhotos([]);
    setConditionPhotos([]);
    setGooglePhotos([]);
    setGoogleText("");
    setShowResearch(false);
    setDatePurchased("");
    setPurchasePrice(null);
    setConditionCode("Good");
    setConditionNotes("");
    setItemDescription("");
    setStoreCategory("");
    setAddingCategory(false);
    setNewCategoryName("");
    setResearchResult(null);
    setLiveScore(null);
    setIdentification("");
    setSaleRevenue(null);
    setEtsyWhenMade("");
    setEtsyTaxonomyId(null);
    setMaterialsText("");
    setIsSupply(false);
    setQuantity(1);
    setShippingCostInbound(null);
    setCategoryTags("");
    setInternalNotes("");
    setVendorName("");
    setVendorShippingPrice(null);
    setVendorReferenceNumber("");
    setVendorNotes("");
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    setReceiptPhoto(null);
    setReceiptPreview(null);
    setVendorReceipts([]);
    setSelectedReceiptId(null);
    setReceiptItems([]);
    setSelectedReceiptItemId(null);
    setShowReceiptPicker(false);
    setExtraReceiptItems([]);
    setReceiptItemDescription("");
    setItemWeight(null);
    setItemWeightUnit("oz");
    setItemLength(null);
    setItemWidth(null);
    setItemHeight(null);
    setItemDimensionsUnit("in");
    setPhotoClassifications([]);
    setItemNumber("");
    setDescription("");
    setStatus("In stock");
    setListingTitle("");
    setListingDescription("");
    setListingTags("");
    setListingCategoryPath("");
    setListingTitleStrategy("");
    setListingProductStory("");
    setListingConditionClarity("");
    setListingAttributes("");
    setTaxonomyAttributes({});
    setListingPricingShippingNotes("");
    setListingQualityChecklist("");
    setVideoGenerating(false);
    setVideoPath(null);
    setError(null);
    setGlobalFeedback("");
  }, [itemPhotos, conditionPhotos, googlePhotos]);

  const addNewCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    const updated = [...storeCategoryList, name];
    setStoreCategoryList(updated);
    setStoreCategory(name);
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

  const fetchReceiptsForVendor = useCallback(async (vendor: string) => {
    if (!vendor.trim()) { setVendorReceipts([]); return; }
    try {
      const r = await fetch(`/api/receipts?vendor_name=${encodeURIComponent(vendor.trim())}`, { headers: { Accept: "application/json" } });
      if (!r.ok) return;
      const data = await r.json() as { receipts?: ReceiptSummary[] };
      setVendorReceipts(data.receipts?.filter((rx) => rx.unassigned_items > 0) ?? []);
    } catch { setVendorReceipts([]); }
  }, []);

  const loadReceiptItems = useCallback(async (receiptId: number) => {
    try {
      const r = await fetch(`/api/receipts/${receiptId}`, { headers: { Accept: "application/json" } });
      if (!r.ok) return;
      const data = await r.json() as { receipt: ReceiptSummary; items: ReceiptItem[] };
      setReceiptItems(data.items);
      setSelectedReceiptId(receiptId);
      if (data.receipt.reference_number) setVendorReferenceNumber(data.receipt.reference_number);
      if (data.receipt.shipping_price != null) setVendorShippingPrice(data.receipt.shipping_price);
      if (data.receipt.notes) setVendorNotes(data.receipt.notes);
    } catch { /* ignore */ }
  }, []);

  const pickReceiptItem = useCallback((item: ReceiptItem) => {
    setSelectedReceiptItemId(item.id);
    if (item.cost != null) setPurchasePrice(item.cost);
    if (item.description) setReceiptItemDescription(item.description);
    setShowReceiptPicker(false);
  }, []);

  /* ------ AI Research ------ */
  const runResearch = async () => {
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      appendCoachPhotos(formData, itemPhotos, conditionPhotos, googlePhotos);
      if (googleText.trim()) formData.append("google_text", googleText.trim());
      if (datePurchased) formData.append("date_purchased", datePurchased);
      if (purchasePrice != null) formData.append("purchase_price", String(purchasePrice));
      if (conditionCode) formData.append("condition_code", conditionCode);
      if (conditionNotes.trim()) formData.append("condition_notes", conditionNotes.trim());
      if (itemDescription.trim()) formData.append("item_description", itemDescription.trim());
      if (storeCategory.trim()) formData.append("store_category", storeCategory.trim());

      const response = await fetch("/api/listing-coach/analyze", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => ({}))) as ResearchResponse & ApiErrorShape;
      if (!response.ok || !data.ok) {
        setError(parseApiError(data, "Research failed"));
        setStep("input");
        return;
      }

      setResearchResult(data);
      setIdentification(data.suggested_identification.value);
      setConditionCode(data.suggested_condition_code);
      if (data.suggested_condition_code && conditionNotes.trim()) {
        setConditionNotes(conditionNotes);
      }

      if (data.price.confidence !== "low" && data.price.suggested_list_price != null) {
        setSaleRevenue(data.price.suggested_list_price);
      } else if (
        data.price.suggested_price_low != null &&
        data.price.suggested_price_high != null &&
        data.price.confidence !== "low"
      ) {
        setSaleRevenue(
          Math.round((data.price.suggested_price_low + data.price.suggested_price_high) / 2)
        );
      }

      if (data.suggested_when_made?.value) setEtsyWhenMade(data.suggested_when_made.value);
      if (data.suggested_taxonomy_id) setEtsyTaxonomyId(data.suggested_taxonomy_id);
      if (!data.listing_category_path && data.suggested_taxonomy_path) {
        setListingCategoryPath(data.suggested_taxonomy_path);
      }
      if (data.suggested_materials?.length) {
        setMaterialsText(data.suggested_materials.map((m) => m.value).join(", "));
      }
      if (data.suggested_dimensions) {
        const d = data.suggested_dimensions;
        if (d.weight) setItemWeight(d.weight);
        if (d.weight_unit) setItemWeightUnit(d.weight_unit);
        if (d.length) setItemLength(d.length);
        if (d.width) setItemWidth(d.width);
        if (d.height) setItemHeight(d.height);
        if (d.dimensions_unit) setItemDimensionsUnit(d.dimensions_unit);
      }
      if (data.photo_review?.classifications?.length) {
        setPhotoClassifications(data.photo_review.classifications);
      }
      if (!description.trim()) {
        setDescription(data.suggested_identification.value || data.listing_title.slice(0, 200));
      }

      // Populate editable listing fields
      setListingTitle(data.listing_title);
      setListingDescription(data.listing_description);
      setListingTags(data.listing_tags);
      setListingCategoryPath(data.listing_category_path ?? "");
      setListingTitleStrategy(data.listing_title_strategy);
      setListingProductStory(data.listing_product_story);
      setListingConditionClarity(data.listing_condition_clarity);
      setListingAttributes(data.listing_attributes);
      setListingPricingShippingNotes(data.listing_pricing_shipping_notes);
      setListingQualityChecklist(data.listing_quality_checklist);

      setStep("form");
    } catch {
      setError(
        createUiError({
          title: "Research failed",
          message: "We could not reach the server.",
          actions: ["Check your connection and retry."],
        })
      );
      setStep("input");
    } finally {
      setBusy(false);
    }
  };

  /* ------ Build refine context ------ */
  const buildRefineContext = useCallback(() => ({
    identification,
    listing_title: listingTitle,
    listing_description: listingDescription,
    listing_tags: listingTags,
    listing_category_path: listingCategoryPath || null,
    listing_condition_clarity: listingConditionClarity,
    listing_product_story: listingProductStory,
    listing_attributes: listingAttributes,
    listing_pricing_shipping_notes: listingPricingShippingNotes,
    listing_title_strategy: listingTitleStrategy,
    listing_quality_checklist: listingQualityChecklist,
    condition_code: conditionCode,
    condition_notes: conditionNotes,
    materials: materialsText,
    sale_price: saleRevenue,
  }), [
    identification, listingTitle, listingDescription, listingTags, listingCategoryPath,
    listingConditionClarity, listingProductStory, listingAttributes,
    listingPricingShippingNotes, listingTitleStrategy, listingQualityChecklist,
    conditionCode, conditionNotes, materialsText, saleRevenue,
  ]);

  /* ------ Global refine ------ */
  const runGlobalRefine = async () => {
    if (!globalFeedback.trim()) return;
    setRefining(true);
    try {
      const resp = await fetch("/api/listing-coach/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "global",
          instruction: globalFeedback.trim(),
          context: buildRefineContext(),
        }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        fields?: Record<string, string>;
      };
      if (data.ok && data.fields) {
        applyRefinedFields(data.fields);
        setGlobalFeedback("");
        toast.showToast("AI updated the listing based on your feedback.", "success");
        setTimeout(() => recomputeScore(), 100);
      }
    } catch {
      /* silent */
    } finally {
      setRefining(false);
    }
  };

  const applyRefinedFields = (fields: Record<string, string>) => {
    for (const [key, value] of Object.entries(fields)) {
      switch (key) {
        case "listing_title": setListingTitle(value); break;
        case "listing_description": setListingDescription(value); break;
        case "listing_tags": setListingTags(value); break;
        case "listing_category_path": setListingCategoryPath(value); break;
        case "listing_title_strategy": setListingTitleStrategy(value); break;
        case "listing_product_story": setListingProductStory(value); break;
        case "listing_condition_clarity": setListingConditionClarity(value); break;
        case "listing_attributes": setListingAttributes(value); break;
        case "listing_pricing_shipping_notes": setListingPricingShippingNotes(value); break;
        case "listing_quality_checklist": setListingQualityChecklist(value); break;
        case "condition_notes": setConditionNotes(value); break;
        case "identification": setIdentification(value); break;
        case "sale_price": setSaleRevenue(Number(value) || null); break;
      }
    }
  };

  /* ------ Save to inventory ------ */
  const runComplete = async () => {
    if (!researchResult || !itemNumber.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      appendCoachPhotos(formData, itemPhotos, conditionPhotos, googlePhotos);
      if (googleText.trim()) formData.append("google_text", googleText.trim());
      formData.append("item_number", itemNumber.trim());
      formData.append("description", description.trim());
      formData.append("status", status);
      formData.append("condition_code", conditionCode);
      if (saleRevenue != null) formData.append("sale_revenue", String(saleRevenue));
      if (purchasePrice != null) formData.append("purchase_cost", String(purchasePrice));
      if (datePurchased.trim()) formData.append("date_purchased", datePurchased.trim());
      if (storeCategory.trim()) formData.append("store_category", storeCategory.trim());
      if (conditionNotes.trim()) formData.append("condition_notes", conditionNotes.trim());
      if (researchResult.price.confidence) {
        formData.append("price_confidence", researchResult.price.confidence);
      }

      const composePayload: ComposeResponse = {
        ok: true,
        listing_title: listingTitle,
        listing_description: listingDescription,
        listing_tags: listingTags,
        listing_category_path: listingCategoryPath || null,
        listing_title_strategy: listingTitleStrategy,
        listing_product_story: listingProductStory,
        listing_condition_clarity: listingConditionClarity,
        listing_attributes: listingAttributes,
        listing_pricing_shipping_notes: listingPricingShippingNotes,
        listing_quality_checklist: listingQualityChecklist,
        quality_score: researchResult.quality_score,
      };
      formData.append("compose", JSON.stringify(composePayload));

      if (etsyWhenMade) formData.append("etsy_when_made", etsyWhenMade);
      if (etsyTaxonomyId) formData.append("etsy_taxonomy_id", String(etsyTaxonomyId));
      const hasAttrs = Object.keys(taxonomyAttributes).some((k) => taxonomyAttributes[k]);
      if (hasAttrs) formData.append("etsy_attributes_json", JSON.stringify(taxonomyAttributes));
      if (materialsText.trim()) {
        formData.append(
          "materials",
          JSON.stringify(materialsText.split(",").map((m) => m.trim()).filter(Boolean))
        );
      }
      formData.append("is_supply", isSupply ? "true" : "false");
      formData.append("quantity", String(quantity));
      if (shippingCostInbound != null) formData.append("shipping_cost_inbound", String(shippingCostInbound));
      if (categoryTags.trim()) formData.append("category_tags", categoryTags.trim());
      if (internalNotes.trim()) formData.append("internal_notes", internalNotes.trim());
      if (vendorName.trim()) formData.append("vendor_name", vendorName.trim());
      if (vendorId != null) formData.append("vendor_id", String(vendorId));
      if (vendorShippingPrice != null) formData.append("vendor_shipping_price", String(vendorShippingPrice));
      if (vendorReferenceNumber.trim()) formData.append("vendor_reference_number", vendorReferenceNumber.trim());
      if (vendorNotes.trim()) formData.append("vendor_notes", vendorNotes.trim());
      if (receiptPhoto) formData.append("receipt_photo", receiptPhoto);
      if (receiptItemDescription.trim()) formData.append("receipt_description", receiptItemDescription.trim());
      if (selectedReceiptItemId != null) formData.append("selected_receipt_item_id", String(selectedReceiptItemId));
      if (extraReceiptItems.length > 0) {
        const validExtras = extraReceiptItems
          .filter((e) => e.description.trim())
          .map((e) => ({ description: e.description.trim(), cost: e.cost ? Number(e.cost) : null }));
        if (validExtras.length > 0) {
          formData.append("extra_receipt_items", JSON.stringify(validExtras));
        }
      }
      if (itemWeight != null) {
        formData.append("item_weight", String(itemWeight));
        formData.append("item_weight_unit", itemWeightUnit);
      }
      if (itemLength != null) formData.append("item_length", String(itemLength));
      if (itemWidth != null) formData.append("item_width", String(itemWidth));
      if (itemHeight != null) formData.append("item_height", String(itemHeight));
      if (itemLength != null || itemWidth != null || itemHeight != null) {
        formData.append("item_dimensions_unit", itemDimensionsUnit);
      }
      if (photoClassifications.length > 0) {
        formData.append("picture_classifications", JSON.stringify(photoClassifications));
      }

      const response = await fetch("/api/listing-coach/complete", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
        ok?: boolean;
        item_id?: number;
      };
      if (!response.ok || !data.ok || !data.item_id) {
        setError(parseApiError(data, "Save failed"));
        return;
      }

      if (itemPhotos.length > 0) {
        setVideoGenerating(true);
        try {
          const videoResp = await fetch("/api/listing-coach/video", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              item_id: data.item_id,
              classifications: photoClassifications.length > 0 ? photoClassifications : undefined,
            }),
          });
          const videoData = (await videoResp.json().catch(() => ({}))) as {
            ok?: boolean;
            video_path?: string;
          };
          if (videoData.ok && videoData.video_path) {
            setVideoPath(videoData.video_path);
          }
        } catch {
          /* video generation is non-blocking */
        } finally {
          setVideoGenerating(false);
        }
      }

      toast.showToast("Listing saved to inventory.", "success");
      router.push(`/inventory?itemId=${data.item_id}`);
    } catch {
      setError(
        createUiError({
          title: "Save failed",
          message: "We could not reach the server.",
          actions: ["Check your connection and retry."],
        })
      );
    } finally {
      setBusy(false);
    }
  };

  const stepTitle = useMemo(() => {
    switch (step) {
      case "welcome": return "Add New Item";
      case "input": return "Log the purchase";
      case "form": return "Review & finalize";
      default: return "Add New Item";
    }
  }, [step]);

  const stepNumber = useMemo(() => {
    const steps: CoachStep[] = ["input", "form"];
    const idx = steps.indexOf(step);
    return idx >= 0 ? idx + 1 : 0;
  }, [step]);

  useEffect(() => {
    if (step === "form" && researchResult) recomputeScore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const recomputeScore = useCallback(() => {
    const picMap: Record<string, string | null> = {};
    itemPhotos.forEach((p, i) => { picMap[`picture_${i + 1}`] = p.previewUrl; });
    const result = computeListingScore({
      listing_title: listingTitle,
      listing_description: listingDescription,
      listing_tags: listingTags,
      category_tags: categoryTags,
      condition_code: conditionCode,
      condition_notes: conditionNotes,
      sale_revenue: saleRevenue,
      item_number: itemNumber,
      item_weight: itemWeight,
      item_length: itemLength,
      materials: materialsText ? JSON.stringify(materialsText.split(",").map((s: string) => s.trim()).filter(Boolean)) : null,
      ...picMap,
    });
    setLiveScore(result);
    return result;
  }, [
    listingTitle, listingDescription, listingTags, categoryTags,
    conditionCode, conditionNotes, saleRevenue, itemNumber,
    itemWeight, itemLength, materialsText, itemPhotos,
  ]);

  const inputClass = "mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2";

  const refineCtx = buildRefineContext();

  return (
    <section className="mx-auto max-w-4xl rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-accent)]">
            Inventory{stepNumber > 0 ? ` — Step ${stepNumber} of 2` : ""}
          </p>
          <h1 className="text-2xl font-semibold text-[var(--ui-title)]">{stepTitle}</h1>
          <p className="mt-1 text-sm text-[var(--ui-muted)]">
            {step === "input"
              ? "Log the purchase, add photos, and enter details. AI does the rest."
              : step === "form"
                ? "Review and edit everything. Fix, re-score, and repeat until it's ready."
                : "Enter your item details — AI handles the research, listing, and quality check."}
          </p>
        </div>
        <Link
          href="/inventory"
          className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm text-[var(--ui-body)] hover:bg-[var(--ui-neutral-hover)]"
        >
          Back to Inventory
        </Link>
      </div>

      {error ? <ErrorPanel error={error} onDismiss={() => setError(null)} /> : null}

      {/* WELCOME */}
      {step === "welcome" ? (
        <div className="space-y-4">
          {aiConfigured === false ? (
            <div className="rounded-xl border border-[var(--ui-yellow)]/40 bg-[var(--ui-yellow)]/10 px-4 py-3 text-sm text-[var(--ui-body)]">
              AI needs to be configured before adding items.{" "}
              <Link href="/config" className="font-semibold text-[var(--ui-accent)] underline">
                Open Config
              </Link>
            </div>
          ) : null}
          <ul className="list-disc space-y-2 pl-5 text-sm text-[var(--ui-body)]">
            <li>Log where you bought it — vendor, receipt, and purchase details.</li>
            <li>Add item photos — turntable shots, markings, and defects.</li>
            <li>Enter item details: description, condition, size, and weight.</li>
            <li>AI researches the item, writes the listing, and scores it for quality.</li>
            <li>Review, fix (manually or ask AI), re-score — repeat until you are satisfied.</li>
          </ul>
          <Button
            variant="primary"
            size="lg"
            disabled={aiConfigured === false}
            onClick={() => setStep("input")}
          >
            Start
          </Button>
        </div>
      ) : null}

      {/* PHASE 1: LOG THE PURCHASE */}
      {step === "input" ? (
        <div className="space-y-6">
          {/* Section 1: Where I Bought This (receipt first) */}
          <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--ui-title)]">Where I bought this</p>
              <span className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--ui-muted)]">
                Optional — scroll down to skip
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="block text-sm text-[var(--ui-body)]">
                <span className="block mb-1">Vendor / source</span>
                <VendorPicker
                  vendorId={vendorId}
                  onChange={(id, name) => {
                    setVendorId(id);
                    setVendorName(name ?? "");
                    setSelectedReceiptId(null);
                    setReceiptItems([]);
                    setSelectedReceiptItemId(null);
                    setShowReceiptPicker(false);
                    if (name) void fetchReceiptsForVendor(name);
                    else setVendorReceipts([]);
                  }}
                  placeholder="e.g. Goodwill, estate sale, eBay"
                  allowEmpty={false}
                  className={inputClass}
                />
              </div>
              <label className="block text-sm text-[var(--ui-body)]">
                Vendor shipping cost ($)
                <input type="number" min="0" step="0.01" value={vendorShippingPrice ?? ""} onChange={(e) => setVendorShippingPrice(e.target.value === "" ? null : Number(e.target.value))} className={inputClass} placeholder="Shipping you paid to receive it" />
              </label>
            </div>

            {/* Receipt picker */}
            {vendorReceipts.length > 0 && !selectedReceiptId ? (
              <div className="rounded-lg border border-[var(--ui-accent)]/40 bg-[var(--ui-accent)]/5 p-3 space-y-2">
                <p className="text-sm font-medium text-[var(--ui-accent)]">
                  This vendor has {vendorReceipts.length} receipt{vendorReceipts.length > 1 ? "s" : ""} with unprocessed items
                </p>
                <div className="space-y-1">
                  {vendorReceipts.map((rx) => (
                    <button
                      key={rx.id}
                      type="button"
                      onClick={() => void loadReceiptItems(rx.id)}
                      className="flex w-full items-center justify-between rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-left text-sm hover:border-[var(--ui-accent)] transition-colors"
                    >
                      <span className="text-[var(--ui-body)]">
                        {rx.purchase_date ?? "No date"}{rx.reference_number ? ` — ${rx.reference_number}` : ""}
                      </span>
                      <span className="text-xs text-[var(--ui-muted)]">
                        {rx.unassigned_items} item{rx.unassigned_items !== 1 ? "s" : ""} remaining
                      </span>
                    </button>
                  ))}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setVendorReceipts([])}>
                  Skip — this is a new receipt
                </Button>
              </div>
            ) : null}

            {/* Receipt items table */}
            {selectedReceiptId && receiptItems.length > 0 ? (
              <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] overflow-hidden">
                <div className="flex items-center justify-between border-b border-[var(--ui-border)] px-3 py-2">
                  <p className="text-sm font-medium text-[var(--ui-title)]">Items on this receipt</p>
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedReceiptId(null); setReceiptItems([]); setSelectedReceiptItemId(null); }}>
                    Use a different receipt
                  </Button>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--ui-border)] text-xs text-[var(--ui-muted)]">
                      <th className="px-3 py-1.5 text-left font-medium">Description</th>
                      <th className="px-3 py-1.5 text-right font-medium">Cost</th>
                      <th className="px-3 py-1.5 text-center font-medium w-24">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiptItems.map((ri) => {
                      const assigned = ri.inventory_id != null;
                      const picked = ri.id === selectedReceiptItemId;
                      return (
                        <tr
                          key={ri.id}
                          className={`border-b border-[var(--ui-border)] last:border-b-0 ${
                            picked ? "bg-[var(--ui-accent)]/10" : assigned ? "opacity-50" : ""
                          }`}
                        >
                          <td className={`px-3 py-2 text-[var(--ui-body)] ${assigned ? "line-through" : ""}`}>
                            {ri.description}
                          </td>
                          <td className={`px-3 py-2 text-right text-[var(--ui-body)] ${assigned ? "line-through" : ""}`}>
                            {ri.cost != null ? `$${ri.cost.toFixed(2)}` : "—"}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {picked ? (
                              <span className="text-xs font-medium text-[var(--ui-green)]">Selected</span>
                            ) : assigned ? (
                              <span className="text-xs text-[var(--ui-muted)]">Listed ({ri.item_number ?? `#${ri.inventory_id}`})</span>
                            ) : (
                              <Button variant="accent" size="sm" onClick={() => pickReceiptItem(ri)}>
                                Pick
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm text-[var(--ui-body)]">
                Reference # (optional)
                <input value={vendorReferenceNumber} onChange={(e) => setVendorReferenceNumber(e.target.value)} className={inputClass} placeholder="Receipt #, order #, etc." />
              </label>
              <label className="block text-sm text-[var(--ui-body)]">
                Purchase notes (optional)
                <input value={vendorNotes} onChange={(e) => setVendorNotes(e.target.value)} className={inputClass} placeholder="Any notes about this purchase" spellCheck />
              </label>
            </div>
            <div>
              <span className="block text-sm text-[var(--ui-body)] mb-1">Receipt photo (optional)</span>
              <div className="flex items-start gap-3">
                {receiptPreview ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={receiptPreview} alt="Receipt" className="h-24 w-24 rounded-lg border border-[var(--ui-border)] object-cover" />
                    <button
                      type="button"
                      onClick={() => { if (receiptPreview) URL.revokeObjectURL(receiptPreview); setReceiptPhoto(null); setReceiptPreview(null); }}
                      className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--ui-red)] text-[10px] text-white"
                      aria-label="Remove receipt photo"
                    >
                      &times;
                    </button>
                  </div>
                ) : (
                  <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-[var(--ui-border)] bg-[var(--ui-card-bg)] text-center hover:border-[var(--ui-accent)] transition-colors">
                    <span className="text-lg text-[var(--ui-muted)]">+</span>
                    <span className="text-[10px] text-[var(--ui-muted)]">Add photo</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setReceiptPhoto(file);
                          setReceiptPreview(URL.createObjectURL(file));
                        }
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
                <p className="text-xs text-[var(--ui-muted)] mt-2">Snap a photo of the receipt for your records. Not sent to Etsy.</p>
              </div>
            </div>

            {/* Other items on this receipt */}
            {!selectedReceiptId ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--ui-body)]">Other items on this receipt (optional)</span>
                  <Button variant="ghost" size="sm" onClick={() => setExtraReceiptItems([...extraReceiptItems, { description: "", cost: "" }])}>
                    + Add item
                  </Button>
                </div>
                {extraReceiptItems.length > 0 ? (
                  <p className="text-xs text-[var(--ui-muted)]">
                    List other items you bought on the same receipt. You can process them later when you add each item.
                  </p>
                ) : null}
                {extraReceiptItems.map((ei, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input
                      value={ei.description}
                      onChange={(e) => {
                        const next = [...extraReceiptItems];
                        next[idx] = { ...next[idx], description: e.target.value };
                        setExtraReceiptItems(next);
                      }}
                      className="flex-1 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm text-[var(--ui-body)]"
                      placeholder="Item description"
                      spellCheck
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={ei.cost}
                      onChange={(e) => {
                        const next = [...extraReceiptItems];
                        next[idx] = { ...next[idx], cost: e.target.value };
                        setExtraReceiptItems(next);
                      }}
                      className="w-24 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm text-[var(--ui-body)]"
                      placeholder="Cost"
                    />
                    <button
                      type="button"
                      onClick={() => setExtraReceiptItems(extraReceiptItems.filter((_, i) => i !== idx))}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--ui-muted)] hover:text-[var(--ui-red)] transition-colors"
                      aria-label="Remove item"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* Section 2: Item photos */}
          <PhotoPasteZone
            photos={itemPhotos}
            onChange={setItemPhotos}
            maxPhotos={20}
            title="Item photos (required)"
            pasteHint="Click here, then press Cmd+V to paste photos (up to 20)"
            slotGuidance={ITEM_PHOTO_GUIDANCE}
          />
          <PhotoPasteZone
            photos={conditionPhotos}
            onChange={setConditionPhotos}
            maxPhotos={5}
            title="Condition photos (optional)"
            pasteHint="Paste condition or flaw photos here (optional)"
            emptyHint="Close-ups of any crazing, chips, scratches, repairs, or wear. Up to 5 images."
          />

          {/* Section 3: Item details */}
          <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4 space-y-4">
            <p className="text-sm font-semibold text-[var(--ui-title)]">Item details</p>
            {receiptItemDescription ? (
              <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2">
                <span className="text-xs font-medium text-[var(--ui-muted)]">Receipt says:</span>
                <span className="ml-2 text-sm text-[var(--ui-body)]">{receiptItemDescription}</span>
              </div>
            ) : null}
            <label className="block text-sm text-[var(--ui-body)]">
              What is this item? (your description)
              <input
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                className={inputClass}
                placeholder='"Homer Laughlin fiesta ware dinner plate, yellow"'
                spellCheck
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm text-[var(--ui-body)]">
                Date purchased
                <input
                  type="date"
                  value={datePurchased}
                  onChange={(e) => setDatePurchased(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="block text-sm text-[var(--ui-body)]">
                Purchase price ($)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={purchasePrice ?? ""}
                  onChange={(e) => setPurchasePrice(e.target.value === "" ? null : Number(e.target.value))}
                  className={inputClass}
                  placeholder="What you paid"
                />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm text-[var(--ui-body)]">
                Condition
                <select value={conditionCode} onChange={(e) => setConditionCode(e.target.value)} className={inputClass}>
                  <option value="Mint/Near Mint">Mint/Near Mint</option>
                  <option value="Excellent">Excellent</option>
                  <option value="Very Good">Very Good</option>
                  <option value="Good">Good</option>
                  <option value="Fair/As-Is">Fair/As-Is</option>
                </select>
              </label>
              <label className="block text-sm text-[var(--ui-body)]">
                Store category
                {addingCategory ? (
                  <div className="mt-1 flex gap-2">
                    <input
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); void addNewCategory(); }
                        if (e.key === "Escape") { setAddingCategory(false); setNewCategoryName(""); }
                      }}
                      className="flex-1 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2"
                      placeholder="New category name"
                      autoFocus
                      spellCheck
                    />
                    <Button variant="primary" size="sm" onClick={() => void addNewCategory()}>Add</Button>
                    <Button variant="ghost" size="sm" onClick={() => { setAddingCategory(false); setNewCategoryName(""); }}>Cancel</Button>
                  </div>
                ) : (
                  <select
                    value={storeCategory}
                    onChange={(e) => {
                      if (e.target.value === "__add_new__") setAddingCategory(true);
                      else setStoreCategory(e.target.value);
                    }}
                    className={inputClass}
                  >
                    <option value="">-- Select category --</option>
                    {storeCategoryList.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="__add_new__">+ Add new category...</option>
                  </select>
                )}
              </label>
            </div>
            <label className="block text-sm text-[var(--ui-body)]">
              Condition notes (optional)
              <textarea
                value={conditionNotes}
                onChange={(e) => setConditionNotes(e.target.value)}
                rows={2}
                className={inputClass}
                placeholder="Any specific flaws, repairs, or notable characteristics"
                spellCheck
              />
            </label>
          </div>

          {/* Weight & Dimensions */}
          <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4 space-y-4">
            <p className="text-sm font-semibold text-[var(--ui-title)]">Size &amp; weight (optional)</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm text-[var(--ui-body)]">
                Weight
                <div className="mt-1 flex gap-2">
                  <input type="number" min="0" step="0.1" value={itemWeight ?? ""} onChange={(e) => setItemWeight(e.target.value === "" ? null : Number(e.target.value))} className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm text-[var(--ui-body)]" placeholder="e.g. 12" />
                  <select value={itemWeightUnit} onChange={(e) => setItemWeightUnit(e.target.value)} className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-2 text-sm text-[var(--ui-body)]">
                    <option value="oz">oz</option>
                    <option value="lb">lb</option>
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
              </label>
              <div className="space-y-2">
                <span className="block text-sm text-[var(--ui-body)]">Dimensions ({itemDimensionsUnit})</span>
                <div className="flex gap-2">
                  <input type="number" min="0" step="0.1" value={itemLength ?? ""} onChange={(e) => setItemLength(e.target.value === "" ? null : Number(e.target.value))} className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm text-[var(--ui-body)]" placeholder="L" />
                  <input type="number" min="0" step="0.1" value={itemWidth ?? ""} onChange={(e) => setItemWidth(e.target.value === "" ? null : Number(e.target.value))} className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm text-[var(--ui-body)]" placeholder="W" />
                  <input type="number" min="0" step="0.1" value={itemHeight ?? ""} onChange={(e) => setItemHeight(e.target.value === "" ? null : Number(e.target.value))} className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm text-[var(--ui-body)]" placeholder="H" />
                  <select value={itemDimensionsUnit} onChange={(e) => setItemDimensionsUnit(e.target.value)} className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-2 text-sm text-[var(--ui-body)]">
                    <option value="in">in</option>
                    <option value="cm">cm</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Collapsible: Add my own research */}
          <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)]">
            <button
              type="button"
              onClick={() => setShowResearch(!showResearch)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-[var(--ui-title)]"
            >
              <span>Add my own research (optional)</span>
              <span className="text-[var(--ui-muted)]">{showResearch ? "Hide" : "Show"}</span>
            </button>
            {showResearch ? (
              <div className="border-t border-[var(--ui-border)] px-4 pb-4 pt-3">
                <p className="mb-3 text-xs text-[var(--ui-muted)]">
                  If the AI struggles to identify your item, paste Google Visual Search screenshots or
                  research text here.
                </p>
                <GoogleResultsPasteZone
                  photos={googlePhotos}
                  onChange={setGooglePhotos}
                  text={googleText}
                  onTextChange={setGoogleText}
                />
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setStep("welcome")}>Back</Button>
            <Button variant="ghost" onClick={() => setStartOverOpen(true)}>Start over</Button>
            <Button
              variant="primary"
              disabled={itemPhotos.length === 0}
              busy={busy}
              onClick={() => { setStep("form"); void runResearch(); }}
            >
              Research and compose listing
            </Button>
          </div>
        </div>
      ) : null}

      {/* LOADING: AI researching */}
      {step === "form" && busy && !researchResult ? (
        <div className="flex flex-col items-center gap-3 py-12">
          <LoadingSpinner />
          <p className="text-sm text-[var(--ui-muted)]">Researching your item with AI and web search...</p>
          <p className="text-xs text-[var(--ui-muted)]">This may take 30-60 seconds for deep research.</p>
        </div>
      ) : null}

      {/* PHASE 2: UNIFIED EDITABLE FORM */}
      {step === "form" && researchResult ? (
        <div className="space-y-6">

          {/* Section 1: Identity & Financials */}
          <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4 space-y-4">
            <SectionHeader title="Identity & Financials" />
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm text-[var(--ui-body)]">
                Item number <span className="text-[var(--ui-red)]">*</span>
                <input value={itemNumber} onChange={(e) => setItemNumber(e.target.value)} className={inputClass} placeholder="e.g. TCT-2026-042" />
              </label>
              <label className="block text-sm text-[var(--ui-body)]">
                Internal description <span className="text-[var(--ui-red)]">*</span>
                <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
              </label>
            </div>
            <div className="flex items-center gap-2">
              <label className="block text-sm text-[var(--ui-body)]">
                Identification
                <EvidenceBadge evidence={researchResult.suggested_identification} />
              </label>
              <FieldFixButton fieldName="identification" currentValue={identification} context={refineCtx} onFixed={setIdentification} />
            </div>
            <input value={identification} onChange={(e) => setIdentification(e.target.value)} className={inputClass} />

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block text-sm text-[var(--ui-body)]">
                Status
                <select value={status} onChange={(e) => setStatus(e.target.value as "In stock" | "Draft")} className={inputClass}>
                  <option value="In stock">In stock</option>
                  <option value="Draft">Draft</option>
                </select>
              </label>
              <label className="block text-sm text-[var(--ui-body)]">
                Quantity
                <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.floor(Number(e.target.value) || 1)))} className={inputClass} />
              </label>
              <label className="block text-sm text-[var(--ui-body)]">
                Store category
                <input value={storeCategory} onChange={(e) => setStoreCategory(e.target.value)} className={inputClass} />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block text-sm text-[var(--ui-body)]">
                Sale price ($)
                <FieldFixButton fieldName="sale_price" currentValue={saleRevenue != null ? String(saleRevenue) : ""} context={refineCtx} onFixed={(v) => setSaleRevenue(Number(v) || null)} />
                <input type="number" min="0" step="0.01" value={saleRevenue ?? ""} onChange={(e) => setSaleRevenue(e.target.value === "" ? null : Number(e.target.value))} className={inputClass} placeholder="Recommended by AI" />
              </label>
              <label className="block text-sm text-[var(--ui-body)]">
                Purchase cost ($)
                <input type="number" min="0" step="0.01" value={purchasePrice ?? ""} onChange={(e) => setPurchasePrice(e.target.value === "" ? null : Number(e.target.value))} className={inputClass} />
              </label>
              <label className="block text-sm text-[var(--ui-body)]">
                Shipping cost (inbound)
                <input type="number" min="0" step="0.01" value={shippingCostInbound ?? ""} onChange={(e) => setShippingCostInbound(e.target.value === "" ? null : Number(e.target.value))} className={inputClass} />
              </label>
            </div>

            {researchResult.price.rationale ? (
              <p className="text-xs text-[var(--ui-muted)]">
                AI pricing rationale: {researchResult.price.rationale}
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm text-[var(--ui-body)]">
                Date purchased
                <input type="date" value={datePurchased} onChange={(e) => setDatePurchased(e.target.value)} className={inputClass} />
              </label>
              <label className="block text-sm text-[var(--ui-body)]">
                Category / tags
                <input value={categoryTags} onChange={(e) => setCategoryTags(e.target.value)} className={inputClass} placeholder="e.g. vintage, collectible, pottery" />
              </label>
            </div>
          </div>

          {/* Section 2: Condition */}
          <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4 space-y-3">
            <SectionHeader title="Condition" />
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm text-[var(--ui-body)]">
                Condition code
                <select value={conditionCode} onChange={(e) => setConditionCode(e.target.value)} className={inputClass}>
                  <option value="Mint/Near Mint">Mint/Near Mint</option>
                  <option value="Excellent">Excellent</option>
                  <option value="Very Good">Very Good</option>
                  <option value="Good">Good</option>
                  <option value="Fair/As-Is">Fair/As-Is</option>
                </select>
              </label>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-[var(--ui-body)]">Condition notes</label>
              <FieldFixButton fieldName="condition_notes" currentValue={conditionNotes} context={refineCtx} onFixed={setConditionNotes} />
            </div>
            <textarea value={conditionNotes} onChange={(e) => setConditionNotes(e.target.value)} rows={3} className={inputClass} spellCheck placeholder="AI-enhanced condition notes" />
          </div>

          {/* Section 3: Etsy Listing */}
          <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4 space-y-4">
            <SectionHeader title="Etsy Listing" />

            <div className="flex items-center gap-2">
              <label className="text-sm text-[var(--ui-body)]">Listing title (max 140 chars)</label>
              <FieldFixButton fieldName="listing_title" currentValue={listingTitle} context={refineCtx} onFixed={setListingTitle} />
            </div>
            <input value={listingTitle} onChange={(e) => setListingTitle(e.target.value)} maxLength={140} className={inputClass} />
            <p className="text-xs text-[var(--ui-muted)]">{listingTitle.length}/140 characters</p>

            <div className="flex items-center gap-2">
              <label className="text-sm text-[var(--ui-body)]">Listing description</label>
              <FieldFixButton fieldName="listing_description" currentValue={listingDescription} context={refineCtx} onFixed={setListingDescription} />
            </div>
            <textarea value={listingDescription} onChange={(e) => setListingDescription(e.target.value)} rows={8} className={inputClass} spellCheck />

            <div className="flex items-center gap-2">
              <label className="text-sm text-[var(--ui-body)]">Listing tags (13 max, comma-separated)</label>
              <FieldFixButton fieldName="listing_tags" currentValue={listingTags} context={refineCtx} onFixed={setListingTags} />
            </div>
            <input value={listingTags} onChange={(e) => setListingTags(e.target.value)} className={inputClass} />
            <div className="flex flex-wrap gap-1">
              {listingTags.split(",").map((t) => t.trim()).filter(Boolean).map((tag) => (
                <span key={tag} className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-2 py-0.5 text-xs text-[var(--ui-body)]">{tag}</span>
              ))}
            </div>

            <label className="block text-sm text-[var(--ui-body)]">
              Etsy category
              <TaxonomyCategoryPicker
                value={etsyTaxonomyId}
                valuePath={listingCategoryPath || undefined}
                onChange={(id, fullPath) => {
                  setEtsyTaxonomyId(id);
                  setListingCategoryPath(fullPath);
                  setTaxonomyAttributes({});
                }}
                className="mt-1"
              />
              {researchResult?.suggested_taxonomy_path && !listingCategoryPath ? (
                <Button variant="ghost" size="sm" onClick={() => setListingCategoryPath(researchResult.suggested_taxonomy_path!)} className="mt-1">
                  Use AI suggestion: {researchResult.suggested_taxonomy_path}
                </Button>
              ) : null}
            </label>
            <TaxonomyAttributesPanel
              taxonomyId={etsyTaxonomyId}
              values={taxonomyAttributes}
              onChange={setTaxonomyAttributes}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm text-[var(--ui-body)]">
                When was it made?
                {researchResult.suggested_when_made ? <EvidenceBadge evidence={researchResult.suggested_when_made} /> : null}
                <select value={etsyWhenMade} onChange={(e) => setEtsyWhenMade(e.target.value)} className={inputClass}>
                  <option value="">Select era...</option>
                  {["made_to_order","2020_2026","2010_2019","2004_2009","2000_2003","1990s","1980s","1970s","1960s","1950s","1940s","1930s","1920s","1910s","1900s","1800s","1700s","before_1700"].map((era) => (
                    <option key={era} value={era}>{era.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </label>
              <div className="flex items-start gap-4">
                <label className="block flex-1 text-sm text-[var(--ui-body)]">
                  Materials (comma-separated)
                  <input value={materialsText} onChange={(e) => setMaterialsText(e.target.value)} className={inputClass} placeholder="e.g. ceramic, glaze, gold trim" />
                </label>
                <label className="mt-6 flex items-center gap-2 text-sm text-[var(--ui-body)] whitespace-nowrap cursor-pointer">
                  <input type="checkbox" checked={isSupply} onChange={(e) => setIsSupply(e.target.checked)} className="h-4 w-4 rounded border-[var(--ui-border)] bg-[var(--ui-card-bg)]" />
                  Is supply
                </label>
              </div>
            </div>
          </div>

          {/* Section 4: Weight & Dimensions */}
          <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4 space-y-3">
            <SectionHeader title="Weight & Dimensions" />
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm text-[var(--ui-body)]">
                Weight
                <div className="mt-1 flex gap-2">
                  <input type="number" min="0" step="0.1" value={itemWeight ?? ""} onChange={(e) => setItemWeight(e.target.value === "" ? null : Number(e.target.value))} className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2" placeholder="e.g. 12" />
                  <select value={itemWeightUnit} onChange={(e) => setItemWeightUnit(e.target.value)} className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-2">
                    <option value="oz">oz</option>
                    <option value="lb">lb</option>
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
              </label>
              <label className="block text-sm text-[var(--ui-body)]">
                Length
                <input type="number" min="0" step="0.1" value={itemLength ?? ""} onChange={(e) => setItemLength(e.target.value === "" ? null : Number(e.target.value))} className={inputClass} placeholder="L" />
              </label>
              <label className="block text-sm text-[var(--ui-body)]">
                Width
                <input type="number" min="0" step="0.1" value={itemWidth ?? ""} onChange={(e) => setItemWidth(e.target.value === "" ? null : Number(e.target.value))} className={inputClass} placeholder="W" />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm text-[var(--ui-body)]">
                Height
                <input type="number" min="0" step="0.1" value={itemHeight ?? ""} onChange={(e) => setItemHeight(e.target.value === "" ? null : Number(e.target.value))} className={inputClass} placeholder="H" />
              </label>
              <label className="block text-sm text-[var(--ui-body)]">
                Dimensions unit
                <select value={itemDimensionsUnit} onChange={(e) => setItemDimensionsUnit(e.target.value)} className={inputClass}>
                  <option value="in">inches</option>
                  <option value="ft">feet</option>
                  <option value="mm">mm</option>
                  <option value="cm">cm</option>
                  <option value="m">m</option>
                </select>
              </label>
            </div>
          </div>

          {/* Section 5: Listing Workshop (internal AI fields) */}
          <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4 space-y-3">
            <SectionHeader title="Listing Workshop (internal — not sent to Etsy)" />
            {([
              ["listing_title_strategy", "Title Strategy", listingTitleStrategy, setListingTitleStrategy],
              ["listing_product_story", "Product Story", listingProductStory, setListingProductStory],
              ["listing_condition_clarity", "Condition Clarity", listingConditionClarity, setListingConditionClarity],
              ["listing_attributes", "Attributes", listingAttributes, setListingAttributes],
              ["listing_pricing_shipping_notes", "Pricing/Shipping Notes", listingPricingShippingNotes, setListingPricingShippingNotes],
              ["listing_quality_checklist", "Quality Checklist", listingQualityChecklist, setListingQualityChecklist],
            ] as [string, string, string, (v: string) => void][]).map(([fieldKey, label, value, setter]) => (
              <div key={fieldKey}>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-[var(--ui-body)]">{label}</label>
                  <FieldFixButton fieldName={fieldKey} currentValue={value} context={refineCtx} onFixed={setter} />
                </div>
                <textarea value={value} onChange={(e) => setter(e.target.value)} rows={2} className={inputClass} spellCheck />
              </div>
            ))}
          </div>

          {/* Section 6: Where I bought this */}
          <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4 space-y-3">
            <SectionHeader title="Where I Bought This" />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="block text-sm text-[var(--ui-body)]">
                Vendor name
                <div className="mt-1">
                  <VendorPicker
                    vendorId={vendorId}
                    onChange={(id, name) => { setVendorId(id); setVendorName(name ?? ""); }}
                    placeholder="Select vendor..."
                    allowEmpty={false}
                    className={inputClass}
                  />
                </div>
              </div>
              <label className="block text-sm text-[var(--ui-body)]">
                Vendor shipping cost
                <input type="number" min="0" step="0.01" value={vendorShippingPrice ?? ""} onChange={(e) => setVendorShippingPrice(e.target.value === "" ? null : Number(e.target.value))} className={inputClass} />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm text-[var(--ui-body)]">
                Reference number
                <input value={vendorReferenceNumber} onChange={(e) => setVendorReferenceNumber(e.target.value)} className={inputClass} placeholder="Receipt #, lot #, etc." />
              </label>
              <label className="block text-sm text-[var(--ui-body)]">
                Purchase notes
                <input value={vendorNotes} onChange={(e) => setVendorNotes(e.target.value)} className={inputClass} placeholder="Notes about the purchase" />
              </label>
            </div>
          </div>

          {/* Section 7: Internal notes */}
          <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4 space-y-3">
            <SectionHeader title="Internal Notes" />
            <textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={2} className={inputClass} placeholder="Private notes (not sent to Etsy)" spellCheck />
          </div>

          {/* Section 8: Photos & Quality */}
          <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4 space-y-4">
            <SectionHeader title="Photos & Quality" />

            {/* Photo classifications */}
            {photoClassifications.length > 0 ? (
              <div>
                <p className="text-sm text-[var(--ui-body)]">Photo classifications</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {photoClassifications.map((pc, idx) => (
                    <div key={pc.photo_index} className="flex items-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm">
                      <span className="shrink-0 text-[var(--ui-muted)]">#{pc.photo_index + 1}</span>
                      <select
                        value={pc.type}
                        onChange={(e) => {
                          const updated = [...photoClassifications];
                          updated[idx] = { ...pc, type: e.target.value, confidence: 1 };
                          setPhotoClassifications(updated);
                        }}
                        className="flex-1 rounded border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-2 py-1 text-xs"
                      >
                        <option value={pc.type}>{SHOT_LABELS[pc.type] ?? pc.type}</option>
                        {["hero","angle","detail","backstamp","scale","imperfection","underside","grouping","lifestyle","measurement","extra"]
                          .filter((t) => t !== pc.type)
                          .map((t) => <option key={t} value={t}>{SHOT_LABELS[t] ?? t}</option>)}
                      </select>
                      {pc.confidence < 0.7 ? <span className="text-xs text-[var(--ui-yellow)]" title="Low confidence">?</span> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Quality score — live */}
            {(() => {
              const qs = liveScore ?? { score: researchResult.quality_score.score, grade: researchResult.quality_score.score >= 80 ? "green" as const : researchResult.quality_score.score >= 60 ? "yellow" as const : "red" as const, tips: researchResult.quality_score.hints, breakdown: {} };
              const color = qs.score >= 80 ? "var(--ui-green)" : qs.score >= 60 ? "var(--ui-yellow)" : "var(--ui-red)";
              return (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-start gap-4">
                    <div
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-[var(--ui-title)]"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${color} 25%, transparent)`,
                        border: `2px solid ${color}`,
                      }}
                    >
                      {qs.score}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-[var(--ui-title)]">Listing quality score</p>
                      {qs.tips.length > 0 ? (
                        <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-[var(--ui-body)]">
                          {qs.tips.map((hint) => <li key={hint}>{hint}</li>)}
                        </ul>
                      ) : (
                        <p className="mt-1 text-xs text-[var(--ui-green)]">Score is excellent — ready to list!</p>
                      )}
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={recomputeScore}
                    >
                      Re-score
                    </Button>
                  </div>
                  {qs.score < 100 ? (
                    <p className="text-xs text-[var(--ui-muted)]">
                      Fix the items above (manually or use the AI fix box below), then click Re-score.
                    </p>
                  ) : null}
                </div>
              );
            })()}

            {/* Citations */}
            {researchResult.citations.length > 0 ? (
              <div>
                <p className="text-sm text-[var(--ui-body)]">Research citations ({researchResult.citations.length})</p>
                <ul className="mt-2 space-y-1">
                  {researchResult.citations.map((c, i) => (
                    <li key={i} className="text-xs text-[var(--ui-body)]">
                      <span className="font-medium">{c.claim}</span>
                      <span className="text-[var(--ui-muted)]"> — {c.source}</span>
                      {c.url ? (
                        <a href={c.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-[var(--ui-accent)] underline">link</a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Compliance */}
            {researchResult.compliance_check.issues.length > 0 ? (
              <div className="rounded-lg border border-[var(--ui-red)]/40 bg-[var(--ui-red)]/10 px-4 py-3">
                <p className="text-sm font-semibold text-[var(--ui-red)]">Compliance issues</p>
                <ul className="mt-1 list-disc pl-5 text-sm text-[var(--ui-body)]">
                  {researchResult.compliance_check.issues.map((issue, i) => <li key={i}>{issue}</li>)}
                </ul>
              </div>
            ) : null}
          </div>

          {/* Global refinement */}
          <div className="rounded-xl border border-[var(--ui-accent)]/30 bg-[var(--ui-accent)]/5 p-4 space-y-3">
            <p className="text-sm font-semibold text-[var(--ui-title)]">
              Tell the AI what to fix or improve
            </p>
            <textarea
              value={globalFeedback}
              onChange={(e) => setGlobalFeedback(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[var(--ui-accent)]/30 bg-[var(--ui-card-bg)] p-2 text-sm"
              placeholder='e.g. "Add detail about the gold trim" or "Make the description shorter"'
              spellCheck
            />
            <Button
              variant="primary"
              busy={refining}
              disabled={!globalFeedback.trim()}
              onClick={() => void runGlobalRefine()}
            >
              Fix it
            </Button>
          </div>

          {/* Video status */}
          {videoGenerating ? (
            <div className="flex items-center gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-4 py-3">
              <LoadingSpinner />
              <span className="text-sm text-[var(--ui-muted)]">Generating listing video...</span>
            </div>
          ) : videoPath ? (
            <div className="rounded-xl border border-[var(--ui-green)]/40 bg-[var(--ui-green)]/10 px-4 py-3 text-sm text-[var(--ui-body)]">
              Listing video generated successfully.
            </div>
          ) : null}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => { setResearchResult(null); setLiveScore(null); setStep("input"); }}>
              Back to edit inputs
            </Button>
            <Button variant="ghost" onClick={() => setStartOverOpen(true)}>
              Start over
            </Button>
            <Button
              variant="primary"
              busy={busy}
              disabled={!itemNumber.trim()}
              onClick={() => void runComplete()}
            >
              Save to inventory
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={startOverOpen}
        onClose={() => setStartOverOpen(false)}
        onConfirm={() => { resetSession(); setStartOverOpen(false); }}
        title="Start over?"
        description="This clears all photos, answers, and the composed listing from this session."
        confirmLabel="Start over"
        confirmVariant="danger"
      />
    </section>
  );
}
