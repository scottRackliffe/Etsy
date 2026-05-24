"use client";

import { useState, useCallback } from "react";

export function usePagination(initialPageSize = 25) {
  const [page, setPageRaw] = useState(0);
  const [pageSize] = useState(initialPageSize);
  const [total, setTotal] = useState(0);

  const setPage = useCallback((p: number) => setPageRaw(Math.max(0, p)), []);

  const offset = page * pageSize;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasMore = offset + pageSize < total;

  return { page, pageSize, offset, total, totalPages, hasMore, setPage, setTotal };
}
