import { Children, cloneElement, isValidElement } from "react";
import { HelpTooltip } from "@/components/ui/HelpTooltip";

export function FormField({
  label,
  htmlFor,
  error,
  helpText,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  helpText?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  const errorId = htmlFor && error ? `${htmlFor}-error` : undefined;

  const ariaProps: Record<string, unknown> = {};
  if (required) ariaProps["aria-required"] = true;
  if (error) ariaProps["aria-invalid"] = true;
  if (errorId) ariaProps["aria-describedby"] = errorId;

  const enhancedChildren =
    Object.keys(ariaProps).length > 0
      ? Children.map(children, (child) =>
          isValidElement<Record<string, unknown>>(child)
            ? cloneElement(child, ariaProps)
            : child
        )
      : children;

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={htmlFor}
        className="flex items-center text-xs font-medium text-[var(--ui-muted)]"
      >
        {label}
        {required ? <span className="ml-0.5 text-[var(--ui-red)]" aria-hidden="true">*</span> : null}
        {helpText ? <HelpTooltip text={helpText} /> : null}
      </label>
      {enhancedChildren}
      {error && <p id={errorId} role="alert" className="text-xs text-[var(--ui-red)]">{error}</p>}
    </div>
  );
}

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
  className,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "number" | "email" | "tel" | "password";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      spellCheck={type === "text"}
      autoComplete="off"
      data-lpignore="true"
      data-1p-ignore
      data-form-type="other"
      className={`rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm text-[var(--ui-title)] placeholder-[var(--ui-muted)] focus:border-[var(--ui-accent)] focus:outline-none disabled:opacity-50 ${className ?? ""}`}
    />
  );
}

export function SelectInput({
  id,
  value,
  onChange,
  options,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm text-[var(--ui-title)] focus:border-[var(--ui-accent)] focus:outline-none disabled:opacity-50"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
