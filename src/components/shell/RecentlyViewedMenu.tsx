"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRecentlyViewed } from "@/context/RecentlyViewedContext";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";
import {
  formatRecentlyViewedTime,
  recentlyViewedHref,
  RECENTLY_VIEWED_GROUP_LABELS,
  type RecentlyViewedEntityType,
  type RecentlyViewedEntry,
} from "@/lib/recently-viewed";

const GROUP_ORDER: RecentlyViewedEntityType[] = ["inventory", "order", "customer"];

function groupEntries(
  entries: RecentlyViewedEntry[]
): Map<RecentlyViewedEntityType, RecentlyViewedEntry[]> {
  const groups = new Map<RecentlyViewedEntityType, RecentlyViewedEntry[]>();
  for (const type of GROUP_ORDER) {
    groups.set(
      type,
      entries.filter((entry) => entry.entityType === type).sort((a, b) => b.timestamp - a.timestamp)
    );
  }
  return groups;
}

export function RecentlyViewedMenu() {
  const { entries, clearRecentlyViewed } = useRecentlyViewed();
  const { confirmLeave } = useUnsavedChanges();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const groups = groupEntries(entries);
  const hasEntries = entries.length > 0;

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-neutral)] px-3 py-2 text-sm font-medium text-[var(--ui-body)] shadow-sm transition hover:bg-[var(--ui-neutral-hover)]"
        aria-label="Recently viewed items"
        aria-expanded={open}
        aria-haspopup="true"
        title="Recently viewed"
      >
        <span aria-hidden="true">🕐</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-80 max-h-[400px] overflow-y-auto rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 shadow-xl"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
            Recently viewed
          </p>
          {!hasEntries ? (
            <p className="py-4 text-center text-sm text-[var(--ui-muted)]">
              No recently viewed items.
            </p>
          ) : (
            <div className="space-y-3">
              {GROUP_ORDER.map((type) => {
                const group = groups.get(type) ?? [];
                if (group.length === 0) return null;
                return (
                  <div key={type}>
                    <p className="mb-1 text-xs font-medium text-[var(--ui-title)]">
                      {RECENTLY_VIEWED_GROUP_LABELS[type]}
                    </p>
                    <ul className="space-y-1">
                      {group.map((entry) => (
                        <li key={`${entry.entityType}-${entry.id}`}>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={async () => {
                              const allowed = await confirmLeave();
                              if (!allowed) return;
                              setOpen(false);
                              router.push(recentlyViewedHref(entry));
                            }}
                            className="block w-full rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-[var(--ui-card-bg)]"
                          >
                            <span className="block truncate text-[var(--ui-body)]">
                              {entry.label}
                            </span>
                            <span className="text-xs text-[var(--ui-muted)]">
                              {formatRecentlyViewedTime(entry.timestamp)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
          {hasEntries ? (
            <button
              type="button"
              onClick={() => {
                clearRecentlyViewed();
                setOpen(false);
              }}
              className="mt-3 w-full text-left text-xs text-[var(--ui-muted)] underline underline-offset-2 hover:text-[var(--ui-body)]"
            >
              Clear history
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
