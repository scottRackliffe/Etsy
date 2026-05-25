import { getDb } from "@/lib/sqlite";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type InventoryProfitFields = {
  other_costs_total: number;
  total_cost: number;
  net_profit: number;
  margin_pct: number | null;
  roi_pct: number | null;
};

export function computeProfitFields(row: {
  purchase_cost?: unknown;
  shipping_cost?: unknown;
  sale_revenue?: unknown;
  other_costs_total?: unknown;
}): InventoryProfitFields {
  const purchase = Number(row.purchase_cost ?? 0) || 0;
  const shipping = Number(row.shipping_cost ?? 0) || 0;
  const other = Number(row.other_costs_total ?? 0) || 0;
  const revenue = Number(row.sale_revenue ?? 0) || 0;
  const total_cost = round2(purchase + shipping + other);
  const net_profit = round2(revenue - total_cost);
  const margin_pct = revenue > 0 ? round2((net_profit / revenue) * 100) : null;
  const roi_pct = total_cost > 0 ? round2((net_profit / total_cost) * 100) : null;
  return {
    other_costs_total: round2(other),
    total_cost,
    net_profit,
    margin_pct,
    roi_pct,
  };
}

function otherCostsMap(ids: number[]): Map<number, number> {
  const map = new Map<number, number>();
  if (ids.length === 0) return map;
  const db = getDb();
  const placeholders = ids.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT inventory_id, SUM(amount) AS other_total
       FROM other_costs
       WHERE inventory_id IN (${placeholders})
       GROUP BY inventory_id`
    )
    .all(...ids) as Array<{ inventory_id: number; other_total: number }>;
  for (const row of rows) {
    map.set(row.inventory_id, Number(row.other_total ?? 0));
  }
  return map;
}

export function enrichInventoryItem(item: Record<string, unknown>): Record<string, unknown> {
  const id = Number(item.id);
  const otherTotal = Number.isInteger(id) ? otherCostsMap([id]).get(id) ?? 0 : 0;
  return {
    ...item,
    ...computeProfitFields({ ...item, other_costs_total: otherTotal }),
  };
}

export function enrichInventoryItems(items: Record<string, unknown>[]): Record<string, unknown>[] {
  const ids = items
    .map((item) => Number(item.id))
    .filter((id) => Number.isInteger(id) && id > 0);
  const map = otherCostsMap(ids);
  return items.map((item) => {
    const id = Number(item.id);
    const otherTotal = map.get(id) ?? 0;
    return {
      ...item,
      ...computeProfitFields({ ...item, other_costs_total: otherTotal }),
    };
  });
}
