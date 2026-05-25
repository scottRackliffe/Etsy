import { logActivity } from "@/lib/activity-log";
import { getInventory, getOrder } from "@/lib/records";
import { getDb } from "@/lib/sqlite";

export type OrderItemRow = {
  id: number;
  order_id: number;
  inventory_id: number;
  quantity: number;
  unit_price: number | null;
  line_total: number | null;
  created_at: string;
  updated_at: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

export function getOrderItem(id: number): OrderItemRow | null {
  const row = getDb().prepare("SELECT * FROM order_items WHERE id = ?").get(id) as
    | OrderItemRow
    | undefined;
  return row ?? null;
}

export function recalculateOrderTotals(orderId: number): void {
  const db = getDb();
  const items = db
    .prepare("SELECT line_total FROM order_items WHERE order_id = ?")
    .all(orderId) as Array<{ line_total: number | null }>;
  const subtotal = items.reduce((sum, row) => sum + (row.line_total ?? 0), 0);
  const order = db
    .prepare("SELECT shipping_total, tax_total, discount_total FROM orders WHERE id = ?")
    .get(orderId) as
    | { shipping_total: number | null; tax_total: number | null; discount_total: number | null }
    | undefined;
  if (!order) return;
  const grand =
    subtotal + (order.shipping_total ?? 0) + (order.tax_total ?? 0) - (order.discount_total ?? 0);
  db.prepare("UPDATE orders SET subtotal = ?, grand_total = ?, updated_at = ? WHERE id = ?").run(
    subtotal,
    grand,
    nowIso(),
    orderId
  );
}

export function addOrderItem(
  orderId: number,
  inventoryId: number,
  quantity: number,
  unitPrice?: number | null
): Record<string, unknown> | null {
  const db = getDb();
  const order = getOrder(orderId) as Record<string, unknown> | null;
  if (!order) return null;
  if (order.order_status === "void" || order.order_status === "cancelled") return null;

  const inv = getInventory(inventoryId) as Record<string, unknown> | null;
  if (!inv) return null;

  const qty = Math.max(1, Math.floor(quantity));
  const price =
    unitPrice != null && Number.isFinite(unitPrice)
      ? unitPrice
      : typeof inv.sale_revenue === "number"
        ? inv.sale_revenue
        : null;
  const lineTotal = price != null ? price * qty : null;
  const now = nowIso();

  db.prepare(
    `INSERT INTO order_items (order_id, inventory_id, quantity, unit_price, line_total, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(orderId, inventoryId, qty, price, lineTotal, now, now);

  recalculateOrderTotals(orderId);

  const updated = getOrder(orderId) as Record<string, unknown> | null;
  if (updated) {
    logActivity({
      action: "order.line_item_added",
      entityType: "order",
      entityId: orderId,
      entityLabel: String(updated.order_number ?? `Order ${orderId}`),
      detail: { inventory_id: inventoryId, quantity: qty },
    });
  }
  return updated;
}

export function deleteOrderItem(itemId: number): Record<string, unknown> | null {
  const db = getDb();
  const existing = getOrderItem(itemId);
  if (!existing) return null;

  const orderId = existing.order_id;
  db.prepare("DELETE FROM order_items WHERE id = ?").run(itemId);
  recalculateOrderTotals(orderId);

  const updated = getOrder(orderId) as Record<string, unknown> | null;
  if (updated) {
    logActivity({
      action: "order.line_item_removed",
      entityType: "order",
      entityId: orderId,
      entityLabel: String(updated.order_number ?? `Order ${orderId}`),
      detail: { order_item_id: itemId },
    });
  }
  return updated;
}

export function patchOrderItem(
  itemId: number,
  updates: { quantity?: number; unit_price?: number | null }
): Record<string, unknown> | null {
  const db = getDb();
  const existing = getOrderItem(itemId);
  if (!existing) return null;

  const qty =
    updates.quantity != null && Number.isFinite(updates.quantity)
      ? Math.max(1, Math.floor(updates.quantity))
      : existing.quantity;
  const unitPrice = updates.unit_price !== undefined ? updates.unit_price : existing.unit_price;
  const lineTotal = unitPrice != null ? unitPrice * qty : null;

  db.prepare(
    `UPDATE order_items SET quantity = ?, unit_price = ?, line_total = ?, updated_at = ? WHERE id = ?`
  ).run(qty, unitPrice, lineTotal, nowIso(), itemId);

  recalculateOrderTotals(existing.order_id);
  return getOrder(existing.order_id) as Record<string, unknown> | null;
}
