"use client";

import Link from "next/link";

export type KpiTone = "default" | "good" | "warn" | "bad" | "accent";

const VALUE_COLOR: Record<KpiTone, string> = {
  default: "text-[var(--ui-title)]",
  good: "text-[var(--ui-green)]",
  warn: "text-[var(--ui-yellow)]",
  bad: "text-[var(--ui-red)]",
  accent: "text-[var(--ui-accent)]",
};

const SUB_COLOR: Record<KpiTone, string> = {
  default: "text-[var(--ui-muted)]",
  good: "text-[var(--ui-green)]",
  warn: "text-[var(--ui-yellow)]",
  bad: "text-[var(--ui-red)]",
  accent: "text-[var(--ui-accent)]",
};

/**
 * Uniform KPI tile used across the dashboard metric bands. One label / value /
 * sub-line shape with a single tone scale, so every metric reads consistently.
 * When `href` is set the whole tile becomes a navigation affordance.
 */
export function KpiTile({
  label,
  value,
  sub,
  tone = "default",
  subTone = "default",
  href,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: KpiTone;
  subTone?: KpiTone;
  href?: string;
}) {
  const inner = (
    <>
      <p className="text-xs uppercase tracking-wide text-[var(--ui-muted)]">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${VALUE_COLOR[tone]}`}>{value}</p>
      {sub != null ? <p className={`mt-1 text-xs ${SUB_COLOR[subTone]}`}>{sub}</p> : null}
    </>
  );

  const base = "block rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4";

  if (href) {
    return (
      <Link
        href={href}
        className={`${base} transition-colors hover:border-[var(--ui-accent)] hover:bg-[var(--ui-card-bg)]`}
      >
        {inner}
      </Link>
    );
  }
  return <div className={base}>{inner}</div>;
}
