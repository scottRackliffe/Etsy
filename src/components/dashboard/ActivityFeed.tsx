"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  activityEntityHref,
  formatActivityAction,
  formatActivityTimestamp,
  type ActivityItem,
} from "@/lib/activity-display";
import { usePagination } from "@/hooks/usePagination";

const COMPACT_LIMIT = 25;
const COMPACT_GRID_COLS = "grid-cols-[4.25rem_minmax(0,1fr)_auto]";
const COMPACT_COL_GAP = "gap-x-[0.3rem]";

function formatActivitySource(source: string): string {
  switch (source) {
    case "user":
      return "User";
    case "system":
      return "System";
    case "etsy_sync":
      return "Etsy";
    default:
      return source.replace(/_/g, " ");
  }
}

function formatCompactActivityText(entry: ActivityItem): string {
  const action = formatActivityAction(entry.action);
  return entry.entity_label ? `${action} · ${entry.entity_label}` : action;
}

function CompactActivityRows({ items }: { items: ActivityItem[] }) {
  return (
    <ul className="space-y-0">
      {items.map((entry) => {
        const href = activityEntityHref(entry.entity_type, entry.entity_id, entry.action);
        const activityText = formatCompactActivityText(entry);
        return (
          <li
            key={entry.id}
            className={`grid ${COMPACT_GRID_COLS} ${COMPACT_COL_GAP} items-start border-b border-[var(--ui-border)]/30 py-0.5 last:border-b-0`}
          >
            <time className="text-[10px] leading-tight text-[var(--ui-muted)] whitespace-nowrap">
              {formatActivityTimestamp(entry.created_at)}
            </time>
            <p
              className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs leading-tight text-[var(--ui-body)]"
              title={activityText}
            >
              <span className="font-medium text-[var(--ui-title)]">
                {formatActivityAction(entry.action)}
              </span>
              {entry.entity_label ? (
                <>
                  {" · "}
                  {href ? (
                    <Link
                      href={href}
                      className="text-[var(--ui-accent)] hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {entry.entity_label}
                    </Link>
                  ) : (
                    <span>{entry.entity_label}</span>
                  )}
                </>
              ) : null}
            </p>
            <span className="shrink-0 text-[10px] leading-tight text-[var(--ui-muted)] whitespace-nowrap">
              {formatActivitySource(entry.source)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ActivityFeed({
  onViewAll,
  compact = false,
}: {
  onViewAll?: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const bodyRef = useRef<HTMLDivElement>(null);
  const {
    pageSize: defaultPageSize,
    offset: defaultOffset,
    setTotal: setDefaultTotal,
  } = usePagination(10);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({
        limit: String(compact ? COMPACT_LIMIT : defaultPageSize),
      });
      if (!compact && defaultOffset > 0) {
        params.set("offset", String(defaultOffset));
      }
      const response = await fetch(`/api/activity?${params}`, {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as {
        items?: ActivityItem[];
        pagination?: { total: number };
      };
      if (!response.ok) {
        setLoadError("Could not load recent activity.");
        setItems([]);
        if (!compact) {
          setDefaultTotal(0);
        }
        return;
      }
      setItems(data.items ?? []);
      if (!compact) {
        setDefaultTotal(data.pagination?.total ?? data.items?.length ?? 0);
      }
    } catch {
      setLoadError("Could not load recent activity.");
      setItems([]);
      if (!compact) {
        setDefaultTotal(0);
      }
    } finally {
      setLoading(false);
    }
  }, [compact, defaultPageSize, defaultOffset, setDefaultTotal]);

  useEffect(() => {
    void load();
  }, [load]);

  const columnHeader = (
    <div
      className={`sticky top-0 z-10 grid ${COMPACT_GRID_COLS} ${COMPACT_COL_GAP} items-center border-b border-[var(--ui-border)]/50 bg-[var(--ui-card-bg)] pb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--ui-muted)]`}
    >
      <span>Time</span>
      <span>Activity</span>
      <span className="text-right">Originator</span>
    </div>
  );

  return (
    <>
      <section
        className={`overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] shadow-sm ${compact ? "flex h-full min-h-0 flex-col" : ""}`}
      >
        <div
          className={`flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--ui-border)] ${compact ? "px-3 py-2" : "px-5 py-4"}`}
        >
          <div>
            <h3
              className={`font-semibold text-[var(--ui-title)] ${compact ? "text-base" : "text-lg"}`}
            >
              Recent activity
            </h3>
            {!compact && (
              <p className="text-sm text-[var(--ui-muted)]">
                Latest changes across orders, inventory, and customers.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {onViewAll ? (
              <Button variant="ghost" size="sm" onClick={onViewAll}>
                View all →
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>

        {loadError ? (
          <p className="p-5 text-sm text-[var(--ui-red)]">{loadError}</p>
        ) : compact ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div
              ref={bodyRef}
              className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-1"
            >
              {columnHeader}
              {loading ? (
                <div className="space-y-1 py-1">
                  {Array.from({ length: 8 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="h-[18px] animate-pulse rounded bg-[var(--ui-list-light)]"
                    />
                  ))}
                </div>
              ) : items.length === 0 ? (
                <EmptyState
                  message="No recent activity yet. Add inventory or process an order to get started."
                  primaryAction={{
                    label: "Go to Inventory",
                    onClick: () => router.push("/inventory"),
                  }}
                  secondaryAction={{
                    label: "View orders",
                    onClick: () => router.push("/orders"),
                    variant: "secondary",
                  }}
                />
              ) : (
                <CompactActivityRows items={items.slice(0, COMPACT_LIMIT)} />
              )}
            </div>
          </div>
        ) : loading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="h-10 animate-pulse rounded-lg bg-[var(--ui-list-light)]" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            message="No recent activity yet. Add inventory or process an order to get started."
            primaryAction={{ label: "Go to Inventory", onClick: () => router.push("/inventory") }}
            secondaryAction={{
              label: "View orders",
              onClick: () => router.push("/orders"),
              variant: "secondary",
            }}
          />
        ) : (
          <ul className="divide-y divide-[var(--ui-border)]/70">
            {items.map((entry) => {
              const href = activityEntityHref(entry.entity_type, entry.entity_id, entry.action);
              return (
                <li key={entry.id} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium text-[var(--ui-title)]">
                      {formatActivityAction(entry.action)}
                    </p>
                    <time className="text-xs text-[var(--ui-muted)]">
                      {formatActivityTimestamp(entry.created_at)}
                    </time>
                  </div>
                  {entry.entity_label ? (
                    href ? (
                      <Link
                        href={href}
                        className="mt-0.5 text-xs text-[var(--ui-accent)] hover:underline"
                      >
                        {entry.entity_label}
                      </Link>
                    ) : (
                      <p className="mt-0.5 text-xs text-[var(--ui-body)]">{entry.entity_label}</p>
                    )
                  ) : null}
                  <p className="mt-0.5 text-[10px] uppercase tracking-wide text-[var(--ui-muted)]">
                    {entry.source}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
