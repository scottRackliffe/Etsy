"use client";

import { listingScoreGradeColor } from "@/lib/listing-score";
import type { ComposeResponse } from "@/components/listing-coach/types";

type ListingPreviewProps = {
  compose: ComposeResponse;
};

export function ListingPreview({ compose }: ListingPreviewProps) {
  const tags = compose.listing_tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const grade =
    compose.quality_score.score >= 80
      ? "green"
      : compose.quality_score.score >= 60
        ? "yellow"
        : "red";
  const color = listingScoreGradeColor(grade);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
          Title
        </p>
        <p className="mt-1 text-base font-semibold text-[var(--ui-title)]">
          {compose.listing_title}
        </p>
      </div>

      <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
          Description
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--ui-body)]">
          {compose.listing_description}
        </p>
      </div>

      <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
          Tags ({tags.length}/13)
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-2 py-0.5 text-xs text-[var(--ui-body)]"
            >
              {tag}
            </span>
          ))}
        </div>
        </div>

      {compose.listing_category_path ? (
        <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
            Suggested category
          </p>
          <p className="mt-1 text-sm text-[var(--ui-body)]">{compose.listing_category_path}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start gap-4 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-[var(--ui-title)]"
          style={{
            backgroundColor: `color-mix(in srgb, ${color} 25%, transparent)`,
            border: `2px solid ${color}`,
          }}
        >
          {compose.quality_score.score}
        </div>
        <div>
          <p className="text-sm font-semibold text-[var(--ui-title)]">Listing quality score</p>
          {compose.quality_score.hints.length > 0 ? (
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-[var(--ui-body)]">
              {compose.quality_score.hints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-[var(--ui-muted)]">Looking good!</p>
          )}
        </div>
      </div>
    </div>
  );
}
