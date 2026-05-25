"use client";

import { useEffect, useId, useRef } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useFocusTrap(dialogRef, open, onClose);

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={`${maxWidth} w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-6 shadow-2xl`}
      >
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h3 id={titleId} className="text-lg font-semibold text-[var(--ui-title)]">
              {title}
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="text-[var(--ui-muted)] hover:text-[var(--ui-title)]"
            >
              &times;
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
