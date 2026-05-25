"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ActivityItem = {
  id: number;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  entity_label: string | null;
  source: string;
  created_at: string;
};

function formatAction(action: string): string {
  return action
    .replace(/\./g, " · ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function entityHref(entityType: string | null, entityId: number | null): string | null {
  if (!entityType || entityId == null) return null;
  switch (entityType) {
    case "order":
      return `/sales?orderId=${entityId}`;
    case "inventory":
      return `/inventory?itemId=${entityId}`;
    case "customer":
      return `/customers?customerId=${entityId}`;
    default:
      return null;
  }
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ActivityFeed() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/activity?limit=20", {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as {
        items?: ActivityItem[];
      };
      if (!response.ok) {
        setError("Could not load recent activity.");
        setItems([]);
        return;
      }
      setItems(data.items ?? []);
    } catch {
      setError("Could not load recent activity.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ui-border)] px-5 py-4">
        <div>
          <h3 className="text-lg font-semibold text-[var(--ui-title)]">Recent activity</h3>
          <p className="text-sm text-[var(--ui-muted)]">Latest changes across orders, inventory, and customers.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-2 py-1 text-xs text-[var(--ui-muted)] disabled:opacity-60"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-10 animate-pulse rounded-lg bg-[var(--ui-list-light)]" />
          ))}
        </div>
      ) : error ? (
        <p className="p-5 text-sm text-[var(--ui-red)]">{error}</p>
      ) : items.length === 0 ? (
        <p className="p-10 text-center text-sm text-[var(--ui-muted)]">No activity recorded yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--ui-border)]/70">
          {items.map((entry) => {
            const href = entityHref(entry.entity_type, entry.entity_id);
            return (
              <li key={entry.id} className="px-5 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-[var(--ui-title)]">{formatAction(entry.action)}</p>
                  <time className="text-xs text-[var(--ui-muted)]">{formatTimestamp(entry.created_at)}</time>
                </div>
                {entry.entity_label ? (
                  href ? (
                    <Link href={href} className="mt-0.5 text-xs text-[var(--ui-accent)] hover:underline">
                      {entry.entity_label}
                    </Link>
                  ) : (
                    <p className="mt-0.5 text-xs text-[var(--ui-body)]">{entry.entity_label}</p>
                  )
                ) : null}
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-[var(--ui-muted)]">{entry.source}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
