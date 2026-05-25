import type { UiError } from "@/types";

export function ErrorPanel({ error, onDismiss }: { error: UiError; onDismiss?: () => void }) {
  return (
    <div className="rounded-lg border border-[var(--ui-red)]/30 bg-[var(--ui-red)]/10 p-4">
      <div className="flex items-start justify-between">
        <h4 className="font-semibold text-[var(--ui-red)]">{error.title}</h4>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-[var(--ui-red)]/60 hover:text-[var(--ui-red)]"
          >
            &times;
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-[var(--ui-body)]">{error.message}</p>
      {error.actions.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-xs text-[var(--ui-muted)]">
          {error.actions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
