import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/lib/sqlite";
import { logActivity } from "@/lib/activity-log";

const SAMPLE_PREFIX = "SAMPLE-%";

export function hasSampleData(): boolean {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM inventory WHERE item_number LIKE ?")
    .get(SAMPLE_PREFIX) as { c: number };
  return row.c > 0;
}

export function loadSampleData(): {
  items: number;
  customers: number;
  orders: number;
} {
  if (hasSampleData()) {
    return { items: 0, customers: 0, orders: 0 };
  }

  const sqlPath = path.join(process.cwd(), "fixtures", "sample-data.sql");
  let sql = fs.readFileSync(sqlPath, "utf8");
  sql = sql.replace(/^--.*$/gm, "");

  const db = getDb();
  const hasTracking = (
    db.prepare("PRAGMA table_info(orders)").all() as Array<{ name: string }>
  ).some((c) => c.name === "tracking_number");
  if (!hasTracking) {
    sql = sql.replace(
      /UPDATE orders SET tracking_number = '9400111899223344556677' WHERE order_number = 'SAMPLE-ORD-001';?\s*/g,
      ""
    );
  }

  const load = db.transaction(() => {
    db.exec(sql);
  });
  load();

  const counts = {
    items: (
      db
        .prepare("SELECT COUNT(*) AS c FROM inventory WHERE item_number LIKE ?")
        .get(SAMPLE_PREFIX) as { c: number }
    ).c,
    customers: (
      db.prepare("SELECT COUNT(*) AS c FROM customers WHERE email LIKE '%@example.com'").get() as {
        c: number;
      }
    ).c,
    orders: (
      db
        .prepare("SELECT COUNT(*) AS c FROM orders WHERE order_number LIKE 'SAMPLE-ORD-%'")
        .get() as { c: number }
    ).c,
  };

  logActivity({
    action: "system.sample_data_loaded",
    entityType: "system",
    detail: counts,
    source: "user",
  });

  return counts;
}

export function removeSampleData(): boolean {
  if (!hasSampleData()) {
    return false;
  }

  const db = getDb();
  const run = db.transaction(() => {
    const sampleIds = db
      .prepare("SELECT id FROM inventory WHERE item_number LIKE ?")
      .all(SAMPLE_PREFIX) as Array<{ id: number }>;
    const ids = sampleIds.map((r) => r.id);
    if (!ids.length) return;

    const placeholders = ids.map(() => "?").join(", ");

    db.prepare(`DELETE FROM order_items WHERE inventory_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM other_costs WHERE inventory_id IN (${placeholders})`).run(...ids);
    db.prepare("DELETE FROM orders WHERE order_number LIKE 'SAMPLE-ORD-%'").run();

    const orphanCustomers = db
      .prepare(
        `SELECT c.id FROM customers c
         WHERE c.id NOT IN (
           SELECT DISTINCT customer_id FROM orders
           WHERE customer_id IS NOT NULL
             AND order_number NOT LIKE 'SAMPLE-ORD-%'
         )`
      )
      .all() as Array<{ id: number }>;
    const sampleCustomerIds = orphanCustomers
      .filter((row) => {
        const hasNonSample = db
          .prepare(
            "SELECT 1 FROM orders WHERE customer_id = ? AND order_number NOT LIKE 'SAMPLE-ORD-%' LIMIT 1"
          )
          .get(row.id);
        return !hasNonSample;
      });
    for (const row of sampleCustomerIds) {
      db.prepare("DELETE FROM addresses WHERE customer_id = ?").run(row.id);
      db.prepare("DELETE FROM customer_notes WHERE customer_id = ?").run(row.id);
      db.prepare("DELETE FROM customers WHERE id = ?").run(row.id);
    }

    db.prepare(`DELETE FROM inventory WHERE id IN (${placeholders})`).run(...ids);
  });
  run();

  logActivity({
    action: "system.sample_data_removed",
    entityType: "system",
    source: "user",
  });

  return true;
}
