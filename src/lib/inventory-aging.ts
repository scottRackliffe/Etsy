export type InventoryAgingItem = {
  date_purchased: string | null;
  date_listed: string | null;
  created_at: string | null;
  status: string | null;
};

export function getInventoryAgingCounts(items: InventoryAgingItem[]) {
  const now = Date.now();
  let over30 = 0;
  let over60 = 0;
  let over90 = 0;

  for (const item of items) {
    if (item.status !== "In stock" && item.status !== "Listed") continue;

    const candidates = [item.date_purchased, item.date_listed, item.created_at].filter(
      Boolean
    ) as string[];
    if (candidates.length === 0) continue;

    const timestamps = candidates.map((d) => new Date(d).getTime()).filter((t) => !Number.isNaN(t));
    if (timestamps.length === 0) continue;

    const days = Math.floor((now - Math.min(...timestamps)) / (1000 * 60 * 60 * 24));
    if (days > 30) over30 += 1;
    if (days > 60) over60 += 1;
    if (days > 90) over90 += 1;
  }

  return { over_30: over30, over_60: over60, over_90: over90 };
}
