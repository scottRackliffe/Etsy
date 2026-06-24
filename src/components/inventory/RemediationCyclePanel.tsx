"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/Button";

type RemediationItem = {
  category?: string;
  ref?: string;
  shortcoming: string;
  mitigation?: string;
  weight?: number;
  resolution_link?: string;
};

type CycleResult = {
  ok: boolean;
  tier: "standard" | "premium";
  no_ai_action?: boolean;
  message?: string;
  model_used: string | null;
  premium_configured: boolean;
  previous_score: number;
  new_score: number;
  delta: number;
  improved: boolean;
  passed: boolean;
  listing_phase?: string;
  remediation: RemediationItem[];
  user_action_items: RemediationItem[];
  applied_fields: string[];
};

type Props = {
  itemId: number;
  onApplied?: () => Promise<void> | void;
  onError: (title: string, message: string, err?: unknown) => void;
};

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
    async (tier: "standard" | "premium") => {
      setBusy(true);
      setShowPremiumHint(false);
      try {
        const res = await fetch(`/api/inventory/${itemId}/listing-remediation-cycle`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ tier }),
        });
        const data = (await res.json().catch(() => ({}))) as CycleResult & {
          error?: { user_message?: string };
        };
        if (!res.ok || !data.ok) {
          onError(
            "Remediation cycle",
            (data as { error?: { user_message?: string } }).error?.user_message ??
              "We could not run the remediation cycle."
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

  // Not yet started — show the entry button only.
  if (!result) {
    return (
      <div className="mb-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-[var(--ui-title)]">AI remediation cycle</p>
            <p className="text-xs text-[var(--ui-muted)]">
              Score the listing and let the AI fix what the rubric found — one pass at a time.
            </p>
          </div>
          <Button variant="accent" size="sm" onClick={() => void runCycle("standard")} busy={busy}>
            Start cycle
          </Button>
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

  const aiFixable = result.remediation.filter(
    (r) => !result.user_action_items.some((u) => u.ref === r.ref && u.shortcoming === r.shortcoming)
  );
  const userItems = result.user_action_items;

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
            Stop cycling
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void runCycle("standard")}
            busy={busy}
          >
            Cycle again
          </Button>
          <Button
            variant="accent"
            size="sm"
            onClick={() => void runCycle("premium")}
            busy={busy}
          >
            Advance AI
          </Button>
        </div>
      </div>

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

      {/* AI-fixable remaining items */}
      {aiFixable.length > 0 ? (
        <div className="mt-3 border-t border-[var(--ui-border)] pt-3">
          <p className="mb-1.5 text-xs font-semibold text-[var(--ui-title)]">
            Remaining AI-fixable ({aiFixable.length})
          </p>
          <ul className="space-y-1.5">
            {aiFixable.map((item, idx) => (
              <li key={`ai-${item.ref ?? "item"}-${idx}`} className="text-sm text-[var(--ui-body)]">
                <span className="font-medium text-[var(--ui-title)]">{item.shortcoming}</span>
                {item.mitigation ? (
                  <span className="block text-xs text-[var(--ui-muted)]">{item.mitigation}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* User-action items */}
      {userItems.length > 0 ? (
        <div className="mt-3 border-t border-[var(--ui-border)] pt-3">
          <p className="mb-1.5 text-xs font-semibold text-[var(--ui-title)]">
            Needs your attention ({userItems.length})
          </p>
          <ul className="space-y-1.5">
            {userItems.map((item, idx) => (
              <li
                key={`user-${item.ref ?? "item"}-${idx}`}
                className="flex items-start justify-between gap-3 text-sm"
              >
                <span>
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
                    Fix →
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* All clear */}
      {aiFixable.length === 0 && userItems.length === 0 && !result.no_ai_action ? (
        <p className="mt-3 text-xs text-[var(--ui-muted)]">No outstanding quality items.</p>
      ) : null}
    </div>
  );
}
