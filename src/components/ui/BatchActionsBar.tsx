"use client";

import type { ReactNode } from "react";

type Props = {
  selectionLabel: string;
  children: ReactNode;
  onClear: () => void;
  selectAllMatching?: {
    total: number;
    onSelect: () => void;
    disabled?: boolean;
    tooLarge?: boolean;
  };
};

export function BatchActionsBar({ selectionLabel, children, onClear, selectAllMatching }: Props) {
  return (
    <div className="sticky top-0 z-10 mb-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-medium text-[var(--ui-body)]">{selectionLabel}</span>
          {selectAllMatching && !selectAllMatching.disabled ? (
            <button
              type="button"
              onClick={selectAllMatching.onSelect}
              className="text-left text-xs text-[var(--ui-accent)] hover:underline disabled:opacity-50"
              disabled={selectAllMatching.tooLarge}
            >
              {selectAllMatching.tooLarge
                ? `Too many matches (${selectAllMatching.total}) — narrow filters (max 100 per batch)`
                : `Select all ${selectAllMatching.total} matching items`}
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">{children}</div>
        <button
          type="button"
          onClick={onClear}
          className="text-sm text-[var(--ui-accent)] hover:underline"
        >
          Clear selection
        </button>
      </div>
    </div>
  );
}
