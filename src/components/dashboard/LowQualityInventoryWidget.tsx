"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { WidgetHeader } from "@/components/dashboard/WidgetHeader";
import { rubricScoreColor } from "@/lib/listing-rubric";

type LowQualityItem = {
  id: number;
  item_number: string | null;
  title: string;
  score: number;
};

export function LowQualityInventoryWidget() {
  const [items, setItems] = useState<LowQualityItem[] | null>(null);
  const [threshold, setThreshold] = useState<number>(85);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/low-quality-inventory", {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return;
      const data = (await res.json().catch(() => ({}))) as {
        items?: LowQualityItem[];
        threshold?: number;
      };
      setItems(data.items ?? []);
      if (typeof data.threshold === "number") setThreshold(data.threshold);
    } catch {
      /* silently degrade */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <article className="h-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
      <WidgetHeader
        title="Low quality listings"
        subtitle={`score < ${threshold} · excludes sold & retired`}
        href="/inventory"
        viewLabel="View inventory"
      />

      {loading ? (
        <div className="space-y-1.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-5 animate-pulse rounded bg-[var(--ui-border)]" />
          ))}
        </div>
      ) : !items || items.length === 0 ? (
        <p className="py-4 text-center text-xs text-[var(--ui-muted)]">
          All active listings are above the quality threshold.
        </p>
      ) : (
        <ul className="max-h-56 overflow-y-auto space-y-0 divide-y divide-[var(--ui-border)]/40">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/inventory?itemId=${item.id}`}
                className="flex items-center justify-between gap-2 py-1.5 text-xs text-[var(--ui-body)] hover:text-[var(--ui-accent)]"
              >
                <span className="min-w-0 truncate">
                  {item.item_number ? (
                    <span className="mr-1.5 font-mono text-[var(--ui-muted)]">{item.item_number}</span>
                  ) : null}
                  {item.title}
                </span>
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{
                    color: rubricScoreColor(item.score),
                    backgroundColor: `${rubricScoreColor(item.score)}22`,
                  }}
                  aria-label={`Quality score ${item.score}`}
                >
                  {item.score}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
