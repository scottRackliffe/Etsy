import { formatUiErrorTimestamp } from "@/lib/ui-error";
import type { UiError } from "@/types";

export function ErrorPanel({ error, onDismiss }: { error: UiError; onDismiss?: () => void }) {
  return (
    <div className="fixed inset-x-0 top-4 z-50 mx-auto flex max-w-lg justify-center px-4">
      <div
        role="alert"
        aria-live="assertive"
        className="w-full rounded-lg border border-[var(--ui-red)]/30 bg-[var(--ui-panel-bg)] p-4 shadow-xl shadow-black/40"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="font-semibold text-[var(--ui-red)]">{error.title}</h4>
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
              className="shrink-0 text-lg leading-none text-[var(--ui-red)]/60 hover:text-[var(--ui-red)]"
              aria-label="Dismiss"
            >
              &times;
            </button>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-[var(--ui-body)]">{error.message}</p>
        {error.actions.length > 0 ? (
          <ul className="mt-2 list-inside list-disc text-xs text-[var(--ui-muted)]">
            {error.actions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
