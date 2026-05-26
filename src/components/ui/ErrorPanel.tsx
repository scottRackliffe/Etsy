import { formatUiErrorTimestamp } from "@/lib/ui-error";
import type { UiError } from "@/types";

export function ErrorPanel({ error, onDismiss }: { error: UiError; onDismiss?: () => void }) {
  return (
    <div className="rounded-lg border border-[var(--ui-red)]/30 bg-[var(--ui-red)]/10 p-4">
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
            className="shrink-0 text-[var(--ui-red)]/60 hover:text-[var(--ui-red)]"
            aria-label="Dismiss error"
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
  );
}
