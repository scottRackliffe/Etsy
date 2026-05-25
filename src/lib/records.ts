import { logActivity } from "@/lib/activity-log";
import { OrderShipBlockedError } from "@/lib/order-validation";
import {
  buildSearchClause,
  parseSortDir,
  resolveSortColumn,
} from "@/lib/list-query";
import { getDb } from "@/lib/sqlite";

type SqlValue = string | number | null;

function nowIso(): string {
  return new Date().toISOString();
}

function pickDefined<T extends Record<string, unknown>>(obj: T): Record<string, SqlValue> {
  const out: Record<string, SqlValue> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (value === null || typeof value === "string" || typeof value === "number") {
      out[key] = value;
    }
  }
  return out;
}

function buildPatchSql(table: string, id: number, updates: Record<string, SqlValue>) {
  const keys = Object.keys(updates);
  if (keys.length === 0) {
    return null;
  }
  const setClause = keys.map((k) => `${k} = @${k}`).join(", ");
  return {
    sql: `UPDATE ${table} SET ${setClause}, updated_at = @updated_at WHERE id = @id`,
    params: { ...updates, updated_at: nowIso(), id },
  };
}

const LISTING_MUTATION_FIELDS = new Set([
  "listing_title",
  "listing_description",
  "listing_tags",
  "listing_category_path",
  "listing_title_strategy",
  "listing_product_story",
  "listing_condition_clarity",
  "listing_attributes",
  "listing_pricing_shipping_notes",
  "listing_quality_checklist",
]);

export type InventoryListOptions = {
  limit: number;
  offset: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
};

const INVENTORY_SORT: Record<string, string> = {
  item_number: "item_number",
  description: "description",
  status: "status",
  updated_at: "COALESCE(updated_at, created_at, '')",
  created_at: "created_at",
  sale_revenue: "sale_revenue",
  date_purchased: "date_purchased",
  date_listed: "date_listed",
  margin_pct: "sale_revenue",
};

export function listInventory(options: InventoryListOptions) {
  const db = getDb();
  const params: Record<string, unknown> = {};
  let where = "WHERE 1=1";
  if (options.status?.trim()) {
    where += " AND status = @status";
    params.status = options.status.trim();
  }
  where += buildSearchClause(
    ["item_number", "description", "listing_title", "category_tags", "notes"],
    options.search,
    params
  );

  const sortCol = resolveSortColumn(options.sortBy, INVENTORY_SORT, "updated_at");
  const dir = parseSortDir(options.sortDir ?? null) === "asc" ? "ASC" : "DESC";

  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM inventory ${where}`).get(params) as { c: number }
  ).c;
  const items = db
    .prepare(
      `SELECT * FROM inventory ${where} ORDER BY ${sortCol} ${dir}, id DESC LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: options.limit, offset: options.offset });
  return { items, total };
}

export function createInventory(input: Record<string, unknown>) {
  const db = getDb();
  const payload = pickDefined(input);
  if (!payload.listing_draft_state) {
    payload.listing_draft_state = "draft";
  }
  if (!payload.listing_draft_source) {
    payload.listing_draft_source = "manual";
  }
  if (payload.is_listed == null) {
    payload.is_listed = 0;
  }
  payload.created_at = nowIso();
  payload.updated_at = payload.created_at;
  const columns = Object.keys(payload);
  const placeholders = columns.map((k) => `@${k}`).join(", ");
  const sql = `INSERT INTO inventory(${columns.join(", ")}) VALUES(${placeholders})`;
  const result = db.prepare(sql).run(payload);
  return db.prepare("SELECT * FROM inventory WHERE id = ?").get(result.lastInsertRowid);
}

export function getInventory(id: number) {
  return getDb().prepare("SELECT * FROM inventory WHERE id = ?").get(id);
}

export function patchInventory(id: number, input: Record<string, unknown>) {
  const db = getDb();
  const payload = pickDefined(input);
  const touchesListing = Object.keys(payload).some((key) => LISTING_MUTATION_FIELDS.has(key));
  if (touchesListing) {
    // Any listing-content edits require explicit re-approval before publish.
    payload.listing_draft_state = "draft";
    payload.listing_approved_at = null;
    payload.is_listed = 0;
    payload.listing_published_at = null;
  }
  const patch = buildPatchSql("inventory", id, payload);
  if (!patch) return getInventory(id);
  db.prepare(patch.sql).run(patch.params);
  return getInventory(id);
}

export function deleteInventory(id: number): boolean {
  const result = getDb().prepare("DELETE FROM inventory WHERE id = ?").run(id);
  return result.changes > 0;
}

export type CustomerListOptions = {
  limit: number;
  offset: number;
  search?: string;
  is_active?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
};

const CUSTOMER_SORT: Record<string, string> = {
  last_name: "last_name",
  first_name: "first_name",
  email: "email",
  updated_at: "COALESCE(updated_at, created_at, '')",
  created_at: "created_at",
};

export function listCustomers(options: CustomerListOptions) {
  const db = getDb();
  const params: Record<string, unknown> = {};
  let where = "WHERE 1=1";
  if (options.is_active === 0 || options.is_active === 1) {
    where += " AND is_active = @is_active";
    params.is_active = options.is_active;
  }
  where += buildSearchClause(
    ["first_name", "last_name", "email", "phone", "city", "notes"],
    options.search,
    params
  );

  const sortCol = resolveSortColumn(options.sortBy, CUSTOMER_SORT, "last_name");
  const dir = parseSortDir(options.sortDir ?? null) === "asc" ? "ASC" : "DESC";

  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM customers ${where}`).get(params) as { c: number }
  ).c;
  const items = db
    .prepare(
      `SELECT * FROM customers ${where} ORDER BY ${sortCol} ${dir}, id DESC LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: options.limit, offset: options.offset });
  return { items, total };
}

export function createCustomer(input: Record<string, unknown>) {
  const db = getDb();
  const payload = pickDefined(input);
  payload.created_at = nowIso();
  payload.updated_at = payload.created_at;
  const columns = Object.keys(payload);
  const placeholders = columns.map((k) => `@${k}`).join(", ");
  const result = db
    .prepare(`INSERT INTO customers(${columns.join(", ")}) VALUES(${placeholders})`)
    .run(payload);
  return db.prepare("SELECT * FROM customers WHERE id = ?").get(result.lastInsertRowid);
}

export function getCustomer(id: number) {
  return getDb().prepare("SELECT * FROM customers WHERE id = ?").get(id);
}

export function patchCustomer(id: number, input: Record<string, unknown>) {
  const db = getDb();
  const patch = buildPatchSql("customers", id, pickDefined(input));
  if (!patch) return getCustomer(id);
  db.prepare(patch.sql).run(patch.params);
  return getCustomer(id);
}

export function deleteCustomer(id: number): boolean {
  const result = getDb().prepare("DELETE FROM customers WHERE id = ?").run(id);
  return result.changes > 0;
}

export function listPurchases(limit: number, offset: number, inventoryId?: number) {
  const db = getDb();
  const where = inventoryId ? "WHERE inventory_id = ?" : "";
  const countParams = inventoryId ? [inventoryId] : [];
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM purchases ${where}`).get(...countParams) as { c: number }
  ).c;
  const items = db
    .prepare(
      `SELECT * FROM purchases ${where} ORDER BY COALESCE(updated_at, created_at, '') DESC, id DESC LIMIT ? OFFSET ?`
    )
    .all(...(inventoryId ? [inventoryId, limit, offset] : [limit, offset]));
  return { items, total };
}

export function createPurchase(input: Record<string, unknown>) {
  const db = getDb();
  const payload = pickDefined(input);
  payload.created_at = nowIso();
  payload.updated_at = payload.created_at;
  const columns = Object.keys(payload);
  const placeholders = columns.map((k) => `@${k}`).join(", ");
  const result = db
    .prepare(`INSERT INTO purchases(${columns.join(", ")}) VALUES(${placeholders})`)
    .run(payload);
  return db.prepare("SELECT * FROM purchases WHERE id = ?").get(result.lastInsertRowid);
}

export function getPurchase(id: number) {
  return getDb().prepare("SELECT * FROM purchases WHERE id = ?").get(id);
}

export function patchPurchase(id: number, input: Record<string, unknown>) {
  const db = getDb();
  const patch = buildPatchSql("purchases", id, pickDefined(input));
  if (!patch) return getPurchase(id);
  db.prepare(patch.sql).run(patch.params);
  return getPurchase(id);
}

export function deletePurchase(id: number): boolean {
  const result = getDb().prepare("DELETE FROM purchases WHERE id = ?").run(id);
  return result.changes > 0;
}

export type OrderListOptions = {
  limit: number;
  offset: number;
  search?: string;
  payment_status?: string;
  shipping_status?: "shipped" | "not_shipped";
  source_channel?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
};

const ORDER_SORT: Record<string, string> = {
  order_number: "order_number",
  order_date: "order_date",
  grand_total: "grand_total",
  payment_status: "payment_status",
  order_status: "order_status",
  updated_at: "COALESCE(updated_at, created_at, '')",
  created_at: "created_at",
};

export function listOrders(options: OrderListOptions) {
  const db = getDb();
  const params: Record<string, unknown> = {};
  let where = "WHERE 1=1";
  if (options.payment_status?.trim()) {
    where += " AND payment_status = @payment_status";
    params.payment_status = options.payment_status.trim();
  }
  if (options.source_channel?.trim()) {
    where += " AND source_channel = @source_channel";
    params.source_channel = options.source_channel.trim();
  }
  if (options.shipping_status === "shipped") {
    where += " AND shipping_date IS NOT NULL AND shipping_date != ''";
  } else if (options.shipping_status === "not_shipped") {
    where += " AND (shipping_date IS NULL OR shipping_date = '') AND order_status = 'active'";
  }
  where += buildSearchClause(
    [
      "order_number",
      "ship_to_first_name",
      "ship_to_last_name",
      "ship_to_city",
      "notes",
      "tracking_number",
    ],
    options.search,
    params
  );

  const sortCol = resolveSortColumn(options.sortBy, ORDER_SORT, "order_date");
  const dir = parseSortDir(options.sortDir ?? null) === "asc" ? "ASC" : "DESC";

  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM orders ${where}`).get(params) as { c: number }
  ).c;
  const items = db
    .prepare(
      `SELECT * FROM orders ${where} ORDER BY ${sortCol} ${dir}, id DESC LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: options.limit, offset: options.offset });
  return { items, total };
}

export function createOrder(input: Record<string, unknown>) {
  const db = getDb();
  const payload = pickDefined(input);
  payload.created_at = nowIso();
  payload.updated_at = payload.created_at;
  const columns = Object.keys(payload);
  const placeholders = columns.map((k) => `@${k}`).join(", ");
  const result = db
    .prepare(`INSERT INTO orders(${columns.join(", ")}) VALUES(${placeholders})`)
    .run(payload);
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(result.lastInsertRowid) as Record<
    string,
    unknown
  >;
  const id = Number(row.id);
  logActivity({
    action: "order.created",
    entityType: "order",
    entityId: id,
    entityLabel: String(row.order_number ?? `Order ${id}`),
    source: row.source_channel === "etsy" ? "etsy_sync" : "user",
  });
  return row;
}

export function getOrder(id: number) {
  const db = getDb();
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!order) return null;
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id").all(id);
  return { ...order, items };
}

export function markOrderPaid(id: number) {
  const db = getDb();
  db.prepare(
    "UPDATE orders SET was_paid = 1, payment_status = ?, updated_at = ? WHERE id = ?"
  ).run("paid", nowIso(), id);
  const updated = getOrder(id) as Record<string, unknown> | null;
  if (updated) {
    logActivity({
      action: "order.marked_paid",
      entityType: "order",
      entityId: id,
      entityLabel: String(updated.order_number ?? `Order ${id}`),
    });
  }
  return updated;
}

export function markOrderShipped(
  id: number,
  input?: {
    shipper?: string;
    shipping_date?: string;
    seller_shipping_cost?: number;
    tracking_number?: string;
    shipped_without_paid_override?: boolean;
    force_unpaid?: boolean;
  }
) {
  const db = getDb();
  const order = getOrder(id) as Record<string, unknown> | null;
  if (!order) return null;

  const wasPaid = Number(order.was_paid) === 1;
  const override =
    input?.shipped_without_paid_override === true || input?.force_unpaid === true;

  if (!wasPaid && !override) {
    throw new OrderShipBlockedError();
  }

  const now = nowIso();
  const shippingDate = input?.shipping_date ?? now.slice(0, 10);
  const shipper = input?.shipper ?? null;
  const cost = input?.seller_shipping_cost ?? null;
  const tracking =
    typeof input?.tracking_number === "string" && input.tracking_number.trim()
      ? input.tracking_number.trim()
      : null;
  const overrideFlag = !wasPaid && override ? 1 : 0;

  const tableInfo = db.prepare("PRAGMA table_info(orders)").all() as Array<{ name: string }>;
  const hasTracking = tableInfo.some((row) => row.name === "tracking_number");

  if (hasTracking) {
    db.prepare(
      `UPDATE orders SET
        shipping_date = ?,
        shipper = COALESCE(?, shipper),
        seller_shipping_cost = COALESCE(?, seller_shipping_cost),
        tracking_number = COALESCE(?, tracking_number),
        shipped_without_paid_override = CASE WHEN ? = 1 THEN 1 ELSE shipped_without_paid_override END,
        updated_at = ?
      WHERE id = ?`
    ).run(shippingDate, shipper, cost, tracking, overrideFlag, now, id);
  } else {
    db.prepare(
      `UPDATE orders SET
        shipping_date = ?,
        shipper = COALESCE(?, shipper),
        seller_shipping_cost = COALESCE(?, seller_shipping_cost),
        shipped_without_paid_override = CASE WHEN ? = 1 THEN 1 ELSE shipped_without_paid_override END,
        updated_at = ?
      WHERE id = ?`
    ).run(shippingDate, shipper, cost, overrideFlag, now, id);
  }

  const shipped = getOrder(id) as Record<string, unknown> | null;
  if (shipped) {
    logActivity({
      action: "order.marked_shipped",
      entityType: "order",
      entityId: id,
      entityLabel: String(shipped.order_number ?? `Order ${id}`),
      detail: {
        shipper: shipped.shipper,
        tracking_number: shipped.tracking_number,
        shipping_date: shipped.shipping_date,
        shipped_without_paid_override: shipped.shipped_without_paid_override,
      },
    });
  }
  return shipped;
}


export function linkOrderCustomer(orderId: number, customerId: number) {
  const db = getDb();
  const customer = getCustomer(customerId);
  if (!customer) return null;
  const existing = getOrder(orderId) as Record<string, unknown> | null;
  if (!existing) return null;

  db.prepare("UPDATE orders SET customer_id = ?, updated_at = ? WHERE id = ?").run(
    customerId,
    nowIso(),
    orderId
  );

  const updated = getOrder(orderId) as Record<string, unknown> | null;
  if (updated) {
    const label = String(updated.order_number ?? `Order ${orderId}`);
    const cust = customer as Record<string, unknown>;
    const custLabel = [cust.first_name, cust.last_name].filter(Boolean).join(" ").trim();
    logActivity({
      action: "order.updated",
      entityType: "order",
      entityId: orderId,
      entityLabel: label,
      detail: { customer_id: customerId, customer_label: custLabel || `Customer ${customerId}` },
    });
  }
  return updated;
}

export function patchOrder(id: number, input: Record<string, unknown>) {
  const db = getDb();
  const patch = buildPatchSql("orders", id, pickDefined(input));
  if (!patch) return getOrder(id);
  db.prepare(patch.sql).run(patch.params);
  return getOrder(id);
}

export function upsertEtsyReceipt(input: {
  receipt_id: string;
  shop_id: string;
  receipt_json: string;
}) {
  const db = getDb();
  db.prepare(
    `
    INSERT INTO etsy_receipts(receipt_id, shop_id, receipt_json, synced_at)
    VALUES(@receipt_id, @shop_id, @receipt_json, @synced_at)
    ON CONFLICT(receipt_id) DO UPDATE SET
      shop_id = excluded.shop_id,
      receipt_json = excluded.receipt_json,
      synced_at = excluded.synced_at
  `
  ).run({
    ...input,
    synced_at: nowIso(),
  });
}
