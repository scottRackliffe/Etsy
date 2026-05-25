import { Button } from "@/components/ui/Button";

type EmptyAction = {
  label: string;
  onClick: () => void;
  variant?: "accent" | "secondary" | "ghost";
};

export function EmptyState({
  message = "No data found.",
  icon,
  primaryAction,
  secondaryAction,
}: {
  message?: string;
  icon?: React.ReactNode;
  primaryAction?: EmptyAction;
  secondaryAction?: EmptyAction;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-[var(--ui-muted)]">
      {icon ?? (
        <svg
          className="mb-3 h-12 w-12 opacity-40"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
      )}
      <p className="max-w-md text-center text-sm text-[var(--ui-muted)]">{message}</p>
      {primaryAction || secondaryAction ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {primaryAction ? (
            <Button variant={primaryAction.variant ?? "accent"} onClick={primaryAction.onClick}>
              {primaryAction.label}
            </Button>
          ) : null}
          {secondaryAction ? (
            <Button
              variant={secondaryAction.variant ?? "secondary"}
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
