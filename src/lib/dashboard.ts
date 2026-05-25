import { getDb } from "@/lib/sqlite";
import { getSetting } from "@/lib/settings-store";

const UNSOLD_STATUSES = ["Draft", "In stock", "Listed", "Reserved"];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function getInventoryValueSummary() {
  const db = getDb();
  const placeholders = UNSOLD_STATUSES.map(() => "?").join(", ");
  const row = db
    .prepare(
      `SELECT
        COUNT(*) AS item_count,
        SUM(COALESCE(purchase_cost, 0) + COALESCE(shipping_cost, 0)) AS at_cost,
        SUM(COALESCE(sale_revenue, 0)) AS at_sale_price
      FROM inventory
      WHERE status IN (${placeholders})`
    )
    .get(...UNSOLD_STATUSES) as {
    item_count: number;
    at_cost: number | null;
    at_sale_price: number | null;
  };

  const atCost = round2(row.at_cost ?? 0);
  const atSalePrice = round2(row.at_sale_price ?? 0);
  const potentialMargin = round2(atSalePrice - atCost);
  const potentialMarginPct =
    atCost > 0 ? round2((potentialMargin / atCost) * 100) : null;

  return {
    at_cost: atCost,
    at_sale_price: atSalePrice,
    potential_margin: potentialMargin,
    potential_margin_pct: potentialMarginPct,
    item_count: row.item_count ?? 0,
  };
}

type SoldRow = {
  sale_revenue: number;
  total_cost: number;
};

function soldItemsWithCosts(whereSql: string, params: unknown[] = []): SoldRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT
        COALESCE(i.sale_revenue, 0) AS sale_revenue,
        COALESCE(i.purchase_cost, 0) + COALESCE(i.shipping_cost, 0) + COALESCE(oc.other_total, 0) AS total_cost
      FROM inventory i
      LEFT JOIN (
        SELECT inventory_id, SUM(amount) AS other_total
        FROM other_costs
        GROUP BY inventory_id
      ) oc ON oc.inventory_id = i.id
      WHERE i.status = 'Sold' AND ${whereSql}`
    )
    .all(...params) as SoldRow[];
}

export function getProfitKpis() {
  const monthRows = soldItemsWithCosts(
    "date(i.date_of_sale) >= date('now', 'start of month')"
  );
  const ytdRows = soldItemsWithCosts(
    "strftime('%Y', i.date_of_sale) = strftime('%Y', 'now')"
  );

  const margins: number[] = [];
  let totalProfitMonth = 0;
  for (const row of monthRows) {
    const net = row.sale_revenue - row.total_cost;
    totalProfitMonth += net;
    if (row.sale_revenue > 0) {
      margins.push(((row.sale_revenue - row.total_cost) / row.sale_revenue) * 100);
    }
  }

  let totalProfitYtd = 0;
  for (const row of ytdRows) {
    totalProfitYtd += row.sale_revenue - row.total_cost;
  }

  return {
    avg_margin_this_month:
      margins.length > 0
        ? round2(margins.reduce((a, b) => a + b, 0) / margins.length)
        : null,
    avg_margin_this_month_count: monthRows.length,
    total_profit_this_month: round2(totalProfitMonth),
    total_profit_ytd: round2(totalProfitYtd),
  };
}

export function getDashboardStats() {
  const db = getDb();
  const repeat = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM (
          SELECT o.customer_id
          FROM orders o
          WHERE o.order_status = 'active' AND o.customer_id IS NOT NULL
          GROUP BY o.customer_id
          HAVING COUNT(*) >= 2
            AND SUM(
              CASE WHEN strftime('%Y-%m', o.order_date) = strftime('%Y-%m', 'now') THEN 1 ELSE 0 END
            ) > 0
        )`
      )
      .get() as { c: number }
  ).c;

  return { repeat_customers_this_month: repeat };
}

export function getDashboardSummary(options: {
  connected: boolean;
  shop?: { shop_id: string; shop_name: string | null };
}) {
  const profit = getProfitKpis();
  return {
    connected: options.connected,
    shop: options.shop ?? null,
    last_etsy_sync_at: getSetting("last_etsy_sync_at"),
    receipts_preview: [] as unknown[],
    ...profit,
  };
}
