"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmCard } from "@/components/listing-coach/ConfirmCard";
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
  type AnalyzeResponse,
  type CoachPhoto,
  type CoachStep,
  type ComposeResponse,
  type ConfirmAnswer,
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

function suggestedPriceValue(price: AnalyzeResponse["price"]): number | null {
  if (price.suggested_list_price != null) return price.suggested_list_price;
  if (price.suggested_price_low != null && price.suggested_price_high != null) {
    return Math.round((price.suggested_price_low + price.suggested_price_high) / 2);
  }
  return null;
}

export default function ListingCoachPage() {
  const router = useRouter();
  const toast = useToast();

  const [step, setStep] = useState<CoachStep>("welcome");
  const [itemPhotos, setItemPhotos] = useState<CoachPhoto[]>([]);
  const [conditionPhotos, setConditionPhotos] = useState<CoachPhoto[]>([]);
  const [googlePhotos, setGooglePhotos] = useState<CoachPhoto[]>([]);
  const [skippedGoogle, setSkippedGoogle] = useState(false);

  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResponse | null>(null);
  const [identification, setIdentification] = useState("");
  const [conditionCode, setConditionCode] = useState("Good");
  const [saleRevenue, setSaleRevenue] = useState<number | null>(null);
  const [acceptOfferNote, setAcceptOfferNote] = useState("");
  const [confirmAnswers, setConfirmAnswers] = useState<Record<string, string>>({});
  const [composeResult, setComposeResult] = useState<ComposeResponse | null>(null);

  const [itemNumber, setItemNumber] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"In stock" | "Draft">("In stock");

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

  const [videoFile, setVideoFile] = useState<File | null>(null);

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
    if (step !== "photos") return;
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
          if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) continue;
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
    setSkippedGoogle(false);
    setAnalyzeResult(null);
    setIdentification("");
    setConditionCode("Good");
    setSaleRevenue(null);
    setAcceptOfferNote("");
    setConfirmAnswers({});
    setComposeResult(null);
    setItemNumber("");
    setDescription("");
    setStatus("In stock");
    setEtsyWhenMade("");
    setEtsyTaxonomyId(null);
    setMaterialsText("");
    setItemWeight(null);
    setItemWeightUnit("oz");
    setItemLength(null);
    setItemWidth(null);
    setItemHeight(null);
    setItemDimensionsUnit("in");
    setVideoFile(null);
    setPhotoClassifications([]);
    setError(null);
  }, [itemPhotos, conditionPhotos, googlePhotos]);

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) return;
    setVideoFile(file);
  };

  const runAnalyze = async () => {
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      appendCoachPhotos(formData, itemPhotos, conditionPhotos, googlePhotos);
      const response = await fetch("/api/listing-coach/analyze", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => ({}))) as AnalyzeResponse & ApiErrorShape;
      if (!response.ok || !data.ok) {
        setError(parseApiError(data, "Photo analysis failed"));
        setStep("photos");
        return;
      }
      setAnalyzeResult(data);
      setIdentification(data.suggested_identification);
      setConditionCode(data.suggested_condition_code);
      const suggested = suggestedPriceValue(data.price);
      if (suggested != null && data.price.confidence !== "low") {
        setSaleRevenue(suggested);
      }
      const seeds: Record<string, string> = {};
      for (const card of data.confirm_cards) {
        seeds[card.id] = card.suggested_answer;
      }
      setConfirmAnswers(seeds);

      if (data.suggested_when_made) setEtsyWhenMade(data.suggested_when_made);
      if (data.suggested_taxonomy_id) setEtsyTaxonomyId(data.suggested_taxonomy_id);
      if (data.suggested_materials?.length) {
        setMaterialsText(data.suggested_materials.join(", "));
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
      setStep("analyze");
    } catch {
      setError(
        createUiError({
          title: "Photo analysis failed",
          message: "We could not reach the server.",
          actions: ["Check your connection and retry."],
        })
      );
      setStep("photos");
    } finally {
      setBusy(false);
    }
  };

  const runCompose = async () => {
    setStep("compose");
    setComposeResult(null);
    setBusy(true);
    setError(null);
    try {
      const answers: ConfirmAnswer[] = (analyzeResult?.confirm_cards ?? []).map((card) => ({
        id: card.id,
        answer: confirmAnswers[card.id]?.trim() || card.suggested_answer,
      }));

      const formData = new FormData();
      appendCoachPhotos(formData, itemPhotos, conditionPhotos, googlePhotos);
      formData.append("confirm_answers", JSON.stringify(answers));
      formData.append(
        "price",
        JSON.stringify({
          sale_revenue: saleRevenue,
          accept_offer_note: acceptOfferNote.trim() || undefined,
        })
      );
      if (identification.trim()) {
        formData.append("identification_override", identification.trim());
      }
      formData.append("suggested_condition_code", conditionCode);

      if (etsyWhenMade) formData.append("when_made", etsyWhenMade);
      if (etsyTaxonomyId) formData.append("taxonomy_id", String(etsyTaxonomyId));
      if (materialsText.trim()) {
        formData.append(
          "materials",
          JSON.stringify(
            materialsText
              .split(",")
              .map((m) => m.trim())
              .filter(Boolean)
          )
        );
      }
      if (itemWeight != null) {
        formData.append("item_weight", String(itemWeight));
        formData.append("item_weight_unit", itemWeightUnit);
      }
      if (itemLength != null || itemWidth != null || itemHeight != null) {
        formData.append(
          "dimensions",
          JSON.stringify({
            length: itemLength,
            width: itemWidth,
            height: itemHeight,
            unit: itemDimensionsUnit,
          })
        );
      }

      const response = await fetch("/api/listing-coach/compose", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => ({}))) as ComposeResponse & ApiErrorShape;
      if (!response.ok || !data.ok) {
        setError(parseApiError(data, "Listing compose failed"));
        setStep("confirm");
        return;
      }
      setComposeResult(data);
      if (!description.trim()) {
        setDescription(identification.trim() || data.listing_title.slice(0, 200));
      }
      setStep("compose");
    } catch {
      setError(
        createUiError({
          title: "Listing compose failed",
          message: "We could not reach the server.",
          actions: ["Check your connection and retry."],
        })
      );
      setStep("confirm");
    } finally {
      setBusy(false);
    }
  };

  const runComplete = async () => {
    if (!composeResult || !itemNumber.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      appendCoachPhotos(formData, itemPhotos, conditionPhotos, googlePhotos);
      formData.append("item_number", itemNumber.trim());
      formData.append("description", description.trim());
      formData.append("status", status);
      formData.append("condition_code", conditionCode);
      if (saleRevenue != null) {
        formData.append("sale_revenue", String(saleRevenue));
      }
      if (analyzeResult?.price.confidence) {
        formData.append("price_confidence", analyzeResult.price.confidence);
      }
      formData.append("compose", JSON.stringify(composeResult));

      if (etsyWhenMade) formData.append("etsy_when_made", etsyWhenMade);
      if (etsyTaxonomyId) formData.append("etsy_taxonomy_id", String(etsyTaxonomyId));
      if (materialsText.trim()) {
        formData.append(
          "materials",
          JSON.stringify(
            materialsText
              .split(",")
              .map((m) => m.trim())
              .filter(Boolean)
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
      case "photos":
        return "Item photos";
      case "google":
        return "Google Visual Search";
      case "analyze":
        return "What we found";
      case "price":
        return "Confirm price";
      case "era_category":
        return "Era, category & materials";
      case "confirm":
        return "Quick confirms";
      case "compose":
        return "Your listing";
      case "save":
        return "Save to inventory";
      default:
        return "Listing Coach";
    }
  }, [step]);

  return (
    <section className="mx-auto max-w-3xl rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-accent)]">
            Listing Coach
          </p>
          <h1 className="text-2xl font-semibold text-[var(--ui-title)]">{stepTitle}</h1>
          <p className="mt-1 text-sm text-[var(--ui-muted)]">
            Paste photos, optional Google results, confirm a few answers — we write the listing.
          </p>
        </div>
        <Link
          href="/inventory"
          className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm text-[var(--ui-body)] hover:bg-[var(--ui-neutral-hover)]"
        >
          Exit to Inventory
        </Link>
      </div>

      {error ? (
        <ErrorPanel error={error} onDismiss={() => setError(null)} />
      ) : null}

      {step === "welcome" ? (
        <div className="space-y-4">
          {aiConfigured === false ? (
            <div className="rounded-xl border border-[var(--ui-yellow)]/40 bg-[var(--ui-yellow)]/10 px-4 py-3 text-sm text-[var(--ui-body)]">
              Listing Coach needs AI set up first.{" "}
              <Link href="/config" className="font-semibold text-[var(--ui-accent)] underline">
                Open Config → AI settings
              </Link>
            </div>
          ) : null}
          <ul className="list-disc space-y-2 pl-5 text-sm text-[var(--ui-body)]">
            <li>Paste item photos from the Mac Photos app (⌘C / ⌘V).</li>
            <li>Optionally paste Google Visual Search screenshots for pricing help.</li>
            <li>Confirm a few short answers — mostly “Yes, use this.”</li>
          </ul>
          <Button
            variant="primary"
            size="lg"
            disabled={aiConfigured === false}
            onClick={() => setStep("photos")}
          >
            Start
          </Button>
        </div>
      ) : null}

      {step === "photos" ? (
        <div className="space-y-6">
          <PhotoPasteZone
            photos={itemPhotos}
            onChange={setItemPhotos}
            maxPhotos={20}
            title="Item photos"
            pasteHint="Click here, then press ⌘V to paste photos from Photos (up to 20)"
            slotGuidance={ITEM_PHOTO_GUIDANCE}
          />
          <PhotoPasteZone
            photos={conditionPhotos}
            onChange={setConditionPhotos}
            maxPhotos={5}
            title="Condition photos (optional)"
            pasteHint="Paste condition or flaw photos here (optional)"
            emptyHint="Close-ups of any crazing, chips, scratches, repairs, or wear. Honest documentation builds buyer trust and reduces returns. Up to 5 images."
          />
          <div className="rounded-xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <p className="text-sm font-semibold text-[var(--ui-title)]">Video (optional)</p>
            <p className="text-xs text-[var(--ui-muted)]">MP4 or MOV · max 100 MB · 5–15 seconds</p>
            <p className="mt-1 text-xs text-[var(--ui-body)]">
              Slowly rotate the item or pan the camera side-to-side. Keep the background neutral and the lighting soft. Silent is fine — Etsy prioritizes listings with video in search results.
            </p>
            {videoFile ? (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-sm text-[var(--ui-body)]">{videoFile.name}</span>
                <Button variant="ghost" size="sm" onClick={() => setVideoFile(null)}>Remove</Button>
              </div>
            ) : (
              <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm text-[var(--ui-body)] hover:bg-[var(--ui-neutral)]">
                Choose video
                <input type="file" accept="video/mp4,video/quicktime" className="hidden" onChange={handleVideoSelect} />
              </label>
            )}
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
              onClick={() => setStep("google")}
            >
              Continue
            </Button>
          </div>
        </div>
      ) : null}

      {step === "google" ? (
        <div className="space-y-6">
          <GoogleResultsPasteZone photos={googlePhotos} onChange={setGooglePhotos} />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setStep("photos")}>
              Back
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setSkippedGoogle(true);
                setStep("analyze");
                void runAnalyze();
              }}
              busy={busy}
            >
              Skip — I didn&apos;t use Google
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setSkippedGoogle(false);
                setStep("analyze");
                void runAnalyze();
              }}
              busy={busy}
            >
              Continue
            </Button>
          </div>
        </div>
      ) : null}

      {step === "analyze" && busy ? (
        <div className="flex flex-col items-center gap-3 py-12">
          <LoadingSpinner />
          <p className="text-sm text-[var(--ui-muted)]">Analyzing photos with AI…</p>
        </div>
      ) : null}

      {step === "analyze" && !busy && analyzeResult ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <p className="text-sm font-semibold text-[var(--ui-title)]">Suggested identification</p>
            <input
              value={identification}
              onChange={(e) => setIdentification(e.target.value)}
              className="mt-2 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
              <p className="text-sm font-semibold text-[var(--ui-title)]">Photos present</p>
              <ul className="mt-2 list-disc pl-5 text-sm text-[var(--ui-body)]">
                {analyzeResult.photo_review.present_shots.length > 0 ? (
                  analyzeResult.photo_review.present_shots.map((shot) => (
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
                {analyzeResult.photo_review.missing_shots.length > 0 ? (
                  analyzeResult.photo_review.missing_shots.map((shot) => (
                    <li key={shot}>{SHOT_LABELS[shot] ?? shot}</li>
                  ))
                ) : (
                  <li>Looks complete</li>
                )}
              </ul>
            </div>
          </div>

          {photoClassifications.length > 0 ? (
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
              <p className="text-sm font-semibold text-[var(--ui-title)]">Photo classifications</p>
              <p className="mb-3 text-xs text-[var(--ui-muted)]">
                AI-assigned shot types. Override any with the dropdown if needed.
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
                      <option value={pc.type}>OK as classified</option>
                      {[
                        "hero",
                        "angle",
                        "detail",
                        "backstamp",
                        "scale",
                        "imperfection",
                        "underside",
                        "grouping",
                        "lifestyle",
                        "measurement",
                        "extra",
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

          {analyzeResult.photo_review.advisories.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--ui-yellow)]">
              {analyzeResult.photo_review.advisories.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}

          {analyzeResult.price.confidence !== "low" &&
          suggestedPriceValue(analyzeResult.price) != null ? (
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
              <p className="text-sm font-semibold text-[var(--ui-title)]">Suggested price</p>
              <p className="mt-1 text-lg font-bold text-[var(--ui-green)]">
                ${suggestedPriceValue(analyzeResult.price)?.toFixed(2)}
                {analyzeResult.price.suggested_price_low != null &&
                analyzeResult.price.suggested_price_high != null
                  ? ` (range $${analyzeResult.price.suggested_price_low}–$${analyzeResult.price.suggested_price_high})`
                  : ""}
              </p>
              {analyzeResult.price.rationale ? (
                <p className="mt-1 text-xs text-[var(--ui-muted)]">
                  {analyzeResult.price.rationale}
                </p>
              ) : null}
            </div>
          ) : analyzeResult.price.rationale ? (
            <p className="text-sm text-[var(--ui-body)]">{analyzeResult.price.rationale}</p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setAnalyzeResult(null);
                setComposeResult(null);
                setStep("photos");
              }}
            >
              Back
            </Button>
            <Button variant="primary" onClick={() => setStep("price")}>
              Looks right — continue
            </Button>
          </div>
        </div>
      ) : null}

      {step === "price" && analyzeResult ? (
        <div className="space-y-4">
          {analyzeResult.price.confidence !== "low" &&
          suggestedPriceValue(analyzeResult.price) != null ? (
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
              <p className="text-sm text-[var(--ui-body)]">
                Suggested list price:{" "}
                <strong>${suggestedPriceValue(analyzeResult.price)?.toFixed(2)}</strong>
                {analyzeResult.price.suggested_price_low != null &&
                analyzeResult.price.suggested_price_high != null
                  ? ` (range $${analyzeResult.price.suggested_price_low}–$${analyzeResult.price.suggested_price_high})`
                  : ""}
              </p>
              <Button
                variant="primary"
                size="sm"
                className="mt-3"
                onClick={() => setSaleRevenue(suggestedPriceValue(analyzeResult.price))}
              >
                Use suggested price
              </Button>
            </div>
          ) : (
            <p className="text-sm text-[var(--ui-body)]">
              We couldn&apos;t price this confidently — what would you usually list it for?
            </p>
          )}

          <label className="block text-sm text-[var(--ui-body)]">
            List price
            <input
              type="number"
              min="0"
              step="0.01"
              value={saleRevenue ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                setSaleRevenue(val === "" ? null : Number(val));
              }}
              className="mt-1 w-full max-w-xs rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2"
              placeholder="Optional"
            />
          </label>

          <label className="block text-sm text-[var(--ui-body)]">
            Accept-offer note (optional)
            <input
              value={acceptOfferNote}
              onChange={(e) => setAcceptOfferNote(e.target.value)}
              placeholder="e.g. Accept offers $72–$78"
              className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setStep("analyze")}>
              Back
            </Button>
            <Button variant="secondary" onClick={() => setSaleRevenue(null)}>
              Skip for now
            </Button>
            <Button variant="primary" onClick={() => setStep("era_category")}>
              Continue
            </Button>
          </div>
        </div>
      ) : null}

      {step === "era_category" ? (
        <div className="space-y-4">
          <p className="text-sm text-[var(--ui-body)]">
            These Etsy-required fields help buyers find your item. Confirm or adjust.
          </p>
          <label className="block text-sm text-[var(--ui-body)]">
            When was it made? <span className="text-[var(--ui-red)]">*</span>
            <select
              value={etsyWhenMade}
              onChange={(e) => setEtsyWhenMade(e.target.value)}
              className="mt-1 w-full max-w-xs rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2"
            >
              <option value="">Select era…</option>
              <option value="made_to_order">Made to order</option>
              <option value="2020_2026">2020–2026</option>
              <option value="2010_2019">2010–2019</option>
              <option value="2004_2009">2004–2009</option>
              <option value="2000_2003">2000–2003</option>
              <option value="1990s">1990s</option>
              <option value="1980s">1980s</option>
              <option value="1970s">1970s</option>
              <option value="1960s">1960s</option>
              <option value="1950s">1950s</option>
              <option value="1940s">1940s</option>
              <option value="1930s">1930s</option>
              <option value="1920s">1920s</option>
              <option value="1910s">1910s</option>
              <option value="1900s">1900s</option>
              <option value="1800s">1800s</option>
              <option value="1700s">1700s</option>
              <option value="before_1700">Before 1700</option>
            </select>
          </label>
          <label className="block text-sm text-[var(--ui-body)]">
            Etsy category/taxonomy ID <span className="text-[var(--ui-red)]">*</span>
            <input
              type="number"
              min="1"
              value={etsyTaxonomyId ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                setEtsyTaxonomyId(val === "" ? null : Number(val));
              }}
              className="mt-1 w-full max-w-xs rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2"
              placeholder="e.g. 1229"
            />
          </label>
          <label className="block text-sm text-[var(--ui-body)]">
            Materials (comma-separated)
            <input
              value={materialsText}
              onChange={(e) => setMaterialsText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2"
              placeholder="e.g. ceramic, glaze, gold trim"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm text-[var(--ui-body)]">
              Weight
              <div className="mt-1 flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={itemWeight ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setItemWeight(val === "" ? null : Number(val));
                  }}
                  className="w-24 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2"
                  placeholder="0.0"
                />
                <select
                  value={itemWeightUnit}
                  onChange={(e) => setItemWeightUnit(e.target.value)}
                  className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2"
                >
                  <option value="oz">oz</option>
                  <option value="lb">lb</option>
                  <option value="g">g</option>
                  <option value="kg">kg</option>
                </select>
              </div>
            </label>
            <label className="block text-sm text-[var(--ui-body)]">
              Dimensions (L × W × H)
              <div className="mt-1 flex flex-wrap gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={itemLength ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setItemLength(val === "" ? null : Number(val));
                  }}
                  className="w-16 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2"
                  placeholder="L"
                />
                <span className="self-center text-[var(--ui-muted)]">×</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={itemWidth ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setItemWidth(val === "" ? null : Number(val));
                  }}
                  className="w-16 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2"
                  placeholder="W"
                />
                <span className="self-center text-[var(--ui-muted)]">×</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={itemHeight ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setItemHeight(val === "" ? null : Number(val));
                  }}
                  className="w-16 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2"
                  placeholder="H"
                />
                <select
                  value={itemDimensionsUnit}
                  onChange={(e) => setItemDimensionsUnit(e.target.value)}
                  className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2"
                >
                  <option value="in">in</option>
                  <option value="ft">ft</option>
                  <option value="mm">mm</option>
                  <option value="cm">cm</option>
                  <option value="m">m</option>
                </select>
              </div>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setStep("price")}>
              Back
            </Button>
            <Button variant="primary" disabled={!etsyWhenMade} onClick={() => setStep("confirm")}>
              Continue
            </Button>
          </div>
        </div>
      ) : null}

      {step === "confirm" && analyzeResult ? (
        <div className="space-y-4">
          {analyzeResult.confirm_cards.map((card) => (
            <ConfirmCard
              key={card.id}
              question={card.question}
              suggestedAnswer={card.suggested_answer}
              optional={card.optional}
              answer={confirmAnswers[card.id] ?? ""}
              onAnswerChange={(answer) =>
                setConfirmAnswers((current) => ({ ...current, [card.id]: answer }))
              }
            />
          ))}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setStep("era_category")}>
              Back
            </Button>
            <Button variant="primary" busy={busy} onClick={() => void runCompose()}>
              Compose listing
            </Button>
          </div>
        </div>
      ) : null}

      {step === "compose" && busy ? (
        <div className="flex flex-col items-center gap-3 py-12">
          <LoadingSpinner />
          <p className="text-sm text-[var(--ui-muted)]">Writing your listing…</p>
        </div>
      ) : null}

      {step === "compose" && !busy && !composeResult && error ? (
        <div className="space-y-4">
          <p className="text-sm text-[var(--ui-body)]">
            AI compose failed. You can retry or switch to manual entry in the Inventory workshop.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setStep("confirm")}>
              Back to edit answers
            </Button>
            <Button variant="primary" busy={busy} onClick={() => void runCompose()}>
              Retry compose
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const fallbackCompose: ComposeResponse = {
                  ok: true,
                  listing_title: identification || "Untitled item",
                  listing_description: "",
                  listing_tags: "",
                  listing_category_path: "",
                  listing_title_strategy: "",
                  listing_product_story: "",
                  listing_condition_clarity: "",
                  listing_attributes: "",
                  listing_pricing_shipping_notes: acceptOfferNote || "",
                  listing_quality_checklist: "",
                  quality_score: { score: 0, hints: ["Complete the listing in the Inventory workshop."] },
                };
                setComposeResult(fallbackCompose);
                setError(null);
                if (!description.trim()) {
                  setDescription(identification.trim() || "New item");
                }
              }}
            >
              Skip — I&apos;ll write it manually
            </Button>
          </div>
        </div>
      ) : null}

      {step === "compose" && !busy && composeResult ? (
        <div className="space-y-6">
          <ListingPreview compose={composeResult} />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setStep("confirm")}>
              Back to edit answers
            </Button>
            <Button variant="secondary" onClick={() => setStartOverOpen(true)}>
              Start over
            </Button>
            <Button variant="primary" onClick={() => setStep("save")}>
              Save to inventory
            </Button>
          </div>
        </div>
      ) : null}

      {step === "save" && composeResult ? (
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
            Condition <span className="text-[var(--ui-red)]">*</span>
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
          {conditionCode === "Good" && analyzeResult?.price.confidence === "low" ? (
            <p className="text-xs text-[var(--ui-yellow)]">
              Condition defaulted to Good — confirm this matches the item before saving.
            </p>
          ) : null}
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
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setStep("compose")}>
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
