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

export function listInventory(limit: number, offset: number) {
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) AS c FROM inventory").get() as { c: number }).c;
  const items = db
    .prepare(
      "SELECT * FROM inventory ORDER BY COALESCE(updated_at, created_at, '') DESC, id DESC LIMIT ? OFFSET ?"
    )
    .all(limit, offset);
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

export function listCustomers(limit: number, offset: number) {
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) AS c FROM customers").get() as { c: number }).c;
  const items = db
    .prepare(
      "SELECT * FROM customers ORDER BY COALESCE(updated_at, created_at, '') DESC, id DESC LIMIT ? OFFSET ?"
    )
    .all(limit, offset);
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

export function listPurchases(limit: number, offset: number) {
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) AS c FROM purchases").get() as { c: number }).c;
  const items = db
    .prepare(
      "SELECT * FROM purchases ORDER BY COALESCE(updated_at, created_at, '') DESC, id DESC LIMIT ? OFFSET ?"
    )
    .all(limit, offset);
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

export function listOrders(limit: number, offset: number) {
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) AS c FROM orders").get() as { c: number }).c;
  const items = db
    .prepare(
      "SELECT * FROM orders ORDER BY COALESCE(updated_at, created_at, '') DESC, id DESC LIMIT ? OFFSET ?"
    )
    .all(limit, offset);
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
  return db.prepare("SELECT * FROM orders WHERE id = ?").get(result.lastInsertRowid);
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
  return getOrder(id);
}

export function markOrderShipped(
  id: number,
  input?: { shipper?: string; shipping_date?: string; seller_shipping_cost?: number; force_unpaid?: boolean }
) {
  const db = getDb();
  const order = getOrder(id) as Record<string, unknown> | null;
  if (!order) return null;

  const now = nowIso();
  const shippingDate = input?.shipping_date ?? now.slice(0, 10);
  const shipper = input?.shipper ?? null;
  const cost = input?.seller_shipping_cost ?? null;

  const overrideFlag =
    !order.was_paid && input?.force_unpaid ? 1 : 0;

  db.prepare(
    `UPDATE orders SET
      order_status = 'shipped',
      shipping_date = ?,
      shipper = COALESCE(?, shipper),
      seller_shipping_cost = COALESCE(?, seller_shipping_cost),
      shipped_without_paid_override = CASE WHEN ? = 1 THEN 1 ELSE shipped_without_paid_override END,
      updated_at = ?
    WHERE id = ?`
  ).run(shippingDate, shipper, cost, overrideFlag, now, id);
  return getOrder(id);
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
