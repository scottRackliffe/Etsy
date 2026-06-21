"use client";

import { useEffect, useState, type RefObject } from "react";

export function useContainerPageSize(
  ref: RefObject<HTMLElement | null>,
  options: {
    rowHeight: number;
    headerHeight?: number;
    bodyPadding?: number;
    rowBuffer?: number;
    minRows?: number;
    maxRows?: number;
    enabled?: boolean;
  }
): number {
  const {
    rowHeight,
    headerHeight = 0,
    bodyPadding = 0,
    rowBuffer = 0,
    minRows = 5,
    maxRows = 100,
    enabled = true,
  } = options;
  const [pageSize, setPageSize] = useState(minRows);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const height = el.clientHeight;
      if (height <= 0) return;
      const rows = Math.ceil((height - headerHeight - bodyPadding) / rowHeight) + rowBuffer;
      setPageSize(Math.max(minRows, Math.min(maxRows, rows)));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, rowHeight, headerHeight, bodyPadding, rowBuffer, minRows, maxRows, enabled]);

  return pageSize;
}
