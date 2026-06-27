"use client";

import { useEffect, useRef, useState } from "react";
import { formatUiErrorTimestamp } from "@/lib/ui-error";
import type { UiError, UiErrorVariant } from "@/types";

const VARIANT_STYLES: Record<UiErrorVariant, { border: string; title: string; dismiss: string }> = {
  error: {
    border: "border-[var(--ui-red)]/40",
    title: "text-[var(--ui-red)]",
    dismiss: "text-[var(--ui-red)]/60 hover:text-[var(--ui-red)]",
  },
  success: {
    border: "border-[var(--ui-green)]/40",
    title: "text-[var(--ui-green)]",
    dismiss: "text-[var(--ui-green)]/60 hover:text-[var(--ui-green)]",
  },
  info: {
    border: "border-[var(--ui-accent)]/40",
    title: "text-[var(--ui-accent)]",
    dismiss: "text-[var(--ui-accent)]/60 hover:text-[var(--ui-accent)]",
  },
};

export function ErrorPanel({ error, onDismiss }: { error: UiError; onDismiss?: () => void }) {
  const variant = error.variant ?? "error";
  const styles = VARIANT_STYLES[variant];
  const cardRef = useRef<HTMLDivElement>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    cardRef.current?.focus();
  }, []);

  // Collapse the detail section whenever the displayed error changes.
  useEffect(() => {
    setDetailOpen(false);
    setCopied(false);
  }, [error]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && onDismiss) {
      onDismiss();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && onDismiss) {
      onDismiss();
    }
  };

  const handleCopy = () => {
    if (!error.detail) return;
    const text = [
      error.detail.code ? `Code: ${error.detail.code}` : null,
      `Message: ${error.detail.message}`,
      `Time: ${formatUiErrorTimestamp(error.detail.timestamp)}`,
      error.detail.endpoint ? `Endpoint: ${error.detail.endpoint}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const hasDetail = Boolean(error.detail);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={cardRef}
        role="alertdialog"
        aria-live="assertive"
        aria-modal="true"
        tabIndex={-1}
        className={`w-full max-w-md rounded-xl border ${styles.border} bg-[var(--ui-panel-bg)] p-5 shadow-2xl shadow-black/50 outline-none`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className={`text-base font-semibold ${styles.title}`}>{error.title}</h4>
            {error.occurredAt ? (
              <p className="mt-0.5 text-[10px] text-[var(--ui-muted)]">
                {formatUiErrorTimestamp(error.occurredAt)}
              </p>
            ) : null}
          </div>
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              className={`shrink-0 text-xl leading-none ${styles.dismiss}`}
              aria-label="Dismiss"
            >
              &times;
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-sm text-[var(--ui-body)]">{error.message}</p>
        {error.actions.length > 0 ? (
          <ul className="mt-3 list-inside list-disc text-xs text-[var(--ui-muted)]">
            {error.actions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        ) : null}

        {/* Details disclosure — only rendered when technical detail is available */}
        {hasDetail ? (
          <div className="mt-3 border-t border-[var(--ui-border)] pt-3">
            <button
              type="button"
              onClick={() => setDetailOpen((o) => !o)}
              className="flex items-center gap-1 text-xs text-[var(--ui-muted)] hover:text-[var(--ui-body)]"
              aria-expanded={detailOpen}
            >
              <span
                className="inline-block transition-transform"
                style={{ transform: detailOpen ? "rotate(90deg)" : "rotate(0deg)" }}
              >
                ▶
              </span>
              Details
            </button>

            {detailOpen && error.detail ? (
              <div className="mt-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
                <dl className="space-y-1 text-xs">
                  {error.detail.code ? (
                    <div className="flex gap-2">
                      <dt className="w-20 shrink-0 text-[var(--ui-muted)]">Code</dt>
                      <dd className="font-mono text-[var(--ui-body)]">{error.detail.code}</dd>
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-[var(--ui-muted)]">Message</dt>
                    <dd className="break-all font-mono text-[var(--ui-body)]">
                      {error.detail.message}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-[var(--ui-muted)]">Time</dt>
                    <dd className="font-mono text-[var(--ui-body)]">
                      {formatUiErrorTimestamp(error.detail.timestamp)}
                    </dd>
                  </div>
                  {error.detail.endpoint ? (
                    <div className="flex gap-2">
                      <dt className="w-20 shrink-0 text-[var(--ui-muted)]">Endpoint</dt>
                      <dd className="break-all font-mono text-[var(--ui-body)]">
                        {error.detail.endpoint}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="mt-2 text-[10px] text-[var(--ui-accent)] hover:underline"
                >
                  {copied ? "Copied!" : "Copy details"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
