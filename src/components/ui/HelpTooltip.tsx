"use client";

import { useId, useState } from "react";

export function HelpTooltip({ text }: { text: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label="Field help"
        aria-describedby={open ? id : undefined}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-[var(--ui-border)] text-[10px] leading-none text-[var(--ui-muted)] hover:text-[var(--ui-body)]"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-20 mb-1 w-64 max-w-[min(280px,70vw)] -translate-x-1/2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-2 py-1.5 text-xs leading-snug text-[var(--ui-body)] shadow-lg"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
