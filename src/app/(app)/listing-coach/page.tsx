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
  revokeCoachPhotos,
  SHOT_LABELS,
  type AnalyzeResponse,
  type CoachPhoto,
  type CoachStep,
  type ComposeResponse,
  type ConfirmAnswer,
} from "@/components/listing-coach/types";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useToast } from "@/hooks/useToast";
import type { AiConfig, ApiErrorShape } from "@/types";

type UiError = {
  title: string;
  message: string;
  actions: string[];
};

function parseApiError(data: ApiErrorShape, fallback: string): UiError {
  return {
    title: fallback,
    message: data.error?.user_message ?? data.error?.message ?? fallback,
    actions: data.error?.actions ?? [],
  };
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
    setError(null);
  }, [itemPhotos, conditionPhotos, googlePhotos]);

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
      setStep("analyze");
    } catch {
      setError({
        title: "Photo analysis failed",
        message: "We could not reach the server.",
        actions: ["Check your connection and retry."],
      });
      setStep("photos");
    } finally {
      setBusy(false);
    }
  };

  const runCompose = async () => {
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
      setError({
        title: "Listing compose failed",
        message: "We could not reach the server.",
        actions: ["Check your connection and retry."],
      });
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
      setError({
        title: "Save failed",
        message: "We could not reach the server.",
        actions: ["Check your connection and retry."],
      });
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
        return "Photo review";
      case "price":
        return "Confirm price";
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
    <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm">
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
        <div className="mb-4">
          <ErrorPanel
            error={{ title: error.title, message: error.message, actions: error.actions }}
            onDismiss={() => setError(null)}
          />
        </div>
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
            maxPhotos={10}
            title="Item photos"
            pasteHint="Click here, then press ⌘V to paste photos from Photos"
          />
          <PhotoPasteZone
            photos={conditionPhotos}
            onChange={setConditionPhotos}
            maxPhotos={5}
            title="Condition photos (optional)"
            pasteHint="Paste condition or flaw photos here (optional)"
          />
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

          {analyzeResult.photo_review.advisories.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--ui-yellow)]">
              {analyzeResult.photo_review.advisories.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}

          {!skippedGoogle && analyzeResult.price.rationale ? (
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
          {analyzeResult.price.confidence !== "low" && suggestedPriceValue(analyzeResult.price) != null ? (
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
            <Button variant="primary" onClick={() => setStep("confirm")}>
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
            <Button variant="secondary" onClick={() => setStep("price")}>
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
            Internal description
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
