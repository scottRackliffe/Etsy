"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  clearAllNotifications,
  formatNotificationTime,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unreadNotificationCount,
  type AppNotification,
} from "@/lib/notifications";

const DOT_CLASS: Record<string, string> = {
  success: "bg-[var(--ui-green)]",
  error: "bg-[var(--ui-red)]",
  warning: "bg-[var(--ui-yellow)]",
  info: "bg-[var(--ui-accent)]",
};

const NOTIFICATIONS_SERVER_SNAPSHOT: AppNotification[] = [];

function subscribeNotifications(onStoreChange: () => void): () => void {
  const handler = () => {
    notificationSnapshotCache = null;
    onStoreChange();
  };
  window.addEventListener("esm-notifications-changed", handler);
  return () => window.removeEventListener("esm-notifications-changed", handler);
}

let notificationSnapshotCache: AppNotification[] | null = null;
let notificationSnapshotToken = "";

function getNotificationsSnapshot(): AppNotification[] {
  const next = listNotifications();
  if (next.length === 0) {
    notificationSnapshotCache = NOTIFICATIONS_SERVER_SNAPSHOT;
    notificationSnapshotToken = "";
    return NOTIFICATIONS_SERVER_SNAPSHOT;
  }
  const token = next.map((n) => `${n.id}:${n.read}:${n.timestamp}`).join("|");
  if (notificationSnapshotCache && token === notificationSnapshotToken) {
    return notificationSnapshotCache;
  }
  notificationSnapshotToken = token;
  notificationSnapshotCache = next;
  return next;
}

function getNotificationsServerSnapshot(): AppNotification[] {
  return NOTIFICATIONS_SERVER_SNAPSHOT;
}

export function NotificationCenter() {
  const notifications = useSyncExternalStore(
    subscribeNotifications,
    getNotificationsSnapshot,
    getNotificationsServerSnapshot
  );
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const unreadCount = unreadNotificationCount(notifications);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg border border-[var(--ui-border)] bg-[var(--ui-neutral)] px-3 py-2 text-sm font-medium text-[var(--ui-body)] shadow-sm transition hover:bg-[var(--ui-neutral-hover)]"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span aria-hidden>🔔</span>
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--ui-red)] px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-80 max-h-[480px] overflow-hidden rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-label="Notifications"
        >
          <div className="flex items-center justify-between border-b border-[var(--ui-border)] px-3 py-2">
            <h2 className="text-sm font-semibold text-[var(--ui-title)]">Notifications</h2>
            {notifications.length > 0 ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => markAllNotificationsRead()}
                  className="text-xs text-[var(--ui-accent)] hover:underline"
                >
                  Mark all read
                </button>
                <button
                  type="button"
                  onClick={() => clearAllNotifications()}
                  className="text-xs text-[var(--ui-muted)] hover:text-[var(--ui-red)] hover:underline"
                >
                  Clear all
                </button>
              </div>
            ) : null}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-[var(--ui-muted)]">
                No notifications
              </p>
            ) : (
              <ul>
                {notifications.map((n) => (
                  <li
                    key={n.id}
                    className={`border-b border-[var(--ui-border)]/60 px-3 py-2 ${n.read ? "opacity-60" : ""}`}
                  >
                    <div className="flex gap-2">
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT_CLASS[n.type] ?? DOT_CLASS.info}`}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm text-[var(--ui-body)]">{n.message}</p>
                        <p className="mt-0.5 text-[10px] text-[var(--ui-muted)]">
                          {formatNotificationTime(n.timestamp)}
                        </p>
                        {n.action ? (
                          <Link
                            href={n.action.url}
                            onClick={() => {
                              markNotificationRead(n.id);
                              setOpen(false);
                            }}
                            className="mt-1 inline-block text-xs text-[var(--ui-accent)] hover:underline"
                          >
                            {n.action.label}
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              markNotificationRead(n.id);
                            }}
                            className="mt-1 text-xs text-[var(--ui-muted)] hover:underline"
                          >
                            Mark read
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
