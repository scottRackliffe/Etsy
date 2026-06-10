const VARIANT_CLASSES: Record<string, string> = {
  primary:
    "bg-[var(--ui-green)] text-black hover:bg-[var(--ui-primary-hover)] disabled:bg-[var(--ui-disabled)] disabled:text-[var(--ui-muted)]",
  secondary:
    "bg-[var(--ui-neutral)] text-[var(--ui-body)] hover:bg-[var(--ui-neutral-hover)] disabled:opacity-50",
  danger: "bg-[var(--ui-red)] text-white hover:bg-[var(--ui-danger-hover)] disabled:opacity-50",
  accent: "bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)] disabled:opacity-50",
  ghost: "bg-transparent text-[var(--ui-body)] hover:bg-[var(--ui-neutral)] disabled:opacity-50",
};

const SIZE_CLASSES: Record<string, string> = {
  sm: "px-2 py-1 text-xs",
  md: "px-3 py-1.5 text-sm",
  lg: "px-4 py-2 text-sm",
};

export function Button({
  children,
  variant = "secondary",
  size = "md",
  disabled,
  busy,
  onClick,
  type = "button",
  className,
  title,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "accent" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  busy?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
  title?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      onClick={onClick}
      title={title}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className ?? ""}`}
    >
      {busy && (
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}
