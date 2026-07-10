"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { PHOTO_AI_PENDING_REF } from "@/lib/listing-rubric";

type RemediationItem = {
  category?: string;
  ref?: string;
  shortcoming: string;
  mitigation?: string;
  weight?: number;
  resolution_link?: string;
};

type PassResult = {
  previous_score: number;
  new_score: number;
  delta: number;
  applied_fields: string[];
};

type CycleResult = {
  ok: boolean;
  mode?: "single" | "auto";
  tier: "standard" | "premium";
  no_ai_action?: boolean;
  message?: string;
  model_used: string | null;
  premium_configured: boolean;
  photo_ai_evaluated?: boolean;
  previous_score: number;
  new_score: number;
  delta: number;
  improved?: boolean;
  passed: boolean;
  listing_phase?: string;
  passes?: PassResult[];
  remediation: RemediationItem[];
  user_action_items: RemediationItem[];
  picture_items?: RemediationItem[];
  applied_fields: string[];
};

type Props = {
  itemId: number;
  onApplied?: () => Promise<void> | void;
  onError: (title: string, message: string, err?: unknown) => void;
};

/**
 * Map from rubric ref → listing-refine field name.
 * sale_revenue has no refine field — omit its button (ticket WS-CR15).
 */
const REF_TO_FIELD: Record<string, string> = {
  listing_title: "listing_title",
  listing_description: "listing_description",
  listing_tags: "listing_tags",
};

/**
 * Inline per-row Fix button for AI-fixable remediation items (WS-CR15).
 * Mirrors the FieldFixButton pattern in InventoryDetailPanel.tsx.
 */
function RowFixButton({
  itemId,
  fieldName,
  onFixed,
}: {
  itemId: number;
  fieldName: string;
  onFixed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!instruction.trim()) return;
    setBusy(true);
    try {
      const resp = await fetch(`/api/inventory/${itemId}/listing-refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "field",
          field_name: fieldName,
          instruction: instruction.trim(),
        }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        fields?: Record<string, string>;
      };
      if (data.ok && data.fields?.[fieldName]) {
        onFixed();
        setOpen(false);
        setInstruction("");
      }
    } catch {
      /* silent — field stays unchanged */
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 text-xs font-medium text-[var(--ui-accent)] hover:underline"
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
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
          if (e.key === "Escape") {
            setOpen(false);
            setInstruction("");
          }
        }}
        className="flex-1 rounded border border-[var(--ui-accent)]/40 bg-[var(--ui-card-bg)] px-2 py-1 text-xs text-[var(--ui-body)] focus:outline-none"
        placeholder="What should the AI change?"
        autoFocus
        spellCheck
      />
      <Button
        variant="accent"
        size="sm"
        onClick={() => void submit()}
        busy={busy}
        disabled={!instruction.trim()}
      >
        Go
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setOpen(false);
          setInstruction("");
        }}
        disabled={busy}
      >
        Cancel
      </Button>
    </div>
  );
}

/**
 * Remediation cycle panel (ADR-089): one-pass AI listing improvement loop.
 * The user watches each pass and picks: Stop / Cycle again / Advance AI.
 */
export function RemediationCyclePanel({ itemId, onApplied, onError }: Props) {
  const [result, setResult] = useState<CycleResult | null>(null);
  const [busy, setBusy] = useState(false);
  // Show a hint when premium was requested but not configured.
  const [showPremiumHint, setShowPremiumHint] = useState(false);

  const runCycle = useCallback(
    async (tier: "standard" | "premium", mode: "single" | "auto" = "single") => {
      setBusy(true);
      setShowPremiumHint(false);
      try {
        const res = await fetch(`/api/inventory/${itemId}/listing-remediation-cycle`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ tier, mode }),
        });
        const data = (await res.json().catch(() => ({}))) as CycleResult & {
          error?: { code?: string; message?: string; user_message?: string };
        };
        if (!res.ok || !data.ok) {
          onError(
            "Remediation cycle",
            data.error?.user_message ?? "We could not run the remediation cycle.",
            data
          );
          return;
        }
        setResult(data);
        if (tier === "premium" && !data.premium_configured) {
          setShowPremiumHint(true);
        }
        await onApplied?.();
      } catch (err) {
        onError("Remediation cycle", "We could not run the remediation cycle.", err);
      } finally {
        setBusy(false);
      }
    },
    [itemId, onApplied, onError]
  );

  const handleStop = () => {
    setResult(null);
    setShowPremiumHint(false);
  };

  // Not yet started — show the entry buttons only.
  if (!result) {
    return (
      <div className="mb-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--ui-title)]">AI listing repair</p>
            <p className="text-xs text-[var(--ui-muted)]">
              Fix everything the rubric can — title, description, tags, price, era, category,
              materials, and dimensions — in one run. Photo issues are left for you to reshoot.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void runCycle("standard", "single")}
              busy={busy}
              title="Run a single pass you can review"
            >
              Single pass
            </Button>
            <Button
              variant="accent"
              size="sm"
              onClick={() => void runCycle("standard", "auto")}
              busy={busy}
              title="Keep fixing non-photo issues until nothing is left to fix"
            >
              Repair everything (except photos)
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Determine the delta sign for display.
  const deltaSign = result.delta > 0 ? "+" : "";
  const deltaColor =
    result.delta > 0
      ? "text-[var(--ui-green)]"
      : result.delta < 0
        ? "text-[var(--ui-red)]"
        : "text-[var(--ui-muted)]";

  // Non-picture items still open (the engine already fixed what it could). Some map
  // to a refine field so we offer an inline Fix button; the rest are user decisions.
  const attentionItems = result.user_action_items.filter((r) => r.ref !== PHOTO_AI_PENDING_REF);
  // Photo issues the user must reshoot — never auto-fixable.
  const photoItems = (result.picture_items ?? result.remediation).filter(
    (r) => r.ref !== PHOTO_AI_PENDING_REF && (r.ref === "pictures" || r.ref === "condition_pictures" || /^picture_\d+$/.test(r.ref ?? ""))
  );

  return (
    <div className="mb-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
      {/* Score header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <span className="text-xs uppercase tracking-wide text-[var(--ui-muted)]">Score</span>
            <span
              className={`ml-2 text-sm font-semibold ${
                result.passed ? "text-[var(--ui-green)]" : "text-[var(--ui-yellow)]"
              }`}
            >
              {result.new_score}
            </span>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wide text-[var(--ui-muted)]">Change</span>
            <span className={`ml-2 text-sm font-semibold ${deltaColor}`}>
              {deltaSign}
              {result.delta}
            </span>
          </div>
          <div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                result.passed
                  ? "bg-[var(--ui-green)]/20 text-[var(--ui-green)]"
                  : "bg-[var(--ui-yellow)]/20 text-[var(--ui-yellow)]"
              }`}
            >
              {result.passed ? "Gate passed" : "Below gate"}
            </span>
          </div>
        </div>
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleStop} disabled={busy}>
            Done
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void runCycle("standard", "auto")}
            busy={busy}
            title="Run the full non-photo repair loop again"
          >
            Repair again
          </Button>
          <Button
            variant="accent"
            size="sm"
            onClick={() => void runCycle("premium", "auto")}
            busy={busy}
            title="Re-run using the premium AI model (if configured)"
          >
            Advance AI
          </Button>
        </div>
      </div>

      {/* Pass trace (auto mode) */}
      {result.passes && result.passes.length > 1 ? (
        <p className="mt-2 text-xs text-[var(--ui-muted)]">
          {result.passes.length} passes:{" "}
          {result.passes
            .map((p) => `${p.previous_score}→${p.new_score}`)
            .join(", ")}
        </p>
      ) : null}
      {result.photo_ai_evaluated === false ? (
        <p className="mt-1 text-xs text-[var(--ui-yellow)]">
          Per-photo AI review didn&apos;t run this time — the photo sub-score is provisional.
        </p>
      ) : null}

      {/* no_ai_action message */}
      {result.no_ai_action ? (
        <p className="mt-3 rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-xs text-[var(--ui-body)]">
          {result.message ??
            "Nothing left for the AI to fix this pass. Add the required photos / data listed, then re-evaluate."}
        </p>
      ) : null}

      {/* Premium hint */}
      {showPremiumHint ? (
        <p className="mt-2 text-xs text-[var(--ui-muted)]">
          No premium model is configured — this pass ran at the standard model.{" "}
          <span className="text-[var(--ui-body)]">
            Set one in Settings → AI settings → Premium model.
          </span>
        </p>
      ) : null}

      {/* Model used */}
      {result.model_used ? (
        <p className="mt-1.5 text-xs text-[var(--ui-muted)]">
          Model:{" "}
          <span className="font-medium text-[var(--ui-body)]">{result.model_used}</span>
          {result.applied_fields.length > 0 ? (
            <span className="ml-2">
              · Applied:{" "}
              <span className="font-medium text-[var(--ui-body)]">
                {result.applied_fields.join(", ")}
              </span>
            </span>
          ) : null}
        </p>
      ) : null}

      {/* Needs your attention — non-photo items still open */}
      {attentionItems.length > 0 ? (
        <div className="mt-3 border-t border-[var(--ui-border)] pt-3">
          <p className="mb-1.5 text-xs font-semibold text-[var(--ui-title)]">
            Needs your attention ({attentionItems.length})
          </p>
          <ul className="space-y-1.5">
            {attentionItems.map((item, idx) => {
              const fieldName = item.ref ? REF_TO_FIELD[item.ref] : undefined;
              return (
                <li
                  key={`att-${item.ref ?? "item"}-${idx}`}
                  className="flex items-start justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-[var(--ui-title)]">{item.shortcoming}</span>
                    {item.mitigation ? (
                      <span className="block text-xs text-[var(--ui-muted)]">{item.mitigation}</span>
                    ) : null}
                    {fieldName ? (
                      <RowFixButton
                        itemId={itemId}
                        fieldName={fieldName}
                        onFixed={() => void onApplied?.()}
                      />
                    ) : null}
                  </span>
                  {!fieldName && item.resolution_link ? (
                    <a
                      href={item.resolution_link}
                      className="shrink-0 text-xs font-medium text-[var(--ui-accent)] hover:underline"
                    >
                      Fix →
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* Photo issues — reshoot required (not auto-fixable) */}
      {photoItems.length > 0 ? (
        <div className="mt-3 border-t border-[var(--ui-border)] pt-3">
          <p className="mb-1.5 text-xs font-semibold text-[var(--ui-title)]">
            Photo issues — reshoot needed ({photoItems.length})
          </p>
          <ul className="space-y-1.5">
            {photoItems.map((item, idx) => (
              <li
                key={`pic-${item.ref ?? "item"}-${idx}`}
                className="flex items-start justify-between gap-3 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-[var(--ui-title)]">{item.shortcoming}</span>
                  {item.mitigation ? (
                    <span className="block text-xs text-[var(--ui-muted)]">{item.mitigation}</span>
                  ) : null}
                </span>
                {item.resolution_link ? (
                  <a
                    href={item.resolution_link}
                    className="shrink-0 text-xs font-medium text-[var(--ui-accent)] hover:underline"
                  >
                    Photos →
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* All clear */}
      {attentionItems.length === 0 && photoItems.length === 0 && !result.no_ai_action ? (
        <p className="mt-3 text-xs text-[var(--ui-green)]">
          No outstanding quality items — the listing is ready.
        </p>
      ) : null}
    </div>
  );
}
