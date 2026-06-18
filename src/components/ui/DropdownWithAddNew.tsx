"use client";

import { useState } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
};

export function DropdownWithAddNew({ value, onChange, options, placeholder, className }: Props) {
  const [addingNew, setAddingNew] = useState(false);
  const [customValue, setCustomValue] = useState("");

  const isCustom = value !== "" && !options.includes(value);

  if (addingNew) {
    return (
      <div className="flex items-center gap-1">
        <input
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && customValue.trim()) {
              onChange(customValue.trim());
              setAddingNew(false);
              setCustomValue("");
            }
            if (e.key === "Escape") {
              setAddingNew(false);
              setCustomValue("");
            }
          }}
          placeholder="Type new value..."
          autoFocus
          className={className}
        />
        <button
          type="button"
          onClick={() => {
            if (customValue.trim()) {
              onChange(customValue.trim());
            }
            setAddingNew(false);
            setCustomValue("");
          }}
          className="shrink-0 rounded px-1.5 py-1 text-xs font-medium text-[var(--ui-accent)] hover:bg-[var(--ui-accent)]/10"
        >
          OK
        </button>
        <button
          type="button"
          onClick={() => {
            setAddingNew(false);
            setCustomValue("");
          }}
          className="shrink-0 rounded px-1.5 py-1 text-xs text-[var(--ui-muted)] hover:bg-[var(--ui-neutral)]/30"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <select
      value={isCustom ? "__custom__" : value}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "__add_new__") {
          setAddingNew(true);
          setCustomValue("");
        } else if (v === "__custom__") {
          // keep current custom value
        } else {
          onChange(v);
        }
      }}
      className={className}
    >
      <option value="">{placeholder ?? "Select..."}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
      {isCustom && (
        <option value="__custom__">{value}</option>
      )}
      <option value="__add_new__">+ Add new...</option>
    </select>
  );
}
