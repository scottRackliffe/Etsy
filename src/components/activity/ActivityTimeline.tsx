"use client";

import { useCallback, useEffect, useState } from "react";
import {
  formatActivityAction,
  formatActivityDetail,
  formatActivityTimestamp,
  type ActivityItem,
} from "@/lib/activity-display";

export function ActivityTimeline({
  entityType,
  entityId,
  limit = 5,
}: {
  entityType: string;
  entityId: number;
  limit?: number;
}) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        entity_type: entityType,
        entity_id: String(entityId),
        limit: String(limit),
      });
      const response = await fetch(`/api/activity?${params}`, {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as { items?: ActivityItem[] };
      if (response.ok) setItems(data.items ?? []);
      else setItems([]);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-xs text-[var(--ui-muted)]">Loading activity…</p>;
  }

  if (items.length === 0) {
    return (
      <p className="text-xs text-[var(--ui-muted)]">No activity recorded for this record yet.</p>
    );
  }

  return (
    <ul className="space-y-2 border-t border-[var(--ui-border)] pt-3">
      {items.map((entry) => {
        const detail = formatActivityDetail(entry.detail);
        return (
          <li key={entry.id} className="text-xs">
            <div className="flex flex-wrap justify-between gap-1">
              <span className="font-medium text-[var(--ui-title)]">
                {formatActivityAction(entry.action)}
              </span>
              <time className="text-[var(--ui-muted)]">
                {formatActivityTimestamp(entry.created_at)}
              </time>
            </div>
            {detail ? <p className="mt-0.5 text-[var(--ui-muted)]">{detail}</p> : null}
            <p className="mt-0.5 text-[10px] uppercase tracking-wide text-[var(--ui-muted)]">
              {entry.source}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
