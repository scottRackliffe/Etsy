export type RecentlyViewedEntityType = "order" | "inventory" | "customer";

export type RecentlyViewedEntry = {
  entityType: RecentlyViewedEntityType;
  id: number;
  label: string;
  timestamp: number;
};

const STORAGE_KEY = "etsy_recently_viewed";
const MAX_ENTRIES = 20;

export function inventoryRecentlyViewedLabel(item: {
  id: number;
  item_number?: string | null;
  description?: string | null;
}): string {
  const num = item.item_number?.trim() || `Item ${item.id}`;
  const desc = item.description?.trim();
  return desc ? `${num} — ${desc}` : num;
}

export function orderRecentlyViewedLabel(order: {
  id: number;
  order_number?: string | null;
}): string {
  return order.order_number?.trim() || `#${order.id}`;
}

export function customerRecentlyViewedLabel(customer: {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}): string {
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ");
  return name || customer.email?.trim() || `Customer ${customer.id}`;
}

export function recentlyViewedHref(entry: RecentlyViewedEntry): string {
  switch (entry.entityType) {
    case "inventory":
      return `/inventory?itemId=${entry.id}`;
    case "order":
      return `/sales?orderId=${entry.id}`;
    case "customer":
      return `/customers?customerId=${entry.id}`;
  }
}

export function loadRecentlyViewed(): RecentlyViewedEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is RecentlyViewedEntry =>
        entry != null &&
        typeof entry === "object" &&
        (entry.entityType === "order" ||
          entry.entityType === "inventory" ||
          entry.entityType === "customer") &&
        typeof entry.id === "number" &&
        typeof entry.label === "string" &&
        typeof entry.timestamp === "number"
    );
  } catch {
    return [];
  }
}

export function saveRecentlyViewed(entries: RecentlyViewedEntry[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

export function addRecentlyViewedEntry(
  entityType: RecentlyViewedEntityType,
  id: number,
  label: string
): RecentlyViewedEntry[] {
  const trimmed = label.trim() || `${entityType} ${id}`;
  const now = Date.now();
  const without = loadRecentlyViewed().filter(
    (entry) => !(entry.entityType === entityType && entry.id === id)
  );
  const next: RecentlyViewedEntry[] = [
    { entityType, id, label: trimmed, timestamp: now },
    ...without,
  ].slice(0, MAX_ENTRIES);
  saveRecentlyViewed(next);
  return next;
}

export function clearRecentlyViewedStorage(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function formatRecentlyViewedTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return new Date(timestamp).toLocaleDateString();
}

export const RECENTLY_VIEWED_GROUP_LABELS: Record<RecentlyViewedEntityType, string> = {
  inventory: "Inventory",
  order: "Orders",
  customer: "Customers",
};
