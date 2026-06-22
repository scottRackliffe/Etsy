import { getDb } from "@/lib/sqlite";
import { getSetting, getMinQualityScore } from "@/lib/settings-store";
import { getOutstandingCount } from "@/lib/outstanding";
import { computeRubricFastScore } from "@/lib/listing-rubric";

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
  const potentialMarginPct = atCost > 0 ? round2((potentialMargin / atCost) * 100) : null;

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
  const monthRows = soldItemsWithCosts("date(i.date_of_sale) >= date('now', 'start of month')");
  const ytdRows = soldItemsWithCosts("strftime('%Y', i.date_of_sale) = strftime('%Y', 'now')");

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
      margins.length > 0 ? round2(margins.reduce((a, b) => a + b, 0) / margins.length) : null,
    avg_margin_this_month_count: monthRows.length,
    total_profit_this_month: round2(totalProfitMonth),
    total_profit_ytd: round2(totalProfitYtd),
  };
}

export function getOrderKpis() {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
        COUNT(*) AS total_orders,
        SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END) AS paid_orders,
        SUM(CASE WHEN shipping_date IS NOT NULL AND shipping_date != '' THEN 1 ELSE 0 END) AS shipped_orders,
        SUM(CASE WHEN payment_status = 'paid' AND (shipping_date IS NULL OR shipping_date = '') THEN 1 ELSE 0 END) AS unshipped_orders,
        SUM(CASE WHEN payment_status = 'paid' AND (shipping_date IS NULL OR shipping_date = '') THEN 1 ELSE 0 END) AS awaiting_shipment_paid,
        SUM(CASE WHEN payment_status != 'paid' AND (shipping_date IS NULL OR shipping_date = '') THEN 1 ELSE 0 END) AS awaiting_shipment_unpaid,
        COALESCE(SUM(grand_total), 0) AS gross_revenue,
        SUM(CASE WHEN payment_status != 'paid' THEN 1 ELSE 0 END) AS unpaid_orders,
        COALESCE(SUM(CASE WHEN payment_status != 'paid' THEN grand_total ELSE 0 END), 0) AS unpaid_receivables
      FROM orders
      WHERE order_status = 'active'`
    )
    .get() as {
    total_orders: number;
    paid_orders: number;
    shipped_orders: number;
    unshipped_orders: number;
    awaiting_shipment_paid: number;
    awaiting_shipment_unpaid: number;
    gross_revenue: number;
    unpaid_orders: number;
    unpaid_receivables: number;
  };

  const monthRow = db
    .prepare(
      `SELECT
        COUNT(*) AS orders_this_month,
        COALESCE(SUM(grand_total), 0) AS revenue_this_month
      FROM orders
      WHERE order_status = 'active'
        AND strftime('%Y-%m', order_date) = strftime('%Y-%m', 'now')`
    )
    .get() as { orders_this_month: number; revenue_this_month: number };

  const weekRow = db
    .prepare(
      `SELECT COUNT(*) AS orders_last_7_days
      FROM orders
      WHERE order_status = 'active'
        AND date(order_date) >= date('now', '-6 days')`
    )
    .get() as { orders_last_7_days: number };

  const aovThisMonth =
    monthRow.orders_this_month > 0
      ? round2(monthRow.revenue_this_month / monthRow.orders_this_month)
      : 0;

  return {
    total_orders: row.total_orders,
    paid_orders: row.paid_orders,
    shipped_orders: row.shipped_orders,
    unshipped_orders: row.unshipped_orders,
    awaiting_shipment_paid: row.awaiting_shipment_paid ?? 0,
    awaiting_shipment_unpaid: row.awaiting_shipment_unpaid ?? 0,
    unpaid_orders: row.unpaid_orders,
    unpaid_receivables: round2(row.unpaid_receivables),
    gross_revenue: round2(row.gross_revenue),
    orders_this_month: monthRow.orders_this_month,
    revenue_this_month: round2(monthRow.revenue_this_month),
    orders_last_7_days: weekRow.orders_last_7_days,
    aov_this_month: aovThisMonth,
  };
}

export function getInventoryActionCounts() {
  const db = getDb();
  const notListed = (
    db
      .prepare(
        `SELECT COUNT(*) AS c
         FROM inventory
         WHERE status = 'In stock' AND (date_listed IS NULL OR date_listed = '')`
      )
      .get() as { c: number }
  ).c;

  return { not_listed_count: notListed };
}

export function getDashboardStats() {
  const db = getDb();
  const thresholdSetting = getSetting("repeat_customer_threshold");
  const threshold = Math.max(2, parseInt(thresholdSetting ?? "2", 10) || 2);
  const repeat = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM (
          SELECT o.customer_id
          FROM orders o
          WHERE o.order_status = 'active' AND o.customer_id IS NOT NULL
          GROUP BY o.customer_id
          HAVING COUNT(*) >= ?
            AND SUM(
              CASE WHEN strftime('%Y-%m', o.order_date) = strftime('%Y-%m', 'now') THEN 1 ELSE 0 END
            ) > 0
        )`
      )
      .get(threshold) as { c: number }
  ).c;

  return { repeat_customers_this_month: repeat };
}

export type LowQualityInventoryItem = {
  id: number;
  item_number: string | null;
  title: string;
  score: number;
};

export function getLowQualityInventory(): {
  items: LowQualityInventoryItem[];
  threshold: number;
} {
  const db = getDb();
  const minScore = getMinQualityScore();
  const placeholders = UNSOLD_STATUSES.map(() => "?").join(", ");
  const rows = db
    .prepare(`SELECT * FROM inventory WHERE status IN (${placeholders})`)
    .all(...UNSOLD_STATUSES) as Array<Record<string, unknown>>;

  const items: LowQualityInventoryItem[] = [];
  for (const row of rows) {
    const { score } = computeRubricFastScore(row as { id: number; [key: string]: unknown });
    if (score < minScore) {
      const title =
        (row.listing_title as string)?.trim() ||
        (row.description as string)?.trim() ||
        "Untitled";
      items.push({
        id: row.id as number,
        item_number: (row.item_number as string) ?? null,
        title,
        score,
      });
    }
  }
  items.sort((a, b) => a.score - b.score);
  return { items, threshold: minScore };
}

/**
 * Count active manual-channel unpaid orders eligible for payment-reminder
 * outreach (mirrors the WHERE clause in getCandidates("payment_reminder")).
 */
export function getPaymentReminderCandidateCount(): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c
       FROM orders
       WHERE order_status = 'active'
         AND source_channel = 'manual'
         AND payment_status = 'unpaid'`
    )
    .get() as { c: number };
  return row.c ?? 0;
}

export function getDashboardSummary(options: {
  connected: boolean;
  shop?: { shop_id: string; shop_name: string | null };
}) {
  const profit = getProfitKpis();
  const orderKpis = getOrderKpis();
  const stats = getDashboardStats();
  const inventoryActions = getInventoryActionCounts();
  return {
    connected: options.connected,
    shop: options.shop ?? null,
    last_etsy_sync_at: getSetting("last_etsy_sync_at"),
    receipts_preview: [] as unknown[],
    outstanding_count: getOutstandingCount(),
    payment_reminder_candidates: getPaymentReminderCandidateCount(),
    ...profit,
    ...orderKpis,
    ...stats,
    ...inventoryActions,
  };
}
