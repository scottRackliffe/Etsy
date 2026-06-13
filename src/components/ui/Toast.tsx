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
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.type === "error" ? "alert" : "status"}
          aria-live={t.type === "error" ? "assertive" : "polite"}
          className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur-sm ${TOAST_STYLES[t.type]}`}
        >
          <span className="flex-1">{t.message}</span>
          {t.onAction && t.actionLabel ? (
            <button
              type="button"
              onClick={() => {
                t.onAction?.();
                onDismiss(t.id);
              }}
              className="rounded border border-current/30 px-2 py-0.5 text-xs font-semibold opacity-90 hover:opacity-100"
            >
              {t.actionLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            className="rounded border border-current/30 px-2 py-1 text-xs font-semibold opacity-90 hover:opacity-100"
          >
            OK
          </button>
        </div>
      ))}
    </div>
  );
}
