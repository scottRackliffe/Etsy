"use client";

import { useEffect, useRef, useState } from "react";

export type Column<T> = {
  key: string;
  header: string;
  sortable?: boolean;
  sortKey?: string;
  render?: (row: T, index: number) => React.ReactNode;
  className?: string;
};

export type SortState = { key: string; dir: "asc" | "desc" } | null;

export function DataTable<T extends { id?: number | string }>({
  columns,
  data,
  onRowClick,
  selectedId,
  emptyMessage = "No records found.",
  rowKey,
  sort,
  onSortChange,
  scrollToId,
  keyboardNav = false,
  onDeleteRow,
}: {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  selectedId?: number | string | null;
  emptyMessage?: string;
  rowKey?: (row: T, index: number) => string | number;
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  scrollToId?: number | string | null;
  keyboardNav?: boolean;
  onDeleteRow?: (row: T) => void;
}) {
  const scrolledRef = useRef<number | string | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);

  useEffect(() => {
    scrolledRef.current = null;
  }, [scrollToId]);

  useEffect(() => {
    if (selectedId == null) return;
    const idx = data.findIndex((row) => row.id === selectedId);
    if (idx >= 0) setFocusIndex(idx);
  }, [selectedId, data]);

  const handleTableKeyDown = (event: React.KeyboardEvent) => {
    if (!keyboardNav || data.length === 0) return;
    const max = data.length - 1;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setFocusIndex((i) => Math.min(max, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setFocusIndex((i) => Math.max(0, i - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setFocusIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setFocusIndex(max);
    } else if (event.key === "PageDown") {
      event.preventDefault();
      setFocusIndex((i) => Math.min(max, i + 10));
    } else if (event.key === "PageUp") {
      event.preventDefault();
      setFocusIndex((i) => Math.max(0, i - 10));
    } else if (event.key === "Enter") {
      event.preventDefault();
      onRowClick?.(data[focusIndex]);
    } else if ((event.key === "Delete" || event.key === "Backspace") && onDeleteRow) {
      event.preventDefault();
      onDeleteRow(data[focusIndex]);
    }
  };

  if (data.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-[var(--ui-muted)]">{emptyMessage}</div>
    );
  }

  const handleSort = (col: Column<T>) => {
    if (!col.sortable || !onSortChange) return;
    const key = col.sortKey ?? col.key;
    if (sort?.key !== key) {
      onSortChange({ key, dir: "asc" });
      return;
    }
    if (sort.dir === "asc") {
      onSortChange({ key, dir: "desc" });
      return;
    }
    onSortChange(null);
  };

  const sortIndicator = (col: Column<T>) => {
    const key = col.sortKey ?? col.key;
    if (sort?.key !== key) return null;
    return sort.dir === "asc" ? " ▲" : " ▼";
  };

  return (
    <div
      className="overflow-x-auto rounded-lg border border-[var(--ui-border)] outline-none focus:ring-2 focus:ring-[var(--ui-accent)]/40"
      tabIndex={keyboardNav ? 0 : undefined}
      onKeyDown={handleTableKeyDown}
      role={keyboardNav ? "grid" : undefined}
    >
      <table className="w-full text-sm" role="table">
        <thead>
          <tr className="border-b border-[var(--ui-border)] bg-[var(--ui-panel-bg)]">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                aria-sort={
                  col.sortable && sort?.key === (col.sortKey ?? col.key)
                    ? sort.dir === "asc"
                      ? "ascending"
                      : "descending"
                    : col.sortable
                      ? "none"
                      : undefined
                }
                className={`px-3 py-2 text-left font-medium text-[var(--ui-muted)] ${col.className ?? ""} ${
                  col.sortable ? "cursor-pointer select-none hover:text-[var(--ui-title)]" : ""
                }`}
                onClick={() => handleSort(col)}
              >
                {col.header}
                {sortIndicator(col)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => {
            const key = rowKey ? rowKey(row, idx) : row.id ?? idx;
            const isSelected =
              (selectedId != null && row.id === selectedId) ||
              (keyboardNav && idx === focusIndex);
            return (
              <tr
                key={key}
                ref={(el) => {
                  if (
                    scrollToId != null &&
                    row.id === scrollToId &&
                    el &&
                    scrolledRef.current !== scrollToId
                  ) {
                    scrolledRef.current = scrollToId;
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                  }
                }}
                onClick={() => onRowClick?.(row)}
                className={`border-b border-[var(--ui-border)] transition-colors ${
                  onRowClick ? "cursor-pointer" : ""
                } ${
                  isSelected
                    ? "bg-[var(--ui-accent)]/15"
                    : idx % 2 === 0
                      ? "bg-[var(--ui-list-dark)]"
                      : "bg-[var(--ui-list-light)]"
                } hover:bg-[var(--ui-list-hover)]`}
              >
                {columns.map((col) => (
                  <td key={col.key} className={`px-3 py-2 text-[var(--ui-body)] ${col.className ?? ""}`}>
                    {col.render
                      ? col.render(row, idx)
                      : String((row as Record<string, unknown>)[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
