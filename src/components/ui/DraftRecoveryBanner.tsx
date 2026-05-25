"use client";

import { Button } from "@/components/ui/Button";

export function DraftRecoveryBanner({
  savedAtLabel,
  onRestore,
  onDiscard,
}: {
  savedAtLabel: string;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--ui-yellow)]/40 border-l-4 border-l-[var(--ui-yellow)] bg-[var(--ui-yellow)]/15 px-3 py-2 text-sm text-[var(--ui-body)]">
      <span>Recovered unsaved changes from {savedAtLabel}.</span>
      <div className="flex flex-wrap gap-2">
        <Button variant="accent" size="sm" onClick={onRestore}>
          Restore
        </Button>
        <Button variant="secondary" size="sm" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </div>
  );
}
