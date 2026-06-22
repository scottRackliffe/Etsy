"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
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
  { value: "customer,address", label: "Customers" },
  { value: "receipt", label: "Receipts" },
  { value: "vendor", label: "Vendors" },
  { value: "communication", label: "Communications" },
  { value: "expense,tax_payment", label: "Expenses" },
  { value: "report", label: "Reports" },
  { value: "shipping", label: "Shipping" },
  { value: "setting", label: "Settings" },
  { value: "sync", label: "Sync" },
  { value: "system", label: "System" },
  { value: "backup", label: "Backup" },
];

/** Dashboard compact view: sized to fill the activity row beside Recent Activity. */
const COMPACT_DASHBOARD_PAGE_SIZE = 19;

export function ActivityLogSection({
  id,
  compact = false,
  pageSize: pageSizeProp,
}: {
  id?: string;
  compact?: boolean;
  pageSize?: number;
}) {
  const [entityFilter, setEntityFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const initialPageSize = pageSizeProp ?? (compact ? COMPACT_DASHBOARD_PAGE_SIZE : 25);
  const { page, pageSize, offset, total, setPage, setTotal } = usePagination(initialPageSize);
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
      className={`overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] shadow-sm ${compact ? "flex h-full min-h-0 flex-col" : ""}`}
    >
      <div className={`shrink-0 border-b border-[var(--ui-border)] ${compact ? "px-3 py-2" : "px-5 py-4"}`}>
        <h3 className={`font-semibold text-[var(--ui-title)] ${compact ? "text-base" : "text-lg"}`}>
          Activity log
        </h3>
        {!compact && (
          <p className="text-sm text-[var(--ui-muted)]">Audit trail of changes across the app.</p>
        )}
        <div className={`flex flex-wrap items-end gap-2 ${compact ? "mt-1.5" : "mt-3 gap-3"}`}>
          <label className={`${compact ? "min-w-[7rem] flex-1 text-xs" : "min-w-[12rem] flex-1 text-sm"}`}>
            {!compact && <span className="mb-1 block text-[var(--ui-muted)]">Search</span>}
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Record label or action…"
              aria-label="Search activity log"
              className={`w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] text-[var(--ui-body)] shadow-inner focus:border-[var(--ui-accent)] focus:outline-none ${compact ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm"}`}
            />
          </label>
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </div>
        <div className={compact ? "mt-1.5" : "mt-3"}>
          <FilterChipRow
            label="Entity type"
            value={entityFilter}
            onChange={setEntityFilter}
            options={ENTITY_FILTERS}
          />
        </div>
      </div>

      {loading ? (
        <div className={`space-y-1 ${compact ? "px-2 py-1" : "space-y-2 p-5"}`}>
          {Array.from({ length: compact ? 8 : 6 }).map((_, idx) => (
            <div
              key={idx}
              className={`animate-pulse rounded bg-[var(--ui-list-light)] ${compact ? "h-[18px]" : "h-10 rounded-lg"}`}
            />
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
        <div className={compact ? "flex min-h-0 flex-1 flex-col" : undefined}>
          <div
            className={`overflow-x-auto ${compact ? "min-h-0 flex-1 overflow-y-auto px-2 py-1" : ""}`}
          >
            <table
              className={`w-full text-left ${compact ? "min-w-0 text-xs leading-tight" : "min-w-[640px] text-sm"}`}
            >
              <thead>
                <tr className="border-b border-[var(--ui-border)] bg-[var(--ui-panel-bg)] text-[10px] font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
                  <th className={`font-semibold ${compact ? "px-2 pb-1 pt-0" : "px-5 py-3"}`}>Time</th>
                  <th className={`font-semibold ${compact ? "px-2 pb-1 pt-0" : "px-5 py-3"}`}>Action</th>
                  <th className={`font-semibold ${compact ? "px-2 pb-1 pt-0" : "px-5 py-3"}`}>Record</th>
                  {!compact && (
                    <>
                      <th className="px-5 py-3 font-semibold">Details</th>
                      <th className="px-5 py-3 font-semibold">Source</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {items.map((entry, i) => {
                  const href = activityEntityHref(entry.entity_type, entry.entity_id, entry.action);
                  const detail = formatActivityDetail(entry.detail);
                  const cellPad = compact ? "px-2 py-0.5" : "px-5 py-3";
                  return (
                    <tr
                      key={entry.id}
                      className={`border-b ${compact ? "border-[var(--ui-border)]/30" : "border-[var(--ui-border)]/70"}`}
                      style={{
                        backgroundColor:
                          i % 2 === 0 ? "var(--ui-list-dark)" : "var(--ui-list-light)",
                      }}
                    >
                      <td
                        className={`whitespace-nowrap text-[var(--ui-muted)] ${compact ? "text-[10px]" : "text-xs"} ${cellPad}`}
                      >
                        {formatActivityTimestamp(entry.created_at)}
                      </td>
                      <td className={`font-medium text-[var(--ui-title)] ${cellPad}`}>
                        {formatActivityAction(entry.action)}
                      </td>
                      <td className={`min-w-0 ${cellPad}`}>
                        {entry.entity_label && href ? (
                          <Link
                            href={href}
                            className="block truncate text-[var(--ui-accent)] hover:underline"
                            title={entry.entity_label}
                          >
                            {entry.entity_label}
                          </Link>
                        ) : (
                          <span
                            className="block truncate text-[var(--ui-body)]"
                            title={entry.entity_label ?? undefined}
                          >
                            {entry.entity_label ?? "—"}
                          </span>
                        )}
                      </td>
                      {!compact && (
                        <>
                          <td className="max-w-xs truncate px-5 py-3 text-xs text-[var(--ui-muted)]">
                            {detail ?? "—"}
                          </td>
                          <td className="px-5 py-3 text-xs uppercase text-[var(--ui-muted)]">
                            {entry.source}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div
            className={`shrink-0 border-t border-[var(--ui-border)] ${compact ? "px-3 py-1.5" : "px-5 py-3"}`}
          >
            <PaginationBar
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              dense={compact}
            />
          </div>
        </div>
      )}
    </section>
  );
}
