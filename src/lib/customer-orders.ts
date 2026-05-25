import { getDb } from "@/lib/sqlite";

export type CustomerOrderLineItem = {
  inventory_id: number | null;
  description: string | null;
  quantity: number;
  unit_price: number | null;
};

export type CustomerOrderRow = {
  id: number;
  order_number: string | null;
  order_date: string | null;
  order_status: string;
  payment_status: string | null;
  source_channel: string | null;
  grand_total: number | null;
  shipped: boolean;
  items: CustomerOrderLineItem[];
};

export type CustomerOrdersSummary = {
  total_orders: number;
  total_spent: number;
  first_order_date: string | null;
  last_order_date: string | null;
};

function loadOrderLineItems(orderIds: number[]): Map<number, CustomerOrderLineItem[]> {
  const map = new Map<number, CustomerOrderLineItem[]>();
  if (orderIds.length === 0) return map;

  const db = getDb();
  const placeholders = orderIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT oi.order_id, oi.inventory_id, oi.quantity, oi.unit_price, i.description
       FROM order_items oi
       LEFT JOIN inventory i ON i.id = oi.inventory_id
       WHERE oi.order_id IN (${placeholders})
       ORDER BY oi.id`
    )
    .all(...orderIds) as Array<{
    order_id: number;
    inventory_id: number | null;
    quantity: number;
    unit_price: number | null;
    description: string | null;
  }>;

  for (const row of rows) {
    const list = map.get(row.order_id) ?? [];
    list.push({
      inventory_id: row.inventory_id,
      description: row.description,
      quantity: row.quantity,
      unit_price: row.unit_price,
    });
    map.set(row.order_id, list);
  }
  return map;
}

export function getCustomerOrdersSummary(customerId: number): CustomerOrdersSummary {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
        COUNT(*) AS total_orders,
        SUM(CASE WHEN order_status = 'active' THEN COALESCE(grand_total, 0) ELSE 0 END) AS total_spent,
        MIN(order_date) AS first_order_date,
        MAX(order_date) AS last_order_date
       FROM orders
       WHERE customer_id = ?`
    )
    .get(customerId) as {
    total_orders: number;
    total_spent: number | null;
    first_order_date: string | null;
    last_order_date: string | null;
  };

  return {
    total_orders: row.total_orders ?? 0,
    total_spent: Math.round((row.total_spent ?? 0) * 100) / 100,
    first_order_date: row.first_order_date,
    last_order_date: row.last_order_date,
  };
}

export function listCustomerOrders(customerId: number, limit: number, offset: number) {
  const db = getDb();
  const total = (
    db.prepare("SELECT COUNT(*) AS c FROM orders WHERE customer_id = ?").get(customerId) as { c: number }
  ).c;

  const rows = db
    .prepare(
      `SELECT id, order_number, order_date, order_status, payment_status, source_channel, grand_total,
              CASE WHEN shipping_date IS NOT NULL AND shipping_date != '' THEN 1 ELSE 0 END AS shipped
       FROM orders
       WHERE customer_id = ?
       ORDER BY order_date DESC, id DESC
       LIMIT ? OFFSET ?`
    )
    .all(customerId, limit, offset) as Array<{
    id: number;
    order_number: string | null;
    order_date: string | null;
    order_status: string;
    payment_status: string | null;
    source_channel: string | null;
    grand_total: number | null;
    shipped: number;
  }>;

  const lineItems = loadOrderLineItems(rows.map((r) => r.id));
  const items: CustomerOrderRow[] = rows.map((row) => ({
    id: row.id,
    order_number: row.order_number,
    order_date: row.order_date,
    order_status: row.order_status,
    payment_status: row.payment_status,
    source_channel: row.source_channel,
    grand_total: row.grand_total,
    shipped: row.shipped === 1,
    items: lineItems.get(row.id) ?? [],
  }));

  return { items, total, summary: getCustomerOrdersSummary(customerId) };
}

export function getCustomerActiveOrderCount(customerId: number): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM orders WHERE customer_id = ? AND order_status = 'active'`
    )
    .get(customerId) as { c: number };
  return row.c ?? 0;
}
