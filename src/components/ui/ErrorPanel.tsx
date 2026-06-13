import { useEffect, useRef } from "react";
import { formatUiErrorTimestamp } from "@/lib/ui-error";
import type { UiError, UiErrorVariant } from "@/types";

const VARIANT_STYLES: Record<UiErrorVariant, { border: string; title: string; dismiss: string }> = {
  error: {
    border: "border-[var(--ui-red)]/40",
    title: "text-[var(--ui-red)]",
    dismiss: "text-[var(--ui-red)]/60 hover:text-[var(--ui-red)]",
  },
  success: {
    border: "border-[var(--ui-green)]/40",
    title: "text-[var(--ui-green)]",
    dismiss: "text-[var(--ui-green)]/60 hover:text-[var(--ui-green)]",
  },
  info: {
    border: "border-[var(--ui-accent)]/40",
    title: "text-[var(--ui-accent)]",
    dismiss: "text-[var(--ui-accent)]/60 hover:text-[var(--ui-accent)]",
  },
};

export function ErrorPanel({ error, onDismiss }: { error: UiError; onDismiss?: () => void }) {
  const variant = error.variant ?? "error";
  const styles = VARIANT_STYLES[variant];
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    cardRef.current?.focus();
  }, []);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && onDismiss) {
      onDismiss();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && onDismiss) {
      onDismiss();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={cardRef}
        role="alertdialog"
        aria-live="assertive"
        aria-modal="true"
        tabIndex={-1}
        className={`w-full max-w-md rounded-xl border ${styles.border} bg-[var(--ui-panel-bg)] p-5 shadow-2xl shadow-black/50 outline-none`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className={`text-base font-semibold ${styles.title}`}>{error.title}</h4>
            {error.occurredAt ? (
              <p className="mt-0.5 text-[10px] text-[var(--ui-muted)]">
                {formatUiErrorTimestamp(error.occurredAt)}
              </p>
            ) : null}
          </div>
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              className={`shrink-0 text-xl leading-none ${styles.dismiss}`}
              aria-label="Dismiss"
            >
              &times;
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-sm text-[var(--ui-body)]">{error.message}</p>
        {error.actions.length > 0 ? (
          <ul className="mt-3 list-inside list-disc text-xs text-[var(--ui-muted)]">
            {error.actions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
