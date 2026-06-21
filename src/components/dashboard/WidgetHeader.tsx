"use client";

import Link from "next/link";

/**
 * Standard header for every dashboard widget: title (left), optional subtitle,
 * and a right-aligned action slot + consistent "View →" navigation link.
 * Using this everywhere keeps the dashboard controls uniform (ADR-016/028).
 */
export function WidgetHeader({
  title,
  subtitle,
  href,
  viewLabel = "View",
  action,
}: {
  title: string;
  subtitle?: React.ReactNode;
  href?: string;
  viewLabel?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
          {title}
        </h3>
        {subtitle != null ? (
          <p className="mt-0.5 text-xs text-[var(--ui-muted)]">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {action}
        {href ? (
          <Link
            href={href}
            className="inline-flex items-center gap-0.5 text-xs font-medium text-[var(--ui-accent)] hover:underline"
          >
            {viewLabel}
            <span aria-hidden>→</span>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
