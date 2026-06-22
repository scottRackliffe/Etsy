"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  computeRubricFastScore,
  rubricScoreColor,
  evaluateListingQuality,
  type InventoryRowLike,
  type QualityCategory,
  type QualityRemediationItem,
} from "@/lib/listing-rubric";
import type { InventoryRecord } from "@/lib/inventory";
import type { InventoryItem } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Any inventory row with at least an id and listing_quality_json. */
type ItemLike = (InventoryItem | InventoryRecord) & { id: number };

export type AiImproveStatus = null | "analyzing" | "calling-ai" | "saving" | "done" | `retry-${number}`;

// ---------------------------------------------------------------------------
// Rubric category breakdown panel (replaces legacy ScoreBreakdownPanel)
// ---------------------------------------------------------------------------

function RubricBreakdownPanel({
  categories,
  remediation,
  score,
}: {
  categories: QualityCategory[];
  remediation: QualityRemediationItem[];
  score: number;
}) {
  const top3 = remediation.slice(0, 3);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[var(--ui-title)]">Score breakdown</p>
        <p className="text-xs text-[var(--ui-muted)]">Total: {score}/100</p>
      </div>
      <div className="space-y-0.5">
        {categories.map((cat) => {
          const pct = cat.possible > 0 ? (cat.earned / cat.possible) * 100 : 0;
          const full = cat.earned >= cat.possible;
          return (
            <div key={cat.name} className="flex items-center gap-2 text-xs">
              <div className="w-[120px] shrink-0 capitalize text-[var(--ui-body)]">{cat.name}</div>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-[var(--ui-border)]">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: full
                      ? "var(--ui-green)"
                      : pct > 0
                        ? "var(--ui-yellow)"
                        : "var(--ui-red)",
                  }}
                />
              </div>
              <span
                className="w-12 shrink-0 text-right font-mono"
                style={{
                  color: full
                    ? "var(--ui-green)"
                    : cat.earned > 0
                      ? "var(--ui-yellow)"
                      : "var(--ui-muted)",
                }}
              >
                {cat.earned}/{cat.possible}
              </span>
            </div>
          );
        })}
      </div>
      {top3.length > 0 && (
        <div className="border-t border-[var(--ui-border)] pt-2">
          <p className="mb-1 text-xs font-semibold text-[var(--ui-title)]">Top improvements</p>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-[var(--ui-body)]">
            {top3.map((r) => (
              <li key={r.ref + r.shortcoming}>{r.shortcoming}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ListingQualityScore — full panel (used in inventory detail)
// ---------------------------------------------------------------------------

type ListingQualityScoreProps = {
  item: ItemLike;
  compact?: boolean;
  minScore?: number;
};

export function ListingQualityScore({ item, compact = false, minScore = 85 }: ListingQualityScoreProps) {
  const [expanded, setExpanded] = useState(false);

  const { score, categories, remediation } = useMemo(() => {
    const fast = computeRubricFastScore(item as unknown as InventoryRowLike);
    if (fast.source === "cached_full") {
      // For cached results, still run the fast evaluator to get category breakdown
      try {
        const full = evaluateListingQuality(item as unknown as InventoryRecord, {
          minScore,
          itemId: item.id,
        });
        return { score: fast.score, categories: full.categories, remediation: full.quality_remediation };
      } catch {
        return { score: fast.score, categories: [] as QualityCategory[], remediation: [] as QualityRemediationItem[] };
      }
    }
    try {
      const result = evaluateListingQuality(item as unknown as InventoryRecord, { minScore, itemId: item.id });
      return { score: result.score, categories: result.categories, remediation: result.quality_remediation };
    } catch {
      return { score: fast.score, categories: [] as QualityCategory[], remediation: [] as QualityRemediationItem[] };
    }
  }, [item, minScore]);

  const color = rubricScoreColor(score);
  const tips = remediation.slice(0, 3).map((r) => r.shortcoming);

  return (
    <div className={compact ? "flex items-center gap-2" : "space-y-3"}>
      <div className="flex flex-wrap items-start gap-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex shrink-0 cursor-pointer flex-col items-center gap-1"
          title="Click to see score breakdown"
        >
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-[var(--ui-title)] transition-transform hover:scale-110"
            style={{
              backgroundColor: `color-mix(in srgb, ${color} 25%, transparent)`,
              border: `2px solid ${color}`,
            }}
            aria-label={`Listing quality score ${score} out of 100`}
          >
            {score}
          </div>
          <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--ui-muted)]">
            Quality
          </span>
        </button>
        {!compact && tips.length > 0 ? (
          <div className="min-w-[12rem] flex-1">
            <p className="mb-1 text-xs font-semibold text-[var(--ui-title)]">
              Tips to improve your listing
            </p>
            <ul className="list-disc space-y-1 pl-4 text-xs text-[var(--ui-body)]">
              {tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      {expanded ? (
        <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
          <RubricBreakdownPanel categories={categories} remediation={remediation} score={score} />
        </div>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setExpanded(true)}>
          Show full breakdown
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// QualityChecklist — sidebar checklist (used in inventory detail panel)
// ---------------------------------------------------------------------------

export function QualityChecklist({
  item,
  minScore = 85,
  onImproveWithAi,
  aiStatus,
  aiConfigured,
}: {
  item: ItemLike;
  minScore?: number;
  onImproveWithAi?: () => void;
  aiStatus?: AiImproveStatus;
  aiConfigured?: boolean;
}) {
  const { score, categories, remediation } = useMemo(() => {
    try {
      const result = evaluateListingQuality(item as unknown as InventoryRecord, {
        minScore,
        itemId: item.id,
      });
      return { score: result.score, categories: result.categories, remediation: result.quality_remediation };
    } catch {
      const fast = computeRubricFastScore(item as unknown as InventoryRowLike);
      return { score: fast.score, categories: [] as QualityCategory[], remediation: [] as QualityRemediationItem[] };
    }
  }, [item, minScore]);

  const color = rubricScoreColor(score);
  const completedCount = categories.filter((c) => c.earned >= c.possible).length;
  const tips = remediation.slice(0, 3).map((r) => r.shortcoming);

  return (
    <div className="sticky top-4 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
      <div className="mb-3 flex items-center gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold text-[var(--ui-title)]"
          style={{
            backgroundColor: `color-mix(in srgb, ${color} 25%, transparent)`,
            border: `2px solid ${color}`,
          }}
        >
          {score}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--ui-title)]">Quality Score</p>
          <p className="text-[10px] text-[var(--ui-muted)]">
            {completedCount}/{categories.length} categories full
          </p>
        </div>
      </div>

      <div className="space-y-1">
        {categories.map((cat) => {
          const full = cat.earned >= cat.possible;
          const partial = !full && cat.earned > 0;
          return (
            <div key={cat.name} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5 shrink-0">
                {full ? (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="var(--ui-green)">
                    <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zm3.78 5.22a.75.75 0 0 0-1.06 0L7 8.94 5.28 7.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l4.25-4.25a.75.75 0 0 0 0-1.06z" />
                  </svg>
                ) : (
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 16 16"
                    fill={partial ? "var(--ui-yellow)" : "var(--ui-red)"}
                  >
                    <circle cx="8" cy="8" r="8" opacity="0.2" />
                    <circle cx="8" cy="8" r="4" />
                  </svg>
                )}
              </span>
              <span
                className="leading-tight capitalize"
                style={{
                  color: full
                    ? "var(--ui-green)"
                    : partial
                      ? "var(--ui-yellow)"
                      : "var(--ui-red)",
                }}
              >
                {cat.name}
                <span className="ml-1 font-mono text-[10px] opacity-70">
                  {cat.earned}/{cat.possible}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 border-t border-[var(--ui-border)] pt-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-[var(--ui-title)]">Total: {score}/100</span>
          {score >= 90 ? (
            <span className="font-semibold text-[var(--ui-green)]">Ready</span>
          ) : score >= minScore ? (
            <span className="font-semibold text-[var(--ui-yellow)]">Acceptable</span>
          ) : (
            <span className="font-semibold text-[var(--ui-red)]">Below minimum ({minScore})</span>
          )}
        </div>
      </div>

      {tips.length > 0 ? (
        <div className="mt-2 border-t border-[var(--ui-border)] pt-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
            Top fixes
          </p>
          <ul className="space-y-0.5 text-xs text-[var(--ui-body)]">
            {tips.map((tip) => (
              <li key={tip} className="flex gap-1.5">
                <span className="shrink-0 text-[var(--ui-yellow)]">→</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {score < 90 && aiConfigured && onImproveWithAi ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={onImproveWithAi}
            disabled={!!aiStatus}
            className={`w-full rounded-lg px-3 py-2 text-xs font-bold text-white shadow-sm ${
              aiStatus
                ? "animate-pulse bg-[var(--ui-yellow)]"
                : "bg-[var(--ui-accent)] hover:brightness-125"
            }`}
          >
            {!aiStatus && "✦ Improve with AI"}
            {aiStatus === "analyzing" && "Analyzing listing…"}
            {aiStatus === "calling-ai" && "AI is writing…"}
            {aiStatus === "saving" && "Saving changes…"}
            {aiStatus === "done" && "Done!"}
            {aiStatus?.startsWith("retry-") &&
              `Rate limited — retrying in ${aiStatus.split("-")[1]}s…`}
          </button>
          {aiStatus && aiStatus !== "done" && (
            <p className="mt-1 text-center text-[10px] text-[var(--ui-muted)]">
              {aiStatus === "analyzing" && "Checking which fields need improvement"}
              {aiStatus === "calling-ai" && "This may take 10–20 seconds"}
              {aiStatus === "saving" && "Updating listing fields"}
              {aiStatus?.startsWith("retry-") && "Will retry automatically"}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ListingQualityScoreBadge — compact inline badge for list views
// ---------------------------------------------------------------------------

export function ListingQualityScoreBadge({ item, minScore = 85 }: { item: ItemLike; minScore?: number }) {
  const fast = computeRubricFastScore(item as unknown as InventoryRowLike);
  const color = rubricScoreColor(fast.score);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { categories, remediation } = useMemo(() => {
    if (!open) return { categories: [] as QualityCategory[], remediation: [] as QualityRemediationItem[] };
    try {
      const result = evaluateListingQuality(item as unknown as InventoryRecord, {
        minScore,
        itemId: item.id,
      });
      return { categories: result.categories, remediation: result.quality_remediation };
    } catch {
      return { categories: [] as QualityCategory[], remediation: [] as QualityRemediationItem[] };
    }
  }, [open, item, minScore]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex min-w-[2rem] cursor-pointer justify-center rounded px-1.5 py-0.5 text-xs font-semibold transition-transform hover:scale-110"
        style={{ color, backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)` }}
        title="Click to see score breakdown"
      >
        {fast.score}
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="absolute right-0 z-50 mt-1 w-[420px] rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-[var(--ui-title)]"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${color} 25%, transparent)`,
                    border: `2px solid ${color}`,
                  }}
                >
                  {fast.score}
                </span>
                <span className="text-sm font-semibold text-[var(--ui-title)]">Listing Quality</span>
                {fast.source === "fast_path" && (
                  <span className="text-[10px] text-[var(--ui-muted)]">(estimated)</span>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={close}>
                Close
              </Button>
            </div>
            {categories.length > 0 ? (
              <RubricBreakdownPanel categories={categories} remediation={remediation} score={fast.score} />
            ) : (
              <p className="text-xs text-[var(--ui-muted)]">Run "Evaluate Listing Quality" for a full breakdown.</p>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
