"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InlineEditableCell, type InlineEditType } from "@/components/ui/InlineEditableCell";
import { addNotificationEntry } from "@/lib/notifications";

export type Column<T> = {
  key: string;
  header: string;
  sortable?: boolean;
  sortKey?: string;
  render?: (row: T, index: number) => React.ReactNode;
  className?: string;
  editable?: boolean;
  editType?: InlineEditType;
  editOptions?: { value: string; label: string }[];
  getEditValue?: (row: T) => string | number | boolean;
  getDisplayValue?: (row: T) => React.ReactNode;
};

export type SortState = { key: string; dir: "asc" | "desc" } | null;

export type DataTableSelection = {
  selectedIds: Set<number>;
  onToggleRow: (id: number) => void;
  onToggleAllVisible: () => void;
  allVisibleSelected: boolean;
  indeterminate: boolean;
};

export type InlineEditResult<T> =
  | { status: "success"; patch: Partial<T> }
  | { status: "error"; message: string }
  | { status: "stale" };

type ActiveCell = { rowIndex: number; columnKey: string };

export function DataTable<T extends { id?: number | string }>({
  columns,
  data,
  onRowClick,
  selectedId,
  selection,
  emptyMessage = "No records found.",
  rowKey,
  sort,
  onSortChange,
  scrollToId,
  keyboardNav = false,
  onDeleteRow,
  onInlineEdit,
  onRowPatched,
}: {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  selectedId?: number | string | null;
  selection?: DataTableSelection;
  emptyMessage?: string;
  rowKey?: (row: T, index: number) => string | number;
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  scrollToId?: number | string | null;
  keyboardNav?: boolean;
  onDeleteRow?: (row: T) => void;
  onInlineEdit?: (
    row: T,
    columnKey: string,
    value: string | number | boolean
  ) => Promise<InlineEditResult<T>>;
  onRowPatched?: (rowId: number, patch: Partial<T>) => void;
}) {
  const scrolledRef = useRef<number | string | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const [busyCell, setBusyCell] = useState<ActiveCell | null>(null);
  const [flashCell, setFlashCell] = useState<ActiveCell | null>(null);

  const editableColumnKeys = useMemo(
    () => columns.filter((col) => col.editable && col.editType).map((col) => col.key),
    [columns]
  );

  useEffect(() => {
    scrolledRef.current = null;
  }, [scrollToId]);

  useEffect(() => {
    if (selectedId == null) return;
    const idx = data.findIndex((row) => row.id === selectedId);
    if (idx >= 0) setFocusIndex(idx);
  }, [selectedId, data]);

  const cellKey = (rowIndex: number, columnKey: string) => `${rowIndex}:${columnKey}`;

  const flashSuccess = useCallback((rowIndex: number, columnKey: string) => {
    const target = { rowIndex, columnKey };
    setFlashCell(target);
    window.setTimeout(() => {
      setFlashCell((current) =>
        current?.rowIndex === target.rowIndex && current.columnKey === target.columnKey
          ? null
          : current
      );
    }, 400);
  }, []);

  const moveEditableCell = useCallback(
    (rowIndex: number, columnKey: string, backward: boolean) => {
      const colIdx = editableColumnKeys.indexOf(columnKey);
      if (colIdx < 0) {
        setActiveCell(null);
        return;
      }
      let nextRow = rowIndex;
      let nextColIdx = backward ? colIdx - 1 : colIdx + 1;
      if (nextColIdx >= editableColumnKeys.length) {
        nextColIdx = 0;
        nextRow = Math.min(data.length - 1, rowIndex + 1);
      } else if (nextColIdx < 0) {
        nextColIdx = editableColumnKeys.length - 1;
        nextRow = Math.max(0, rowIndex - 1);
      }
      setActiveCell({ rowIndex: nextRow, columnKey: editableColumnKeys[nextColIdx] });
    },
    [data.length, editableColumnKeys]
  );

  const handleCommit = useCallback(
    async (rowIndex: number, columnKey: string, value: string | number | boolean) => {
      if (!onInlineEdit) {
        setActiveCell(null);
        return;
      }
      const row = data[rowIndex];
      if (!row) {
        setActiveCell(null);
        return;
      }
      const target = { rowIndex, columnKey };
      setBusyCell(target);
      try {
        const result = await onInlineEdit(row, columnKey, value);
        if (result.status === "success") {
          if (typeof row.id === "number") onRowPatched?.(row.id, result.patch);
          flashSuccess(rowIndex, columnKey);
          setActiveCell(null);
          return;
        }
        if (result.status === "stale") {
          addNotificationEntry({
            type: "error",
            message:
              "This record was modified by another process. Reload to see the latest version.",
          });
        } else {
          addNotificationEntry({ type: "error", message: result.message });
        }
      } finally {
        setBusyCell(null);
        setActiveCell(null);
      }
    },
    [data, flashSuccess, onInlineEdit, onRowPatched]
  );

  const handleTableKeyDown = (event: React.KeyboardEvent) => {
    if (activeCell) return;
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
    return <div className="py-8 text-center text-sm text-[var(--ui-muted)]">{emptyMessage}</div>;
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

  const renderCellContent = (row: T, rowIndex: number, col: Column<T>) => {
    if (col.render) return col.render(row, rowIndex);
    if (col.editable && col.editType && onInlineEdit) {
      const editing = activeCell?.rowIndex === rowIndex && activeCell.columnKey === col.key;
      const busy = busyCell?.rowIndex === rowIndex && busyCell.columnKey === col.key;
      const flash = flashCell?.rowIndex === rowIndex && flashCell.columnKey === col.key;
      const rawValue = col.getEditValue
        ? col.getEditValue(row)
        : ((row as Record<string, unknown>)[col.key] as string | number | boolean);
      const display = col.getDisplayValue ? col.getDisplayValue(row) : String(rawValue ?? "—");
      return (
        <InlineEditableCell
          editType={col.editType}
          value={rawValue}
          display={display}
          options={col.editOptions}
          editing={editing}
          busy={busy}
          flash={flash}
          autoFocus={editing}
          onStartEdit={() => {
            setActiveCell({ rowIndex, columnKey: col.key });
          }}
          onCancel={() => {
            setActiveCell(null);
          }}
          onCommit={(value) => void handleCommit(rowIndex, col.key, value)}
          onTabNext={(shiftKey) => {
            moveEditableCell(rowIndex, col.key, shiftKey);
          }}
        />
      );
    }
    if (col.getDisplayValue) return col.getDisplayValue(row);
    return String((row as Record<string, unknown>)[col.key] ?? "");
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
            {selection ? (
              <th scope="col" className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  checked={selection.allVisibleSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = selection.indeterminate;
                  }}
                  onChange={selection.onToggleAllVisible}
                  aria-label="Select all rows on this page"
                />
              </th>
            ) : null}
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
            const key = rowKey ? rowKey(row, idx) : (row.id ?? idx);
            const rowId = typeof row.id === "number" ? row.id : null;
            const isMultiSelected = rowId != null && selection?.selectedIds.has(rowId);
            const isSelected =
              isMultiSelected ||
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
                  isMultiSelected
                    ? "bg-[var(--ui-accent)]/10"
                    : isSelected
                      ? "bg-[var(--ui-accent)]/15"
                      : idx % 2 === 0
                        ? "bg-[var(--ui-list-dark)]"
                        : "bg-[var(--ui-list-light)]"
                } hover:bg-[var(--ui-list-hover)]`}
              >
                {selection && rowId != null ? (
                  <td className="w-10 px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selection.selectedIds.has(rowId)}
                      onChange={() => selection.onToggleRow(rowId)}
                      aria-label={`Select row ${rowId}`}
                    />
                  </td>
                ) : null}
                {columns.map((col) => (
                  <td
                    key={cellKey(idx, col.key)}
                    className={`px-3 py-2 text-[var(--ui-body)] ${col.className ?? ""}`}
                  >
                    {renderCellContent(row, idx, col)}
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
