export type NotificationType = "success" | "error" | "warning" | "info";

export type AppNotification = {
  id: string;
  type: NotificationType;
  message: string;
  timestamp: string;
  read: boolean;
  action?: { label: string; url: string };
};

const STORAGE_KEY = "esm_notifications";
const MAX_NOTIFICATIONS = 50;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `n_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function loadRaw(): AppNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AppNotification[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRaw(items: AppNotification[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent("esm-notifications-changed"));
  } catch {
    /* ignore quota */
  }
}

export function purgeOldNotifications(): AppNotification[] {
  const cutoff = Date.now() - MAX_AGE_MS;
  const kept = loadRaw().filter((n) => {
    const t = new Date(n.timestamp).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
  saveRaw(kept);
  return kept;
}

export function listNotifications(): AppNotification[] {
  return purgeOldNotifications().sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

export function addNotificationEntry(input: {
  type: NotificationType;
  message: string;
  action?: { label: string; url: string };
}): AppNotification {
  const entry: AppNotification = {
    id: newId(),
    type: input.type,
    message: input.message,
    timestamp: new Date().toISOString(),
    read: false,
    action: input.action,
  };
  let items = purgeOldNotifications();
  items = [entry, ...items];
  while (items.length > MAX_NOTIFICATIONS) {
    const unreadIdx = items.map((n, i) => (!n.read ? i : -1)).filter((i) => i >= 0);
    const removeIdx =
      unreadIdx.length > 0 ? unreadIdx[unreadIdx.length - 1] : items.length - 1;
    items.splice(removeIdx, 1);
  }
  saveRaw(items);
  return entry;
}

export function markNotificationRead(id: string): AppNotification[] {
  const items = listNotifications().map((n) => (n.id === id ? { ...n, read: true } : n));
  saveRaw(items);
  return items;
}

export function markAllNotificationsRead(): AppNotification[] {
  const items = listNotifications().map((n) => ({ ...n, read: true }));
  saveRaw(items);
  return items;
}

export function unreadNotificationCount(items: AppNotification[]): number {
  return items.filter((n) => !n.read).length;
}

export function formatNotificationTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const d = new Date(iso);
  if (
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear()
  ) {
    return "Yesterday";
  }
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
