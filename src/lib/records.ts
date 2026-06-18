import { logActivity } from "@/lib/activity-log";
import { OrderShipBlockedError } from "@/lib/order-validation";
import { buildSearchClause, parseSortDir, resolveSortColumn } from "@/lib/list-query";

// ---------------------------------------------------------------------------
// Business Expenses
// ---------------------------------------------------------------------------

export type ExpenseListOptions = {
  limit: number;
  offset: number;
  search?: string;
  category?: string;
  payment_status?: string;
  from_date?: string;
  to_date?: string;
  is_recurring?: number;
  vendor_id?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
};

const EXPENSE_SORT: Record<string, string> = {
  expense_date: "e.expense_date",
  amount: "e.amount",
  category: "e.category",
  vendor_name: "e.vendor_name",
  payment_status: "e.payment_status",
  created_at: "e.created_at",
};

export function listExpenses(options: ExpenseListOptions) {
  const db = getDb();
  const params: Record<string, unknown> = {};
  let where = "WHERE 1=1";
  if (options.category?.trim()) {
    where += " AND e.category = @category";
    params.category = options.category.trim();
  }
  if (options.from_date) {
    where += " AND e.expense_date >= @from_date";
    params.from_date = options.from_date;
  }
  if (options.to_date) {
    where += " AND e.expense_date <= @to_date";
    params.to_date = options.to_date;
  }
  if (options.is_recurring === 0 || options.is_recurring === 1) {
    where += " AND e.is_recurring = @is_recurring";
    params.is_recurring = options.is_recurring;
  }
  if (options.payment_status?.trim()) {
    where += " AND e.payment_status = @payment_status";
    params.payment_status = options.payment_status.trim();
  }
  if (options.vendor_id != null) {
    where += " AND e.vendor_id = @vendor_id";
    params.vendor_id = options.vendor_id;
  }
  where += buildSearchClause(
    ["e.vendor_name", "e.category", "e.subcategory", "e.notes", "e.invoice_number", "e.paid_by"],
    options.search,
    params
  );

  const sortCol = resolveSortColumn(options.sortBy, EXPENSE_SORT, "expense_date");
  const dir = parseSortDir(options.sortDir ?? null) === "asc" ? "ASC" : "DESC";

  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM business_expenses e ${where}`).get(params) as { c: number }
  ).c;
  const items = db
    .prepare(
      `SELECT e.*, v.name AS resolved_vendor_name
       FROM business_expenses e
       LEFT JOIN vendors v ON v.id = e.vendor_id
       ${where}
       ORDER BY ${sortCol} ${dir}, e.id DESC
       LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: options.limit, offset: options.offset });
  return { items, total };
}

export function getExpense(id: number) {
  const db = getDb();
  return db
    .prepare(
      `SELECT e.*, v.name AS resolved_vendor_name
       FROM business_expenses e
       LEFT JOIN vendors v ON v.id = e.vendor_id
       WHERE e.id = ?`
    )
    .get(id) ?? null;
}

export function createExpense(input: Record<string, unknown>) {
  const db = getDb();
  const payload = pickDefined(input);
  payload.created_at = nowIso();
  payload.updated_at = payload.created_at;
  if (payload.vendor_id && !payload.vendor_name) {
    const v = db.prepare("SELECT name FROM vendors WHERE id = ?").get(payload.vendor_id) as { name: string } | undefined;
    if (v) payload.vendor_name = v.name;
  }
  const columns = Object.keys(payload);
  const placeholders = columns.map((k) => `@${k}`).join(", ");
  const result = db
    .prepare(`INSERT INTO business_expenses(${columns.join(", ")}) VALUES(${placeholders})`)
    .run(payload);
  return getExpense(result.lastInsertRowid as number);
}

export function patchExpense(id: number, input: Record<string, unknown>) {
  const db = getDb();
  const cleaned = pickDefined(input);
  if (cleaned.vendor_id && !cleaned.vendor_name) {
    const v = db.prepare("SELECT name FROM vendors WHERE id = ?").get(cleaned.vendor_id) as { name: string } | undefined;
    if (v) cleaned.vendor_name = v.name;
  }
  const patch = buildPatchSql("business_expenses", id, cleaned);
  if (!patch) return getExpense(id);
  db.prepare(patch.sql).run(patch.params);
  return getExpense(id);
}

export function deleteExpense(id: number): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM business_expenses WHERE id = ?").run(id);
  return result.changes > 0;
}

export function listExpenseCategories() {
  const db = getDb();
  const categories = db
    .prepare("SELECT DISTINCT category FROM business_expenses WHERE category IS NOT NULL AND category != '' ORDER BY category")
    .all() as Array<{ category: string }>;
  const subcategories = db
    .prepare("SELECT DISTINCT subcategory FROM business_expenses WHERE subcategory IS NOT NULL AND subcategory != '' ORDER BY subcategory")
    .all() as Array<{ subcategory: string }>;
  const paymentMethods = db
    .prepare("SELECT DISTINCT payment_method FROM business_expenses WHERE payment_method IS NOT NULL AND payment_method != '' ORDER BY payment_method")
    .all() as Array<{ payment_method: string }>;
  const taxCategories = db
    .prepare("SELECT DISTINCT tax_category FROM business_expenses WHERE tax_category IS NOT NULL AND tax_category != '' ORDER BY tax_category")
    .all() as Array<{ tax_category: string }>;
  const paidByOptions = db
    .prepare("SELECT DISTINCT paid_by FROM business_expenses WHERE paid_by IS NOT NULL AND paid_by != '' ORDER BY paid_by")
    .all() as Array<{ paid_by: string }>;

  const defaultCategories = [
    "Inventory / COGS", "Shipping & Postage", "Packaging Materials",
    "Platform Fees", "Payment Processing Fees", "Advertising & Marketing",
    "Photography / Equipment", "Software & Subscriptions", "Office Supplies",
    "Professional Services", "Rent / Home Office", "Utilities",
    "Internet", "Phone", "Insurance", "Education & Training",
    "Travel & Lodging", "Meals & Entertainment", "Vehicle / Mileage",
    "Equipment Repairs", "Licenses & Permits", "Miscellaneous",
  ];
  const defaultPaymentMethods = [
    "Credit Card", "Debit Card", "PayPal", "Bank Transfer", "Cash", "Check",
  ];
  const defaultTaxCategories = [
    "COGS", "Office Expense", "Advertising", "Insurance", "Professional Fees",
    "Rent", "Utilities", "Travel", "Meals (50%)", "Depreciation", "Other",
  ];
  const defaultPaidBy = ["Owner 1", "Owner 2", "Business Account"];

  const merge = <T>(dbValues: T[], defaults: string[], key: keyof T) => {
    const set = new Set(dbValues.map((r) => r[key] as string));
    for (const d of defaults) if (!set.has(d)) set.add(d);
    return Array.from(set).sort();
  };

  return {
    categories: merge(categories, defaultCategories, "category"),
    subcategories: subcategories.map((r) => r.subcategory),
    payment_methods: merge(paymentMethods, defaultPaymentMethods, "payment_method"),
    tax_categories: merge(taxCategories, defaultTaxCategories, "tax_category"),
    paid_by: merge(paidByOptions, defaultPaidBy, "paid_by"),
  };
}

export function getExpenseSummary(from_date?: string, to_date?: string) {
  const db = getDb();
  let where = "WHERE 1=1";
  const params: Record<string, string> = {};
  if (from_date) { where += " AND expense_date >= @from_date"; params.from_date = from_date; }
  if (to_date) { where += " AND expense_date <= @to_date"; params.to_date = to_date; }

  const byCategory = db
    .prepare(
      `SELECT category, COUNT(*) AS count, ROUND(SUM(amount * business_use_pct / 100.0), 2) AS total
       FROM business_expenses ${where}
       GROUP BY category ORDER BY total DESC`
    )
    .all(params) as Array<{ category: string; count: number; total: number }>;

  const byMonth = db
    .prepare(
      `SELECT strftime('%Y-%m', expense_date) AS month, ROUND(SUM(amount * business_use_pct / 100.0), 2) AS total
       FROM business_expenses ${where}
       GROUP BY month ORDER BY month`
    )
    .all(params) as Array<{ month: string; total: number }>;

  const totals = db
    .prepare(
      `SELECT COUNT(*) AS count,
              ROUND(SUM(amount), 2) AS gross_total,
              ROUND(SUM(amount * business_use_pct / 100.0), 2) AS adjusted_total,
              ROUND(SUM(CASE WHEN tax_deductible = 1 THEN amount * business_use_pct / 100.0 ELSE 0 END), 2) AS deductible_total
       FROM business_expenses ${where}`
    )
    .get(params) as { count: number; gross_total: number; adjusted_total: number; deductible_total: number };

  const byStatus = db
    .prepare(
      `SELECT payment_status, COUNT(*) AS count, ROUND(SUM(amount), 2) AS total
       FROM business_expenses ${where}
       GROUP BY payment_status ORDER BY payment_status`
    )
    .all(params) as Array<{ payment_status: string; count: number; total: number }>;

  const recurringCount = (
    db.prepare(`SELECT COUNT(*) AS c FROM business_expenses ${where} AND is_recurring = 1`).get(params) as { c: number }
  ).c;

  return { by_category: byCategory, by_month: byMonth, by_status: byStatus, totals, recurring_count: recurringCount };
}

export function listUpcomingExpenses(daysAhead: number = 30) {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const cutoff = new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);
  return db
    .prepare(
      `SELECT * FROM business_expenses
       WHERE is_recurring = 1
         AND recurring_next_date IS NOT NULL
         AND recurring_next_date >= @today
         AND recurring_next_date <= @cutoff
       ORDER BY recurring_next_date ASC`
    )
    .all({ today, cutoff });
}

// ---------------------------------------------------------------------------
// Bill Payments (AP Lite)
// ---------------------------------------------------------------------------

export function recomputePaymentStatus(expenseId: number) {
  const db = getDb();
  const expense = db.prepare("SELECT amount FROM business_expenses WHERE id = ?").get(expenseId) as { amount: number } | undefined;
  if (!expense) return;
  const paidRow = db.prepare("SELECT COALESCE(SUM(amount), 0) AS paid FROM bill_payments WHERE expense_id = ?").get(expenseId) as { paid: number };
  let status = "unpaid";
  if (paidRow.paid >= expense.amount) status = "paid";
  else if (paidRow.paid > 0) status = "partial";
  const lastPayment = db.prepare("SELECT payment_date FROM bill_payments WHERE expense_id = ? ORDER BY payment_date DESC LIMIT 1").get(expenseId) as { payment_date: string } | undefined;
  db.prepare("UPDATE business_expenses SET payment_status = ?, date_paid = ?, updated_at = ? WHERE id = ?")
    .run(status, status === "paid" ? (lastPayment?.payment_date ?? nowIso()) : null, nowIso(), expenseId);
}

export function listBillPayments(expenseId: number) {
  const db = getDb();
  return db
    .prepare("SELECT * FROM bill_payments WHERE expense_id = ? ORDER BY payment_date DESC")
    .all(expenseId);
}

export function createBillPayment(expenseId: number, input: { payment_date: string; amount: number; payment_method?: string | null; reference_number?: string | null; notes?: string | null }) {
  const db = getDb();
  const result = db.prepare(
    `INSERT INTO bill_payments (expense_id, payment_date, amount, payment_method, reference_number, notes)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(expenseId, input.payment_date, input.amount, input.payment_method ?? null, input.reference_number ?? null, input.notes ?? null);
  recomputePaymentStatus(expenseId);
  return db.prepare("SELECT * FROM bill_payments WHERE id = ?").get(result.lastInsertRowid);
}

export function deleteBillPayment(expenseId: number, paymentId: number): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM bill_payments WHERE id = ? AND expense_id = ?").run(paymentId, expenseId);
  if (result.changes > 0) recomputePaymentStatus(expenseId);
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// Vendors (ADR-076)
// ---------------------------------------------------------------------------

export type VendorListOptions = {
  limit: number;
  offset: number;
  search?: string;
  is_active?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
};

const VENDOR_SORT: Record<string, string> = {
  name: "v.name",
  city: "v.city",
  contact_person: "v.contact_person",
  created_at: "v.created_at",
};

export function listVendors(options: VendorListOptions) {
  const db = getDb();
  const params: Record<string, unknown> = {};
  let where = "WHERE 1=1";
  if (options.is_active === 0 || options.is_active === 1) {
    where += " AND v.is_active = @is_active";
    params.is_active = options.is_active;
  }
  where += buildSearchClause(
    ["v.name", "v.contact_person", "v.email", "v.phone", "v.city", "v.vendor_category", "v.account_number"],
    options.search,
    params
  );

  const sortCol = resolveSortColumn(options.sortBy, VENDOR_SORT, "name");
  const dir = parseSortDir(options.sortDir ?? null) === "asc" ? "ASC" : "DESC";

  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM vendors v ${where}`).get(params) as { c: number }
  ).c;
  const items = db
    .prepare(
      `SELECT v.*,
              COALESCE(pc.purchase_count, 0) AS purchase_count,
              COALESCE(pc.total_spend, 0) AS total_spend
       FROM vendors v
       LEFT JOIN (
         SELECT vendor_id,
                COUNT(*) AS purchase_count,
                SUM(COALESCE(purchase_price, 0) + COALESCE(shipping_price, 0)) AS total_spend
         FROM purchases
         WHERE vendor_id IS NOT NULL
         GROUP BY vendor_id
       ) pc ON pc.vendor_id = v.id
       ${where}
       ORDER BY ${sortCol} ${dir}, v.id DESC
       LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: options.limit, offset: options.offset });
  return { items, total };
}

export function getVendor(id: number) {
  const db = getDb();
  const vendor = db.prepare("SELECT * FROM vendors WHERE id = ?").get(id);
  if (!vendor) return null;
  const summary = db
    .prepare(
      `SELECT COUNT(*) AS purchase_count,
              COALESCE(SUM(COALESCE(purchase_price, 0) + COALESCE(shipping_price, 0)), 0) AS total_spend,
              MAX(purchase_date) AS last_purchase_date
       FROM purchases WHERE vendor_id = ?`
    )
    .get(id) as { purchase_count: number; total_spend: number; last_purchase_date: string | null };
  return { ...(vendor as Record<string, unknown>), ...summary };
}

export function createVendor(input: Record<string, unknown>) {
  const db = getDb();
  const payload = pickDefined(input);
  payload.created_at = nowIso();
  payload.updated_at = payload.created_at;
  if (!payload.country) payload.country = "US";
  const columns = Object.keys(payload);
  const placeholders = columns.map((k) => `@${k}`).join(", ");
  const result = db
    .prepare(`INSERT INTO vendors(${columns.join(", ")}) VALUES(${placeholders})`)
    .run(payload);
  return db.prepare("SELECT * FROM vendors WHERE id = ?").get(result.lastInsertRowid);
}

export function patchVendor(id: number, input: Record<string, unknown>) {
  const db = getDb();
  const patch = buildPatchSql("vendors", id, pickDefined(input));
  if (!patch) return getVendor(id);
  db.prepare(patch.sql).run(patch.params);
  return getVendor(id);
}

export function softDeleteVendor(id: number): boolean {
  const db = getDb();
  const result = db
    .prepare("UPDATE vendors SET is_active = 0, updated_at = ? WHERE id = ?")
    .run(nowIso(), id);
  return result.changes > 0;
}

export function listVendorPurchases(
  vendorId: number,
  limit: number,
  offset: number
) {
  const db = getDb();
  const total = (
    db.prepare("SELECT COUNT(*) AS c FROM purchases WHERE vendor_id = ?").get(vendorId) as {
      c: number;
    }
  ).c;
  const items = db
    .prepare(
      `SELECT p.*, i.item_number, i.description AS item_description
       FROM purchases p
       LEFT JOIN inventory i ON i.id = p.inventory_id
       WHERE p.vendor_id = ?
       ORDER BY p.purchase_date DESC, p.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(vendorId, limit, offset);
  return { items, total };
}
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
  store_category?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
};

const INVENTORY_SORT: Record<string, string> = {
  item_number: "item_number",
  description: "description",
  store_category: "store_category",
  status: "status",
  updated_at: "COALESCE(updated_at, created_at, '')",
  created_at: "created_at",
  sale_revenue: "sale_revenue",
  date_purchased: "date_purchased",
  date_listed: "date_listed",
  margin_pct: "CASE WHEN sale_revenue > 0 THEN ((sale_revenue - COALESCE(purchase_cost, 0) - COALESCE(shipping_cost, 0)) * 100.0 / sale_revenue) ELSE NULL END",
};

export function listInventory(options: InventoryListOptions) {
  const db = getDb();
  const params: Record<string, unknown> = {};
  let where = "WHERE 1=1";
  if (options.status?.trim()) {
    where += " AND status = @status";
    params.status = options.status.trim();
  }
  if (options.store_category?.trim()) {
    where += " AND store_category = @store_category";
    params.store_category = options.store_category.trim();
  }
  where += buildSearchClause(
    ["item_number", "description", "listing_title", "category_tags", "store_category", "notes"],
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
  last_name: "c.last_name",
  first_name: "c.first_name",
  email: "c.email",
  updated_at: "COALESCE(c.updated_at, c.created_at, '')",
  created_at: "c.created_at",
};

export function listCustomers(options: CustomerListOptions) {
  const db = getDb();
  const params: Record<string, unknown> = {};
  let where = "WHERE 1=1";
  if (options.is_active === 0 || options.is_active === 1) {
    where += " AND c.is_active = @is_active";
    params.is_active = options.is_active;
  }
  where += buildSearchClause(
    ["c.first_name", "c.last_name", "c.email", "c.phone", "c.city", "c.notes"],
    options.search,
    params
  );

  const sortCol = resolveSortColumn(options.sortBy, CUSTOMER_SORT, "last_name");
  const dir = parseSortDir(options.sortDir ?? null) === "asc" ? "ASC" : "DESC";

  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM customers c ${where}`).get(params) as { c: number }
  ).c;
  const items = db
    .prepare(
      `SELECT c.*, COALESCE(oc.order_count, 0) AS order_count
       FROM customers c
       LEFT JOIN (
         SELECT customer_id, COUNT(*) AS order_count
         FROM orders
         WHERE order_status = 'active' AND customer_id IS NOT NULL
         GROUP BY customer_id
       ) oc ON oc.customer_id = c.id
       ${where}
       ORDER BY ${sortCol} ${dir}, c.id DESC
       LIMIT @limit OFFSET @offset`
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

function resolveVendorName(db: ReturnType<typeof getDb>, payload: Record<string, SqlValue>) {
  if (payload.vendor_id != null && typeof payload.vendor_id === "number") {
    const vendor = db.prepare("SELECT name FROM vendors WHERE id = ?").get(payload.vendor_id) as
      | { name: string }
      | undefined;
    if (vendor) payload.vendor_name = vendor.name;
  }
}

export function createPurchase(input: Record<string, unknown>) {
  const db = getDb();
  const payload = pickDefined(input);
  resolveVendorName(db, payload);
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
  const payload = pickDefined(input);
  resolveVendorName(db, payload);
  const patch = buildPatchSql("purchases", id, payload);
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
  order_status?: string;
  payment_status?: string;
  shipping_status?: "shipped" | "not_shipped";
  source_channel?: string;
  customer_id?: number;
  from_date?: string;
  to_date?: string;
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
  if (options.order_status?.trim()) {
    where += " AND order_status = @order_status";
    params.order_status = options.order_status.trim();
  }
  if (options.payment_status?.trim()) {
    where += " AND payment_status = @payment_status";
    params.payment_status = options.payment_status.trim();
  }
  if (options.source_channel?.trim()) {
    where += " AND source_channel = @source_channel";
    params.source_channel = options.source_channel.trim();
  }
  if (options.customer_id != null) {
    where += " AND customer_id = @customer_id";
    params.customer_id = options.customer_id;
  }
  if (options.shipping_status === "shipped") {
    where += " AND shipping_date IS NOT NULL AND shipping_date != ''";
  } else if (options.shipping_status === "not_shipped") {
    where += " AND (shipping_date IS NULL OR shipping_date = '') AND order_status = 'active'";
  }
  if (options.from_date?.trim()) {
    where += " AND order_date >= @from_date";
    params.from_date = options.from_date.trim();
  }
  if (options.to_date?.trim()) {
    where += " AND order_date <= @to_date";
    params.to_date = options.to_date.trim();
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
  db.prepare("UPDATE orders SET was_paid = 1, payment_status = ?, updated_at = ? WHERE id = ?").run(
    "paid",
    nowIso(),
    id
  );
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
  const override = input?.shipped_without_paid_override === true || input?.force_unpaid === true;

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

  const financialKeys = ["shipping_total", "tax_total", "discount_total", "subtotal"];
  if (financialKeys.some((k) => input[k] !== undefined)) {
    const row = db.prepare("SELECT subtotal, shipping_total, tax_total, discount_total FROM orders WHERE id = ?").get(id) as
      | { subtotal: number | null; shipping_total: number | null; tax_total: number | null; discount_total: number | null }
      | undefined;
    if (row) {
      const grand = (row.subtotal ?? 0) + (row.shipping_total ?? 0) + (row.tax_total ?? 0) - (row.discount_total ?? 0);
      db.prepare("UPDATE orders SET grand_total = ?, updated_at = ? WHERE id = ?").run(grand, nowIso(), id);
    }
  }

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
