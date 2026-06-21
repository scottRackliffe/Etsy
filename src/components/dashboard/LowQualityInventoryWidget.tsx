"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type LowQualityItem = {
  id: number;
  item_number: string | null;
  title: string;
  score: number;
};

type ApiResponse = {
  ok: boolean;
  items: LowQualityItem[];
  threshold: number;
};

export function LowQualityInventoryWidget({ embedded = false }: { embedded?: boolean }) {
  const [items, setItems] = useState<LowQualityItem[]>([]);
  const [threshold, setThreshold] = useState<number>(80);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/low-quality-inventory", {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const data = (await res.json()) as ApiResponse;
      setItems(data.items ?? []);
      setThreshold(data.threshold ?? 80);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const wrapperClass = embedded
    ? "h-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4"
    : "rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm";

  function scoreColor(score: number): string {
    if (score >= 60) return "var(--ui-yellow)";
    return "var(--ui-red)";
  }

  const inner = (
    <>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3
          className={
            embedded
              ? "text-xs uppercase tracking-wide text-[var(--ui-muted)]"
              : "text-lg font-semibold text-[var(--ui-title)]"
          }
        >
          Needs work
        </h3>
        {!loading && !failed && (
          <p className="text-xs text-[var(--ui-muted)]">
            {items.length === 0
              ? `All active items meet quality ${threshold}`
              : `${items.length} item${items.length !== 1 ? "s" : ""} below quality ${threshold}`}
          </p>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-[var(--ui-border)]" />
          ))}
        </div>
      ) : failed ? (
        <p className="text-sm text-[var(--ui-muted)]">Could not load inventory quality data.</p>
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-sm text-[var(--ui-green)]">
          All active items meet the quality threshold.
        </p>
      ) : (
        <ul className="max-h-64 overflow-y-auto divide-y divide-[var(--ui-border)]">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/inventory?itemId=${item.id}`}
                className="flex items-center gap-3 px-1 py-2 text-sm hover:bg-[var(--ui-border)]/30 transition-colors"
              >
                {item.item_number && (
                  <span className="shrink-0 font-mono text-xs text-[var(--ui-muted)]">
                    {item.item_number}
                  </span>
                )}
                <span
                  className="min-w-0 flex-1 truncate text-[var(--ui-body)]"
                  title={item.title}
                >
                  {item.title}
                </span>
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold"
                  style={{
                    color: scoreColor(item.score),
                    border: `1px solid ${scoreColor(item.score)}`,
                  }}
                >
                  {item.score}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  if (embedded) {
    return <div className={wrapperClass}>{inner}</div>;
  }
  return <section className={wrapperClass}>{inner}</section>;
}
