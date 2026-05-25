"use client";

import {
  computeListingScore,
  listingScoreGradeColor,
  type ListingScoreInput,
  type ListingScoreResult,
} from "@/lib/listing-score";

type ListingQualityScoreProps = {
  item: ListingScoreInput;
  score?: ListingScoreResult | null;
  compact?: boolean;
};

export function ListingQualityScore({
  item,
  score: scoreOverride,
  compact = false,
}: ListingQualityScoreProps) {
  const score = scoreOverride ?? computeListingScore(item);
  const color = listingScoreGradeColor(score.grade);

  return (
    <div className={compact ? "flex items-center gap-2" : "flex flex-wrap items-start gap-4"}>
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-[var(--ui-title)]"
        style={{
          backgroundColor: `color-mix(in srgb, ${color} 25%, transparent)`,
          border: `2px solid ${color}`,
        }}
        aria-label={`Listing quality score ${score.score} out of 100`}
      >
        {score.score}
      </div>
      {!compact && score.tips.length > 0 ? (
        <ul className="min-w-[12rem] flex-1 list-disc space-y-1 pl-4 text-xs text-[var(--ui-body)]">
          {score.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ListingQualityScoreBadge({ item }: { item: ListingScoreInput }) {
  const { score, grade } = computeListingScore(item);
  const color = listingScoreGradeColor(grade);
  return (
    <span
      className="inline-flex min-w-[2rem] justify-center rounded px-1.5 py-0.5 text-xs font-semibold"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)` }}
    >
      {score}
    </span>
  );
}
