"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  computeListingScore,
  listingScoreGradeColor,
  type ListingScoreBreakdown,
  type ListingScoreInput,
  type ListingScoreResult,
} from "@/lib/listing-score";

type ListingQualityScoreProps = {
  item: ListingScoreInput;
  score?: ListingScoreResult | null;
  compact?: boolean;
  minScore?: number;
};

type BreakdownRow = {
  label: string;
  earned: number;
  max: number;
};

const BREAKDOWN_META: { key: keyof ListingScoreBreakdown; label: string; max: number }[] = [
  { key: "title_length", label: "Title length (60–140 chars)", max: 15 },
  { key: "title_keywords", label: "Category keyword in title", max: 10 },
  { key: "description_length", label: "Description length (500+ chars)", max: 15 },
  { key: "picture_count", label: "Photos (10+ slots filled)", max: 15 },
  { key: "tags_filled", label: "Search tags (13 filled)", max: 10 },
  { key: "condition_code", label: "Condition code set", max: 5 },
  { key: "condition_notes", label: "Condition notes (if issue)", max: 5 },
  { key: "sale_revenue", label: "Sale price set", max: 5 },
  { key: "item_number", label: "Item number assigned", max: 5 },
  { key: "category_tags", label: "Category tags added", max: 5 },
  { key: "description_dimensions", label: "Dimensions in description", max: 5 },
  { key: "description_materials", label: "Materials in description", max: 5 },
  { key: "etsy_when_made", label: "Era / when made", max: 3 },
  { key: "etsy_taxonomy_id", label: "Etsy category ID", max: 3 },
  { key: "materials_field", label: "Materials field populated", max: 3 },
  { key: "measurements", label: "Weight or dimensions entered", max: 3 },
  { key: "video", label: "Video uploaded", max: 3 },
  { key: "picture_classifications", label: "Photo variety (3+ types)", max: 3 },
];

function buildBreakdownRows(breakdown: ListingScoreBreakdown): BreakdownRow[] {
  return BREAKDOWN_META.map(({ key, label, max }) => ({
    label,
    earned: breakdown[key],
    max,
  }));
}

function ScoreBreakdownPanel({ breakdown, score }: { breakdown: ListingScoreBreakdown; score: number }) {
  const rows = buildBreakdownRows(breakdown);
  const earned = rows.reduce((s, r) => s + r.earned, 0);
  const maxPossible = rows.reduce((s, r) => s + r.max, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[var(--ui-title)]">Score breakdown</p>
        <p className="text-xs text-[var(--ui-muted)]">
          {earned} of {maxPossible} points (capped at 100)
        </p>
      </div>
      <div className="space-y-0.5">
        {rows.map((row) => {
          const pct = row.max > 0 ? (row.earned / row.max) * 100 : 0;
          const full = row.earned === row.max;
          return (
            <div key={row.label} className="flex items-center gap-2 text-xs">
              <div className="w-[180px] shrink-0 truncate text-[var(--ui-body)]" title={row.label}>
                {row.label}
              </div>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-[var(--ui-border)]">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: full ? "var(--ui-green)" : pct > 0 ? "var(--ui-yellow)" : "var(--ui-red)",
                  }}
                />
              </div>
              <span
                className="w-10 shrink-0 text-right font-mono"
                style={{
                  color: full
                    ? "var(--ui-green)"
                    : row.earned > 0
                      ? "var(--ui-yellow)"
                      : "var(--ui-muted)",
                }}
              >
                {row.earned}/{row.max}
              </span>
            </div>
          );
        })}
      </div>
      <div className="border-t border-[var(--ui-border)] pt-1 text-right text-xs font-semibold text-[var(--ui-title)]">
        Total: {score}/100
      </div>
    </div>
  );
}

export function ListingQualityScore({
  item,
  score: scoreOverride,
  compact = false,
  minScore = 80,
}: ListingQualityScoreProps) {
  const [expanded, setExpanded] = useState(false);
  const score = scoreOverride ?? computeListingScore(item, minScore);
  const color = listingScoreGradeColor(score.grade);

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
            aria-label={`Listing quality score ${score.score} out of 100`}
          >
            {score.score}
          </div>
          <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--ui-muted)]">
            Quality
          </span>
        </button>
        {!compact && score.tips.length > 0 ? (
          <div className="min-w-[12rem] flex-1">
            <p className="mb-1 text-xs font-semibold text-[var(--ui-title)]">
              Tips to improve your listing
            </p>
            <ul className="list-disc space-y-1 pl-4 text-xs text-[var(--ui-body)]">
              {score.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      {expanded ? (
        <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
          <ScoreBreakdownPanel breakdown={score.breakdown} score={score.score} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-xs text-[var(--ui-accent)] hover:underline"
        >
          Show full breakdown
        </button>
      )}
    </div>
  );
}

export type AiImproveStatus = null | "analyzing" | "calling-ai" | "saving" | "done" | `retry-${number}`;

export function QualityChecklist({
  item,
  minScore = 80,
  onImproveWithAi,
  aiStatus,
  aiConfigured,
}: {
  item: ListingScoreInput;
  minScore?: number;
  onImproveWithAi?: () => void;
  aiStatus?: AiImproveStatus;
  aiConfigured?: boolean;
}) {
  const result = useMemo(() => computeListingScore(item, minScore), [item, minScore]);
  const color = listingScoreGradeColor(result.grade);
  const rows = useMemo(() => buildBreakdownRows(result.breakdown), [result.breakdown]);
  const completedCount = rows.filter((r) => r.earned === r.max).length;

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
          {result.score}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--ui-title)]">Quality Score</p>
          <p className="text-[10px] text-[var(--ui-muted)]">
            {completedCount}/{rows.length} checks passed
          </p>
        </div>
      </div>

      <div className="space-y-1">
        {rows.map((row) => {
          const full = row.earned === row.max;
          const partial = !full && row.earned > 0;
          return (
            <div key={row.label} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5 shrink-0">
                {full ? (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="var(--ui-green)">
                    <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zm3.78 5.22a.75.75 0 0 0-1.06 0L7 8.94 5.28 7.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l4.25-4.25a.75.75 0 0 0 0-1.06z" />
                  </svg>
                ) : (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill={partial ? "var(--ui-yellow)" : "var(--ui-red)"}>
                    <circle cx="8" cy="8" r="8" opacity="0.2" />
                    <circle cx="8" cy="8" r="4" />
                  </svg>
                )}
              </span>
              <span
                className="leading-tight"
                style={{
                  color: full
                    ? "var(--ui-green)"
                    : partial
                      ? "var(--ui-yellow)"
                      : "var(--ui-red)",
                }}
              >
                {row.label}
                {!full && (
                  <span className="ml-1 font-mono text-[10px] opacity-70">
                    {row.earned}/{row.max}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 border-t border-[var(--ui-border)] pt-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-[var(--ui-title)]">
            Total: {result.score}/100
          </span>
          {result.score >= 90 ? (
            <span className="font-semibold text-[var(--ui-green)]">Ready</span>
          ) : result.score >= minScore ? (
            <span className="font-semibold text-[var(--ui-yellow)]">Acceptable</span>
          ) : (
            <span className="font-semibold text-[var(--ui-red)]">Below minimum ({minScore})</span>
          )}
        </div>
      </div>

      {result.tips.length > 0 ? (
        <div className="mt-2 border-t border-[var(--ui-border)] pt-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
            Top fixes
          </p>
          <ul className="space-y-0.5 text-xs text-[var(--ui-body)]">
            {result.tips.map((tip) => (
              <li key={tip} className="flex gap-1.5">
                <span className="shrink-0 text-[var(--ui-yellow)]">→</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.score < 90 && aiConfigured && onImproveWithAi ? (
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

export function ListingQualityScoreBadge({ item, minScore = 80 }: { item: ListingScoreInput; minScore?: number }) {
  const result = computeListingScore(item, minScore);
  const color = listingScoreGradeColor(result.grade);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

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
        {result.score}
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
                  {result.score}
                </span>
                <span className="text-sm font-semibold text-[var(--ui-title)]">Listing Quality</span>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded px-2 py-1 text-xs text-[var(--ui-muted)] hover:text-[var(--ui-title)]"
              >
                Close
              </button>
            </div>
            <ScoreBreakdownPanel breakdown={result.breakdown} score={result.score} />
            {result.tips.length > 0 ? (
              <div className="mt-3 border-t border-[var(--ui-border)] pt-2">
                <p className="mb-1 text-xs font-semibold text-[var(--ui-title)]">Top improvements</p>
                <ul className="list-disc space-y-0.5 pl-4 text-xs text-[var(--ui-body)]">
                  {result.tips.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
