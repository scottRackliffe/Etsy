"use client";

import { useCallback, useMemo, useState } from "react";
import { formStatesEqual } from "@/lib/deep-equal-form";

export function useDirtyTracking<T>(initialValues: T | null) {
  const [savedState, setSavedState] = useState<T | null>(initialValues);
  const [current, setCurrent] = useState<T | null>(initialValues);

  const resetBaseline = useCallback((next: T | null) => {
    setSavedState(next);
    setCurrent(next);
  }, []);

  const markClean = useCallback(
    (next?: T) => {
      const value = next ?? current;
      setSavedState(value);
      if (next !== undefined) setCurrent(next);
    },
    [current]
  );

  const isDirty = useMemo(() => {
    if (savedState == null || current == null) return false;
    return !formStatesEqual(savedState, current);
  }, [savedState, current]);

  return {
    current,
    setCurrent,
    savedState,
    isDirty,
    markClean,
    resetBaseline,
  };
}
