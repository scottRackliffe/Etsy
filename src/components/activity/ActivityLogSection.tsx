"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePagination } from "@/hooks/usePagination";
import {
  activityEntityHref,
  formatActivityAction,
  formatActivityDetail,
  formatActivityTimestamp,
  type ActivityItem,
} from "@/lib/activity-display";

const ENTITY_FILTERS = [
  { value: "inventory", label: "Inventory" },
  { value: "order", label: "Orders" },
  { value: "customer", label: "Customers" },
  { value: "sync", label: "Sync" },
  { value: "system", label: "System" },
  { value: "backup", label: "Backup" },
];

export function ActivityLogSection({ id }: { id?: string }) {
  const [entityFilter, setEntityFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const { page, pageSize, offset, total, setPage, setTotal } = usePagination(25);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
      });
      if (entityFilter) params.set("entity_type", entityFilter);
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      const response = await fetch(`/api/activity?${params}`, {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as {
        items?: ActivityItem[];
        pagination?: { total: number };
      };
      if (!response.ok) {
        setItems([]);
        setTotal(0);
        return;
      }
      setItems(data.items ?? []);
      setTotal(data.pagination?.total ?? data.items?.length ?? 0);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [pageSize, offset, entityFilter, debouncedSearch, setTotal]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(0);
  }, [entityFilter, debouncedSearch, setPage]);

  return (
    <section
      id={id}
      className="overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] shadow-sm"
    >
      <div className="border-b border-[var(--ui-border)] px-5 py-4">
        <h3 className="text-lg font-semibold text-[var(--ui-title)]">Activity log</h3>
        <p className="text-sm text-[var(--ui-muted)]">Audit trail of changes across the app.</p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[12rem] text-sm">
            <span className="mb-1 block text-[var(--ui-muted)]">Search</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Record label or action…"
              className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-2 py-2 text-xs text-[var(--ui-muted)] disabled:opacity-60"
          >
            Refresh
          </button>
        </div>
        <div className="mt-3">
          <FilterChipRow
            label="Entity type"
            value={entityFilter}
            onChange={setEntityFilter}
            options={ENTITY_FILTERS}
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="h-10 animate-pulse rounded-lg bg-[var(--ui-list-light)]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          message="No activity matches your filters."
          primaryAction={{
            label: "Clear filters",
            onClick: () => {
              setEntityFilter(null);
              setSearch("");
            },
          }}
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--ui-border)] bg-[var(--ui-panel-bg)] text-xs uppercase tracking-wide text-[var(--ui-muted)]">
                  <th className="px-5 py-3 font-semibold">Time</th>
                  <th className="px-5 py-3 font-semibold">Action</th>
                  <th className="px-5 py-3 font-semibold">Record</th>
                  <th className="px-5 py-3 font-semibold">Details</th>
                  <th className="px-5 py-3 font-semibold">Source</th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry, i) => {
                  const href = activityEntityHref(entry.entity_type, entry.entity_id);
                  const detail = formatActivityDetail(entry.detail);
                  return (
                    <tr
                      key={entry.id}
                      className="border-b border-[var(--ui-border)]/70"
                      style={{
                        backgroundColor: i % 2 === 0 ? "var(--ui-list-dark)" : "var(--ui-list-light)",
                      }}
                    >
                      <td className="px-5 py-3 text-xs text-[var(--ui-muted)] whitespace-nowrap">
                        {formatActivityTimestamp(entry.created_at)}
                      </td>
                      <td className="px-5 py-3 font-medium text-[var(--ui-title)]">
                        {formatActivityAction(entry.action)}
                      </td>
                      <td className="px-5 py-3">
                        {entry.entity_label && href ? (
                          <Link href={href} className="text-[var(--ui-accent)] hover:underline">
                            {entry.entity_label}
                          </Link>
                        ) : (
                          <span className="text-[var(--ui-body)]">{entry.entity_label ?? "—"}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 max-w-xs truncate text-xs text-[var(--ui-muted)]">
                        {detail ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-xs uppercase text-[var(--ui-muted)]">{entry.source}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-[var(--ui-border)] px-5 py-3">
            <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
          </div>
        </>
      )}
    </section>
  );
}
