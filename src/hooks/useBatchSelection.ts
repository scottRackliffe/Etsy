"use client";

import { useCallback, useMemo, useState } from "react";

const MAX_BATCH = 100;

export function useBatchSelection<T extends { id: number }>(
  visibleRows: T[],
  totalMatching: number
) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);

  const allVisibleSelected =
    visibleRows.length > 0 && visibleRows.every((row) => selectedIds.has(row.id));
  const someVisibleSelected = visibleRows.some((row) => selectedIds.has(row.id));
  const headerIndeterminate = someVisibleSelected && !allVisibleSelected;

  const selectionCount = selectAllMatching ? totalMatching : selectedIds.size;
  const canSelectAllMatching = totalMatching > 0 && totalMatching <= MAX_BATCH && allVisibleSelected;

  const toggleRow = useCallback((id: number) => {
    setSelectAllMatching(false);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllVisible = useCallback(() => {
    setSelectAllMatching(false);
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleRows.map((row) => row.id)));
    }
  }, [allVisibleSelected, visibleRows]);

  const selectAllMatchingRows = useCallback(() => {
    if (totalMatching > MAX_BATCH) return;
    setSelectAllMatching(true);
    setSelectedIds(new Set(visibleRows.map((row) => row.id)));
  }, [totalMatching, visibleRows]);

  const clearSelection = useCallback(() => {
    setSelectAllMatching(false);
    setSelectedIds(new Set());
  }, []);

  const selectedIdList = useMemo(() => [...selectedIds], [selectedIds]);

  return {
    selectedIds,
    selectedIdList,
    selectAllMatching,
    selectionCount,
    allVisibleSelected,
    someVisibleSelected,
    headerIndeterminate,
    canSelectAllMatching,
    selectAllMatchingTooLarge: totalMatching > MAX_BATCH,
    toggleRow,
    toggleAllVisible,
    selectAllMatchingRows,
    clearSelection,
    setSelectedIds,
    setSelectAllMatching,
    maxBatch: MAX_BATCH,
  };
}
