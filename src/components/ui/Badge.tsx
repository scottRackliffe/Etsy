const VARIANT_CLASSES: Record<string, string> = {
  success: "bg-[var(--ui-green)]/20 text-[var(--ui-green)]",
  warning: "bg-[var(--ui-yellow)]/20 text-[var(--ui-yellow)]",
  error: "bg-[var(--ui-red)]/20 text-[var(--ui-red)]",
  info: "bg-[var(--ui-accent)]/20 text-[var(--ui-accent)]",
  neutral: "bg-[var(--ui-neutral)] text-[var(--ui-muted)]",
};

export function Badge({
  label,
  variant = "neutral",
  ariaLabel,
}: {
  label: string;
  variant?: "success" | "warning" | "error" | "info" | "neutral";
  ariaLabel?: string;
}) {
  return (
    <span
      aria-label={ariaLabel}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.neutral}`}
    >
      {label}
    </span>
  );
}
