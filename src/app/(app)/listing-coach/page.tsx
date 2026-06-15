"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleResultsPasteZone } from "@/components/listing-coach/GoogleResultsPasteZone";
import { ListingPreview } from "@/components/listing-coach/ListingPreview";
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
import { useToast } from "@/hooks/useToast";
import { createUiError } from "@/lib/ui-error";
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

export default function ListingCoachPage() {
  const router = useRouter();
  const toast = useToast();

  const [step, setStep] = useState<CoachStep>("welcome");
  const [itemPhotos, setItemPhotos] = useState<CoachPhoto[]>([]);
  const [conditionPhotos, setConditionPhotos] = useState<CoachPhoto[]>([]);
  const [googlePhotos, setGooglePhotos] = useState<CoachPhoto[]>([]);
  const [googleText, setGoogleText] = useState("");
  const [showResearch, setShowResearch] = useState(false);

  const [datePurchased, setDatePurchased] = useState("");
  const [purchasePrice, setPurchasePrice] = useState<number | null>(null);
  const [conditionCode, setConditionCode] = useState("Good");
  const [conditionNotes, setConditionNotes] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [storeCategory, setStoreCategory] = useState("");

  const [researchResult, setResearchResult] = useState<ResearchResponse | null>(null);
  const [identification, setIdentification] = useState("");
  const [saleRevenue, setSaleRevenue] = useState<number | null>(null);

  const [etsyWhenMade, setEtsyWhenMade] = useState("");
  const [etsyTaxonomyId, setEtsyTaxonomyId] = useState<number | null>(null);
  const [materialsText, setMaterialsText] = useState("");
  const [itemWeight, setItemWeight] = useState<number | null>(null);
  const [itemWeightUnit, setItemWeightUnit] = useState("oz");
  const [itemLength, setItemLength] = useState<number | null>(null);
  const [itemWidth, setItemWidth] = useState<number | null>(null);
  const [itemHeight, setItemHeight] = useState<number | null>(null);
  const [itemDimensionsUnit, setItemDimensionsUnit] = useState("in");
  const [photoClassifications, setPhotoClassifications] = useState<
    Array<{ photo_index: number; type: string; confidence: number }>
  >([]);

  const [itemNumber, setItemNumber] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"In stock" | "Draft">("In stock");

  const [videoGenerating, setVideoGenerating] = useState(false);
  const [videoPath, setVideoPath] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [startOverOpen, setStartOverOpen] = useState(false);

  useEffect(() => {
    void fetch("/api/settings/ai", { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((data: { config?: AiConfig }) => {
        setAiConfigured(Boolean(data.config?.apiKeyConfigured));
      })
      .catch(() => setAiConfigured(false));
  }, []);

  useEffect(() => {
    return () => {
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
    setResearchResult(null);
    setIdentification("");
    setSaleRevenue(null);
    setEtsyWhenMade("");
    setEtsyTaxonomyId(null);
    setMaterialsText("");
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
    setVideoGenerating(false);
    setVideoPath(null);
    setError(null);
  }, [itemPhotos, conditionPhotos, googlePhotos]);

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
      setStep("research");
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
      if (researchResult.price.confidence) {
        formData.append("price_confidence", researchResult.price.confidence);
      }

      const composePayload: ComposeResponse = {
        ok: true,
        listing_title: researchResult.listing_title,
        listing_description: researchResult.listing_description,
        listing_tags: researchResult.listing_tags,
        listing_category_path: researchResult.listing_category_path,
        listing_title_strategy: researchResult.listing_title_strategy,
        listing_product_story: researchResult.listing_product_story,
        listing_condition_clarity: researchResult.listing_condition_clarity,
        listing_attributes: researchResult.listing_attributes,
        listing_pricing_shipping_notes: researchResult.listing_pricing_shipping_notes,
        listing_quality_checklist: researchResult.listing_quality_checklist,
        quality_score: researchResult.quality_score,
      };
      formData.append("compose", JSON.stringify(composePayload));

      if (etsyWhenMade) formData.append("etsy_when_made", etsyWhenMade);
      if (etsyTaxonomyId) formData.append("etsy_taxonomy_id", String(etsyTaxonomyId));
      if (materialsText.trim()) {
        formData.append(
          "materials",
          JSON.stringify(
            materialsText.split(",").map((m) => m.trim()).filter(Boolean)
          )
        );
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
      router.push(`/inventory?itemId=${data.item_id}&openWorkshop=1`);
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
      case "welcome":
        return "Listing Coach";
      case "input":
        return "Photos and item details";
      case "research":
        return "AI research results";
      case "review":
        return "Review your listing";
      case "save":
        return "Save to inventory";
      default:
        return "Listing Coach";
    }
  }, [step]);

  const stepNumber = useMemo(() => {
    const steps: CoachStep[] = ["input", "research", "review", "save"];
    const idx = steps.indexOf(step);
    return idx >= 0 ? idx + 1 : 0;
  }, [step]);

  return (
    <section className="mx-auto max-w-3xl rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-accent)]">
            Listing Coach{stepNumber > 0 ? ` — Step ${stepNumber} of 4` : ""}
          </p>
          <h1 className="text-2xl font-semibold text-[var(--ui-title)]">{stepTitle}</h1>
          <p className="mt-1 text-sm text-[var(--ui-muted)]">
            Add photos and basic details — AI does the research and writes your listing.
          </p>
        </div>
        <Link
          href="/inventory"
          className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm text-[var(--ui-body)] hover:bg-[var(--ui-neutral-hover)]"
        >
          Exit to Inventory
        </Link>
      </div>

      {error ? <ErrorPanel error={error} onDismiss={() => setError(null)} /> : null}

      {/* STEP 0: Welcome */}
      {step === "welcome" ? (
        <div className="space-y-4">
          {aiConfigured === false ? (
            <div className="rounded-xl border border-[var(--ui-yellow)]/40 bg-[var(--ui-yellow)]/10 px-4 py-3 text-sm text-[var(--ui-body)]">
              Listing Coach needs AI set up first.{" "}
              <Link href="/config" className="font-semibold text-[var(--ui-accent)] underline">
                Open Config
              </Link>
            </div>
          ) : null}
          <ul className="list-disc space-y-2 pl-5 text-sm text-[var(--ui-body)]">
            <li>Add your item photos — turntable shots, markings, and defects.</li>
            <li>Enter basic details: what it is, when you bought it, condition.</li>
            <li>AI researches the item, finds comparable prices, and writes the listing.</li>
            <li>Review, adjust, and save — a video is generated automatically from your photos.</li>
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

      {/* STEP 1: Input — Photos + Basic Details */}
      {step === "input" ? (
        <div className="space-y-6">
          <PhotoPasteZone
            photos={itemPhotos}
            onChange={setItemPhotos}
            maxPhotos={20}
            title="Item photos"
            pasteHint="Click here, then press ⌘V to paste photos (up to 20)"
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

          <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4 space-y-4">
            <p className="text-sm font-semibold text-[var(--ui-title)]">Item details</p>
            <label className="block text-sm text-[var(--ui-body)]">
              What is this item? (brief description)
              <input
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2"
                placeholder='e.g. "Homer Laughlin fiesta ware dinner plate, yellow"'
                spellCheck={true}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm text-[var(--ui-body)]">
                Date purchased
                <input
                  type="date"
                  value={datePurchased}
                  onChange={(e) => setDatePurchased(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2"
                />
              </label>
              <label className="block text-sm text-[var(--ui-body)]">
                Purchase price ($)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={purchasePrice ?? ""}
                  onChange={(e) =>
                    setPurchasePrice(e.target.value === "" ? null : Number(e.target.value))
                  }
                  className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2"
                  placeholder="What you paid"
                />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm text-[var(--ui-body)]">
                Condition
                <select
                  value={conditionCode}
                  onChange={(e) => setConditionCode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2"
                >
                  <option value="Mint/Near Mint">Mint/Near Mint</option>
                  <option value="Excellent">Excellent</option>
                  <option value="Very Good">Very Good</option>
                  <option value="Good">Good</option>
                  <option value="Fair/As-Is">Fair/As-Is</option>
                </select>
              </label>
              <label className="block text-sm text-[var(--ui-body)]">
                Store category
                <input
                  value={storeCategory}
                  onChange={(e) => setStoreCategory(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2"
                  placeholder="e.g. Dinnerware, Figurines"
                  spellCheck={true}
                />
              </label>
            </div>
            <label className="block text-sm text-[var(--ui-body)]">
              Condition notes (optional)
              <textarea
                value={conditionNotes}
                onChange={(e) => setConditionNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2"
                placeholder="Any specific flaws, repairs, or notable characteristics"
                spellCheck={true}
              />
            </label>
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
                  research text here. The AI will use your research as additional context.
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
            <Button variant="secondary" onClick={() => setStep("welcome")}>
              Back
            </Button>
            <Button variant="ghost" onClick={() => setStartOverOpen(true)}>
              Start over
            </Button>
            <Button
              variant="primary"
              disabled={itemPhotos.length === 0}
              busy={busy}
              onClick={() => {
                setStep("research");
                void runResearch();
              }}
            >
              Research and compose listing
            </Button>
          </div>
        </div>
      ) : null}

      {/* STEP 2: Research Results */}
      {step === "research" && busy ? (
        <div className="flex flex-col items-center gap-3 py-12">
          <LoadingSpinner />
          <p className="text-sm text-[var(--ui-muted)]">
            Researching your item with AI and web search...
          </p>
          <p className="text-xs text-[var(--ui-muted)]">
            This may take 30-60 seconds for deep research.
          </p>
        </div>
      ) : null}

      {step === "research" && !busy && researchResult ? (
        <div className="space-y-6">
          {/* Identification */}
          <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--ui-title)]">Identification</p>
              <EvidenceBadge evidence={researchResult.suggested_identification} />
            </div>
            <input
              value={identification}
              onChange={(e) => setIdentification(e.target.value)}
              className={`mt-2 w-full rounded-lg border p-2 text-sm ${
                researchResult.suggested_identification.evidence === "unverified"
                  ? "border-[var(--ui-yellow)]"
                  : "border-[var(--ui-border)]"
              } bg-[var(--ui-card-bg)]`}
            />
            {researchResult.suggested_identification.source_detail ? (
              <p className="mt-1 text-xs text-[var(--ui-muted)]">
                {researchResult.suggested_identification.source_detail}
              </p>
            ) : null}
          </div>

          {/* Photo review */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
              <p className="text-sm font-semibold text-[var(--ui-title)]">Photos present</p>
              <ul className="mt-2 list-disc pl-5 text-sm text-[var(--ui-body)]">
                {researchResult.photo_review.present_shots.length > 0 ? (
                  [...new Set(researchResult.photo_review.present_shots)].map((shot) => (
                    <li key={shot}>{SHOT_LABELS[shot] ?? shot}</li>
                  ))
                ) : (
                  <li>None detected yet</li>
                )}
              </ul>
            </div>
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
              <p className="text-sm font-semibold text-[var(--ui-title)]">Suggested additions</p>
              <ul className="mt-2 list-disc pl-5 text-sm text-[var(--ui-body)]">
                {researchResult.photo_review.missing_shots.length > 0 ? (
                  [...new Set(researchResult.photo_review.missing_shots)].map((shot) => (
                    <li key={shot}>{SHOT_LABELS[shot] ?? shot}</li>
                  ))
                ) : (
                  <li>Looks complete</li>
                )}
              </ul>
            </div>
          </div>

          {researchResult.photo_review.advisories.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--ui-yellow)]">
              {researchResult.photo_review.advisories.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}

          {/* Photo classifications */}
          {photoClassifications.length > 0 ? (
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
              <p className="text-sm font-semibold text-[var(--ui-title)]">Photo classifications</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {photoClassifications.map((pc, idx) => (
                  <div
                    key={pc.photo_index}
                    className="flex items-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm"
                  >
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
                      {[
                        "hero", "angle", "detail", "backstamp", "scale",
                        "imperfection", "underside", "grouping", "lifestyle",
                        "measurement", "extra",
                      ]
                        .filter((t) => t !== pc.type)
                        .map((t) => (
                          <option key={t} value={t}>
                            {SHOT_LABELS[t] ?? t}
                          </option>
                        ))}
                    </select>
                    {pc.confidence < 0.7 ? (
                      <span className="text-xs text-[var(--ui-yellow)]" title="Low confidence">
                        ?
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Price */}
          <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <p className="text-sm font-semibold text-[var(--ui-title)]">Price research</p>
            {researchResult.price.suggested_list_price != null ? (
              <p className="mt-1 text-lg font-bold text-[var(--ui-green)]">
                ${researchResult.price.suggested_list_price.toFixed(2)}
                {researchResult.price.suggested_price_low != null &&
                researchResult.price.suggested_price_high != null
                  ? ` (range $${researchResult.price.suggested_price_low}–$${researchResult.price.suggested_price_high})`
                  : ""}
              </p>
            ) : (
              <p className="mt-1 text-sm text-[var(--ui-body)]">
                Could not determine a confident price.
              </p>
            )}
            {researchResult.price.rationale ? (
              <p className="mt-1 text-xs text-[var(--ui-muted)]">
                {researchResult.price.rationale}
              </p>
            ) : null}
            <label className="mt-3 block text-sm text-[var(--ui-body)]">
              Your list price
              <input
                type="number"
                min="0"
                step="0.01"
                value={saleRevenue ?? ""}
                onChange={(e) =>
                  setSaleRevenue(e.target.value === "" ? null : Number(e.target.value))
                }
                className="mt-1 w-full max-w-xs rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2"
                placeholder="Set your price"
              />
            </label>
          </div>

          {/* Era and materials */}
          <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4 space-y-3">
            <p className="text-sm font-semibold text-[var(--ui-title)]">Era, category and materials</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm text-[var(--ui-body)]">
                When was it made?
                {researchResult.suggested_when_made ? (
                  <EvidenceBadge evidence={researchResult.suggested_when_made} />
                ) : null}
                <select
                  value={etsyWhenMade}
                  onChange={(e) => setEtsyWhenMade(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2"
                >
                  <option value="">Select era...</option>
                  {[
                    "made_to_order", "2020_2026", "2010_2019", "2004_2009", "2000_2003",
                    "1990s", "1980s", "1970s", "1960s", "1950s", "1940s", "1930s",
                    "1920s", "1910s", "1900s", "1800s", "1700s", "before_1700",
                  ].map((era) => (
                    <option key={era} value={era}>
                      {era.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-[var(--ui-body)]">
                Etsy taxonomy ID
                <input
                  type="number"
                  min="1"
                  value={etsyTaxonomyId ?? ""}
                  onChange={(e) =>
                    setEtsyTaxonomyId(e.target.value === "" ? null : Number(e.target.value))
                  }
                  className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2"
                  placeholder="e.g. 1229"
                />
                {researchResult.suggested_taxonomy_path ? (
                  <span className="text-xs text-[var(--ui-muted)]">
                    {researchResult.suggested_taxonomy_path}
                  </span>
                ) : null}
              </label>
            </div>
            <label className="block text-sm text-[var(--ui-body)]">
              Materials (comma-separated)
              {researchResult.suggested_materials?.some((m) => m.evidence === "unverified") ? (
                <span className="ml-2 text-xs text-[var(--ui-yellow)]">Some need verification</span>
              ) : null}
              <input
                value={materialsText}
                onChange={(e) => setMaterialsText(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2"
                placeholder="e.g. ceramic, glaze, gold trim"
              />
            </label>
          </div>

          {/* Citations */}
          {researchResult.citations.length > 0 ? (
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
              <p className="text-sm font-semibold text-[var(--ui-title)]">
                Research citations ({researchResult.citations.length})
              </p>
              <ul className="mt-2 space-y-1">
                {researchResult.citations.map((c, i) => (
                  <li key={i} className="text-xs text-[var(--ui-body)]">
                    <span className="font-medium">{c.claim}</span>
                    <span className="text-[var(--ui-muted)]"> — {c.source}</span>
                    {c.url ? (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1 text-[var(--ui-accent)] underline"
                      >
                        link
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Compliance check */}
          {researchResult.compliance_check.issues.length > 0 ? (
            <div className="rounded-xl border border-[var(--ui-red)]/40 bg-[var(--ui-red)]/10 px-4 py-3">
              <p className="text-sm font-semibold text-[var(--ui-red)]">Compliance issues</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-[var(--ui-body)]">
                {researchResult.compliance_check.issues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setResearchResult(null);
                setStep("input");
              }}
            >
              Back to edit
            </Button>
            <Button variant="ghost" onClick={() => setStartOverOpen(true)}>
              Start over
            </Button>
            <Button variant="primary" onClick={() => setStep("review")}>
              Review listing
            </Button>
          </div>
        </div>
      ) : null}

      {/* STEP 3: Review */}
      {step === "review" && researchResult ? (
        <div className="space-y-6">
          <ListingPreview
            compose={{
              ok: true,
              listing_title: researchResult.listing_title,
              listing_description: researchResult.listing_description,
              listing_tags: researchResult.listing_tags,
              listing_category_path: researchResult.listing_category_path,
              listing_title_strategy: researchResult.listing_title_strategy,
              listing_product_story: researchResult.listing_product_story,
              listing_condition_clarity: researchResult.listing_condition_clarity,
              listing_attributes: researchResult.listing_attributes,
              listing_pricing_shipping_notes: researchResult.listing_pricing_shipping_notes,
              listing_quality_checklist: researchResult.listing_quality_checklist,
              quality_score: researchResult.quality_score,
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setStep("research")}>
              Back to research
            </Button>
            <Button variant="ghost" onClick={() => setStartOverOpen(true)}>
              Start over
            </Button>
            <Button variant="primary" onClick={() => setStep("save")}>
              Save to inventory
            </Button>
          </div>
        </div>
      ) : null}

      {/* STEP 4: Save */}
      {step === "save" && researchResult ? (
        <div className="space-y-4">
          <label className="block text-sm text-[var(--ui-body)]">
            Item number <span className="text-[var(--ui-red)]">*</span>
            <input
              value={itemNumber}
              onChange={(e) => setItemNumber(e.target.value)}
              className="mt-1 w-full max-w-md rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2"
              placeholder="e.g. TCT-2026-042"
            />
          </label>
          <label className="block text-sm text-[var(--ui-body)]">
            Internal description <span className="text-[var(--ui-red)]">*</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2"
            />
          </label>
          <label className="block text-sm text-[var(--ui-body)]">
            Condition
            <select
              value={conditionCode}
              onChange={(e) => setConditionCode(e.target.value)}
              className="mt-1 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2"
            >
              <option value="Mint/Near Mint">Mint/Near Mint</option>
              <option value="Excellent">Excellent</option>
              <option value="Very Good">Very Good</option>
              <option value="Good">Good</option>
              <option value="Fair/As-Is">Fair/As-Is</option>
            </select>
          </label>
          <label className="block text-sm text-[var(--ui-body)]">
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "In stock" | "Draft")}
              className="mt-1 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2"
            >
              <option value="In stock">In stock</option>
              <option value="Draft">Draft</option>
            </select>
          </label>

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

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setStep("review")}>
              Back
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
        onConfirm={() => {
          resetSession();
          setStartOverOpen(false);
        }}
        title="Start over?"
        description="This clears all photos, answers, and the composed listing from this session."
        confirmLabel="Start over"
        confirmVariant="danger"
      />
    </section>
  );
}
