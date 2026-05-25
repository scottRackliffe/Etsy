"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  addRecentlyViewedEntry,
  clearRecentlyViewedStorage,
  loadRecentlyViewed,
  type RecentlyViewedEntityType,
  type RecentlyViewedEntry,
} from "@/lib/recently-viewed";

type RecentlyViewedContextValue = {
  entries: RecentlyViewedEntry[];
  addRecentlyViewed: (entityType: RecentlyViewedEntityType, id: number, label: string) => void;
  clearRecentlyViewed: () => void;
};

const RecentlyViewedContext = createContext<RecentlyViewedContextValue | null>(null);

export function RecentlyViewedProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<RecentlyViewedEntry[]>(() => loadRecentlyViewed());

  const addRecentlyViewed = useCallback(
    (entityType: RecentlyViewedEntityType, id: number, label: string) => {
      setEntries(addRecentlyViewedEntry(entityType, id, label));
    },
    []
  );

  const clearRecentlyViewed = useCallback(() => {
    clearRecentlyViewedStorage();
    setEntries([]);
  }, []);

  const value = useMemo(
    () => ({ entries, addRecentlyViewed, clearRecentlyViewed }),
    [entries, addRecentlyViewed, clearRecentlyViewed]
  );

  return <RecentlyViewedContext.Provider value={value}>{children}</RecentlyViewedContext.Provider>;
}

export function useRecentlyViewed(): RecentlyViewedContextValue {
  const ctx = useContext(RecentlyViewedContext);
  if (!ctx) {
    throw new Error("useRecentlyViewed must be used within RecentlyViewedProvider");
  }
  return ctx;
}

export function useTrackRecentlyViewed(
  entityType: RecentlyViewedEntityType,
  id: number | null,
  label: string | null
): void {
  const { addRecentlyViewed } = useRecentlyViewed();
  useEffect(() => {
    if (id == null || !label?.trim()) return;
    addRecentlyViewed(entityType, id, label);
  }, [entityType, id, label, addRecentlyViewed]);
}
