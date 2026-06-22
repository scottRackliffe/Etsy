"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode, type MutableRefObject } from "react";
import { DataTable, type Column, type DataTableSelection, type SortState } from "@/components/ui/DataTable";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";

/** Imperative controller so a parent (e.g. deep-link handler) can open/close records through the guard. */
export type SemsScreenController<T> = {
  /** Open a record in the editor (null = blank "Add New"). Routed through the dirty guard. */
  openRecord: (record: T | null) => void;
  /** Return to the list. Routed through the dirty guard. */
  closeToList: () => void;
  /** True when the editor is open. */
  isEditing: () => boolean;
};

type RenderEditorContext<T> = {
  /** The record being edited, or null for a new record. */
  record: T | null;
  /** Guarded close → return to the list (use for Cancel / Back; routes through the dirty guard). */
  requestClose: () => void;
  /** Unguarded close → return to the list after a successful save (form is already clean). */
  done: () => void;
};

/**
 * Standard Entity Management Screen scaffold (ADR-079).
 *
 * Region 1 (list): full-width `DataTable` with a horizontal filter bar slot, a pinned
 * "+ Add New <Entity>" first affordance, trailing Edit/Delete row actions, and
 * pagination. Single click selects (highlights); double-click or the Edit icon opens
 * the editor.
 *
 * Region 2 (editor): while editing, the list collapses to a compact header and the
 * entity's editor (supplied via `renderEditor`) is shown full width.
 *
 * All in-screen navigation (open a record, Add New, return to list) is routed through
 * `confirmLeave()` so the strict dirty guard applies uniformly.
 */
export function SemsScreen<T extends { id?: number | string }>({
  entityLabel,
  entityLabelPlural,
  columns,
  data,
  getRowTitle,
  sort,
  onSortChange,
  filters,
  pagination,
  emptyState,
  renderEditor,
  onDeleteRow,
  onOpenChange,
  addNewLabel,
  onAddNew,
  controllerRef,
  keyboardNav = true,
  batchSelection,
  onInlineEdit,
  onRowPatched,
  scrollToId,
}: {
  entityLabel: string;
  entityLabelPlural: string;
  columns: Column<T>[];
  data: T[];
  getRowTitle: (row: T) => string;
  sort: SortState;
  onSortChange: (sort: SortState) => void;
  filters?: ReactNode;
  pagination: { page: number; pageSize: number; total: number; onPageChange: (page: number) => void };
  emptyState?: ReactNode;
  renderEditor: (ctx: RenderEditorContext<T>) => ReactNode;
  onDeleteRow?: (row: T) => void;
  /** Notified when the open record changes (record or null). Use to load context panels / sync state. */
  onOpenChange?: (record: T | null) => void;
  addNewLabel?: string;
  /**
   * If provided, the "+ Add new" button calls this instead of opening a blank inline editor.
   * Use for entities whose create flow lives outside the SEMS scaffold (e.g. Inventory → Listing Coach).
   */
  onAddNew?: () => void;
  controllerRef?: MutableRefObject<SemsScreenController<T> | null>;
  keyboardNav?: boolean;
  /** Optional batch-selection state forwarded to DataTable (for entities that support batch operations). */
  batchSelection?: DataTableSelection;
  /** Optional inline-edit handler forwarded to DataTable. */
  onInlineEdit?: (row: T, columnKey: string, value: string | number | boolean) => Promise<import("@/components/ui/DataTable").InlineEditResult<T>>;
  /** Optional row-patched callback forwarded to DataTable. */
  onRowPatched?: (rowId: number, patch: Partial<T>) => void;
  /** Optional scroll-to-row id forwarded to DataTable. */
  scrollToId?: number | string | null;
}) {
  const { confirmLeave } = useUnsavedChanges();
  // editing === undefined → list mode; editing === null → new record; editing === T → editing record
  const [editing, setEditing] = useState<T | null | undefined>(undefined);
  const [highlightId, setHighlightId] = useState<number | string | null>(null);

  const openRecord = useCallback(
    (record: T | null) => {
      void (async () => {
        const ok = await confirmLeave();
        if (!ok) return;
        setEditing(record);
        setHighlightId(record?.id ?? null);
        onOpenChange?.(record);
      })();
    },
    [confirmLeave, onOpenChange]
  );

  const closeToList = useCallback(() => {
    void (async () => {
      const ok = await confirmLeave();
      if (!ok) return;
      setEditing(undefined);
      onOpenChange?.(null);
    })();
  }, [confirmLeave, onOpenChange]);

  const finishEditing = useCallback(() => {
    setEditing(undefined);
    onOpenChange?.(null);
  }, [onOpenChange]);

  useEffect(() => {
    if (!controllerRef) return;
    controllerRef.current = {
      openRecord,
      closeToList,
      isEditing: () => editing !== undefined,
    };
    return () => {
      if (controllerRef) controllerRef.current = null;
    };
  }, [controllerRef, openRecord, closeToList, editing]);

  const columnsWithActions = useMemo<Column<T>[]>(
    () => [
      ...columns,
      {
        key: "__sems_actions",
        header: "",
        className: "w-20 text-right",
        render: (row: T) => (
          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => openRecord(row)}
              title={`Edit ${entityLabel.toLowerCase()}`}
              aria-label={`Edit ${entityLabel.toLowerCase()}`}
              className="text-[var(--ui-muted)] hover:text-[var(--ui-accent)]"
            >
              <PencilIcon />
            </button>
            {onDeleteRow ? (
              <button
                type="button"
                onClick={() => onDeleteRow(row)}
                title={`Delete ${entityLabel.toLowerCase()}`}
                aria-label={`Delete ${entityLabel.toLowerCase()}`}
                className="text-[var(--ui-muted)] hover:text-[var(--ui-red)]"
              >
                <TrashIcon />
              </button>
            ) : null}
          </div>
        ),
      },
    ],
    [columns, entityLabel, onDeleteRow, openRecord]
  );

  if (editing !== undefined) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm">
          <button
            type="button"
            onClick={closeToList}
            className="font-medium text-[var(--ui-accent)] hover:underline"
          >
            &larr; All {entityLabelPlural.toLowerCase()}
          </button>
          <span className="text-[var(--ui-border)]">/</span>
          <span className="text-[var(--ui-muted)]">
            {editing === null ? `New ${entityLabel.toLowerCase()}` : getRowTitle(editing)}
          </span>
        </div>
        {renderEditor({ record: editing, requestClose: closeToList, done: finishEditing })}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filters}
      <button
        type="button"
        onClick={() => onAddNew ? onAddNew() : openRecord(null)}
        className="flex w-full items-center gap-2 rounded-lg border border-dashed border-[var(--ui-accent)]/50 bg-[var(--ui-accent)]/5 px-3 py-2 text-sm font-medium text-[var(--ui-accent)] transition-colors hover:bg-[var(--ui-accent)]/10"
      >
        <span className="text-base leading-none">+</span>
        {addNewLabel ?? `Add new ${entityLabel.toLowerCase()}`}
      </button>
      <DataTable
        columns={columnsWithActions}
        data={data}
        selectedId={highlightId}
        onRowClick={(row) => setHighlightId(row.id ?? null)}
        onRowDoubleClick={(row) => openRecord(row)}
        selection={batchSelection}
        sort={sort}
        onSortChange={(next) => onSortChange(next)}
        emptyMessage={`No ${entityLabelPlural.toLowerCase()} on this page.`}
        keyboardNav={keyboardNav}
        onInlineEdit={onInlineEdit}
        onRowPatched={onRowPatched}
        scrollToId={scrollToId}
      />
      <PaginationBar
        page={pagination.page}
        pageSize={pagination.pageSize}
        total={pagination.total}
        onPageChange={pagination.onPageChange}
      />
      {pagination.total === 0 && emptyState ? emptyState : null}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
