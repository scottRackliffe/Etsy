"use client";

import type { Toast as ToastType, ToastType as ToastVariant } from "@/hooks/useToast";

const TOAST_STYLES: Record<ToastVariant, string> = {
  success: "bg-[var(--ui-green)]/15 border-[var(--ui-green)]/30 text-[var(--ui-green)]",
  error: "bg-[var(--ui-red)]/15 border-[var(--ui-red)]/30 text-[var(--ui-red)]",
  warning: "bg-[var(--ui-yellow)]/15 border-[var(--ui-yellow)]/30 text-[var(--ui-yellow)]",
  info: "bg-[var(--ui-accent)]/15 border-[var(--ui-accent)]/30 text-[var(--ui-accent)]",
};

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastType[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur-sm ${TOAST_STYLES[t.type]}`}
        >
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => onDismiss(t.id)}
            className="ml-2 opacity-60 hover:opacity-100"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
