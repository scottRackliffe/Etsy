"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Standard SEMS editor shell (ADR-079 §2).
 *
 * Presentational only: renders an optional header (title + badges + summary),
 * the entity's fields (`children`), an optional read-mostly context region
 * (Region 3, e.g. purchase/activity history), and a **sticky bottom action bar**
 * with the canonical `Cancel` (left) / primary `Save` (right) placement.
 *
 * Dirty tracking, validation, persistence, and the unsaved-changes guard are owned
 * by the entity page via `useSemsEditorGuard`; this component just lays them out.
 */
export function SemsEditor({
  title,
  subtitle,
  badges,
  summary,
  isDirty,
  busy,
  saveLabel = "Save",
  saveDisabled,
  onSave,
  onCancel,
  cancelLabel = "Cancel",
  children,
  context,
}: {
  title: string;
  subtitle?: ReactNode;
  badges?: ReactNode;
  summary?: ReactNode;
  isDirty: boolean;
  busy?: boolean;
  saveLabel?: string;
  saveDisabled?: boolean;
  onSave: () => void;
  onCancel: () => void;
  cancelLabel?: string;
  children: ReactNode;
  context?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-[var(--ui-muted)] hover:text-[var(--ui-title)]"
          aria-label="Back to list"
        >
          &larr; Back
        </button>
        <span className="text-[var(--ui-border)]">/</span>
        <h3 className="text-base font-semibold text-[var(--ui-title)]">{title}</h3>
        {badges}
        {isDirty ? (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--ui-yellow)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--ui-yellow)]" aria-hidden />
            Unsaved changes
          </span>
        ) : null}
      </div>

      {subtitle ? <div className="mb-2 text-sm text-[var(--ui-muted)]">{subtitle}</div> : null}
      {summary ? <div className="mb-3">{summary}</div> : null}

      <div>{children}</div>

      {context ? <div className="mt-3">{context}</div> : null}

      <div className="sticky bottom-0 z-10 -mx-4 -mb-4 mt-4 flex items-center justify-end gap-2 rounded-b-lg border-t border-[var(--ui-border)] bg-[var(--ui-panel-bg)]/95 px-4 py-3 backdrop-blur-sm">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          variant="accent"
          size="sm"
          onClick={onSave}
          busy={busy}
          disabled={saveDisabled}
          data-save-button
        >
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}
