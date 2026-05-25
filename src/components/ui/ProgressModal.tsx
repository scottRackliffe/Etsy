"use client";

import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Button } from "@/components/ui/Button";
import { formatElapsed, useElapsedSeconds } from "@/hooks/useElapsedSeconds";

export type ProgressModalState = {
  open: boolean;
  title: string;
  statusText: string;
  mode: "indeterminate" | "determinate";
  current?: number;
  total?: number;
  error?: string | null;
  userMessage?: string;
  onRetry?: () => void;
  onClose?: () => void;
  onCancel?: () => void;
  cancelDisabled?: boolean;
};

export function ProgressModal({
  open,
  title,
  statusText,
  mode,
  current = 0,
  total = 0,
  error,
  userMessage,
  onRetry,
  onClose,
  onCancel,
  cancelDisabled = false,
}: ProgressModalState) {
  const elapsed = useElapsedSeconds(open && !error);
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-busy={!error}
      aria-labelledby="progress-modal-title"
    >
      <div className="w-full max-w-md rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-6 shadow-2xl">
        <h3 id="progress-modal-title" className="text-lg font-semibold text-[var(--ui-title)]">
          {title}
        </h3>

        {error ? (
          <div className="mt-4">
            <p className="text-sm text-[var(--ui-red)]">{userMessage ?? error}</p>
            <div className="mt-6 flex justify-end gap-2">
              {onRetry ? (
                <Button variant="accent" onClick={onRetry}>
                  Retry
                </Button>
              ) : null}
              {onClose ? (
                <Button variant="secondary" onClick={onClose}>
                  Close
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-4">
            {mode === "determinate" && total > 0 ? (
              <div className="mb-3">
                <div className="mb-1 flex justify-between text-xs text-[var(--ui-muted)]">
                  <span>
                    {current} of {total}
                  </span>
                  <span>{pct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--ui-border)]">
                  <div
                    className="h-full rounded-full bg-[var(--ui-accent)] transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="mb-3 flex justify-center py-2">
                <LoadingSpinner size="lg" />
              </div>
            )}
            <p className="text-sm text-[var(--ui-body)]" aria-live="polite">
              {statusText}
            </p>
            <p className="mt-2 text-xs text-[var(--ui-muted)]">Elapsed: {formatElapsed(elapsed)}</p>
            {onCancel ? (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="secondary"
                  onClick={onCancel}
                  disabled={cancelDisabled}
                >
                  Cancel
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
