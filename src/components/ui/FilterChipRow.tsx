"use client";

export type FilterChipOption = {
  value: string;
  label: string;
};

export function FilterChipRow({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: FilterChipOption[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="space-y-1">
      {label ? <p className="text-xs font-medium text-[var(--ui-muted)]">{label}</p> : null}
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(selected ? null : option.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                selected
                  ? "bg-[var(--ui-accent)] text-white"
                  : "bg-[var(--ui-neutral)] text-[var(--ui-body)] hover:bg-[var(--ui-border)]"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
