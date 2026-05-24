"use client";

export type Column<T> = {
  key: string;
  header: string;
  render?: (row: T, index: number) => React.ReactNode;
  className?: string;
};

export function DataTable<T extends { id?: number | string }>({
  columns,
  data,
  onRowClick,
  selectedId,
  emptyMessage = "No records found.",
  rowKey,
}: {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  selectedId?: number | string | null;
  emptyMessage?: string;
  rowKey?: (row: T, index: number) => string | number;
}) {
  if (data.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-[var(--ui-muted)]">{emptyMessage}</div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--ui-border)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--ui-border)] bg-[var(--ui-panel-bg)]">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-3 py-2 text-left font-medium text-[var(--ui-muted)] ${col.className ?? ""}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => {
            const key = rowKey ? rowKey(row, idx) : row.id ?? idx;
            const isSelected = selectedId != null && row.id === selectedId;
            return (
              <tr
                key={key}
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
