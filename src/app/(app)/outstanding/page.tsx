"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

type OutstandingItem = {
  type: string;
  type_label: string;
  label: string;
  target_tab: string;
  record_id: number | string;
  date: string | null;
};

const TYPE_VARIANTS: Record<string, "success" | "warning" | "error" | "info" | "neutral"> = {
  paid_not_shipped: "warning",
  unpaid: "error",
  not_listed: "info",
  missing_address: "error",
  missing_shipping_cost: "warning",
};

const AUTO_REFRESH_MS = 60_000;

export default function OutstandingPage() {
  const router = useRouter();
  const [items, setItems] = useState<OutstandingItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/outstanding", {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.user_message ?? "Failed to load outstanding items");
      }
      const data = (await res.json()) as {
        items: OutstandingItem[];
        counts: Record<string, number>;
      };
      setItems(data.items);
      setCounts(data.counts);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
    timerRef.current = setInterval(fetchItems, AUTO_REFRESH_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchItems]);

  const handleClick = (item: OutstandingItem) => {
    const paramKey =
      item.target_tab === "sales"
        ? "orderId"
        : item.target_tab === "inventory"
          ? "itemId"
          : "customerId";
    router.push(`/${item.target_tab}?${paramKey}=${item.record_id}`);
  };

  const filtered = filterType ? items.filter((i) => i.type === filterType) : items;

  const typeEntries = Object.entries(counts).sort(([, a], [, b]) => b - a);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--ui-title)]">
          Outstanding Tasks
          {items.length > 0 && (
            <span className="ml-2 text-sm font-normal text-[var(--ui-muted)]">
              ({items.length} total)
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            fetchItems();
          }}
          className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-neutral)] px-3 py-1.5 text-xs text-[var(--ui-body)] hover:bg-[var(--ui-border)]"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--ui-red)] bg-[var(--ui-red)]/10 px-4 py-2 text-sm text-[var(--ui-red)]">
          {error}
        </div>
      )}

      {/* Type filter chips */}
      {typeEntries.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilterType(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filterType === null
                ? "bg-[var(--ui-accent)] text-white"
                : "bg-[var(--ui-neutral)] text-[var(--ui-body)] hover:bg-[var(--ui-border)]"
            }`}
          >
            All ({items.length})
          </button>
          {typeEntries.map(([type, count]) => {
            const label = items.find((i) => i.type === type)?.type_label ?? type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setFilterType(filterType === type ? null : type)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filterType === type
                    ? "bg-[var(--ui-accent)] text-white"
                    : "bg-[var(--ui-neutral)] text-[var(--ui-body)] hover:bg-[var(--ui-border)]"
                }`}
              >
                {label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Outstanding items list */}
      {filtered.length === 0 ? (
        <EmptyState
          message={filterType ? "No items match this filter." : "No outstanding tasks right now."}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((item, idx) => (
            <button
              key={`${item.type}-${item.record_id}-${idx}`}
              type="button"
              onClick={() => handleClick(item)}
              className="flex w-full items-center gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-4 py-3 text-left transition-colors hover:border-[var(--ui-accent)]"
            >
              <Badge label={item.type_label} variant={TYPE_VARIANTS[item.type] ?? "neutral"} />
              <span className="flex-1 text-sm text-[var(--ui-body)]">{item.label}</span>
              {item.date && (
                <span className="shrink-0 text-xs text-[var(--ui-muted)]">{item.date}</span>
              )}
              <span className="shrink-0 text-xs text-[var(--ui-muted)]">→</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
