import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

let dbInstance: Database.Database | null = null;
let schemaReady = false;

const INVENTORY_COLUMNS: Record<string, string> = {
  item_number: "TEXT",
  description: "TEXT",
  purchase_cost: "REAL",
  shipping_cost: "REAL",
  sale_revenue: "REAL",
  date_purchased: "TEXT",
  date_listed: "TEXT",
  date_of_sale: "TEXT",
  shipping_date: "TEXT",
  picture_1: "TEXT",
  picture_2: "TEXT",
  picture_3: "TEXT",
  picture_4: "TEXT",
  picture_5: "TEXT",
  picture_6: "TEXT",
  picture_7: "TEXT",
  picture_8: "TEXT",
  picture_9: "TEXT",
  picture_10: "TEXT",
  thumbnail_path: "TEXT",
  condition_code: "TEXT",
  has_condition_issue: "INTEGER",
  condition_notes: "TEXT",
  condition_picture_1: "TEXT",
  condition_picture_2: "TEXT",
  condition_picture_3: "TEXT",
  condition_picture_4: "TEXT",
  condition_picture_5: "TEXT",
  status: "TEXT",
  etsy_listing_id: "TEXT",
  quantity: "INTEGER",
  category_tags: "TEXT",
  listing_title: "TEXT",
  listing_description: "TEXT",
  listing_tags: "TEXT",
  listing_category_path: "TEXT",
  listing_title_strategy: "TEXT",
  listing_product_story: "TEXT",
  listing_condition_clarity: "TEXT",
  listing_attributes: "TEXT",
  listing_pricing_shipping_notes: "TEXT",
  listing_quality_checklist: "TEXT",
  listing_draft_state: "TEXT",
  listing_draft_source: "TEXT",
  listing_export_id: "TEXT",
  listing_approved_at: "TEXT",
  listing_published_at: "TEXT",
  is_listed: "INTEGER",
  notes: "TEXT",
  created_at: "TEXT",
  updated_at: "TEXT",
};

function getDatabasePath(): string {
  const configuredPath = process.env.SQLITE_PATH?.trim();
  return configuredPath && configuredPath.length > 0
    ? configuredPath
    : path.join(process.cwd(), "data", "app.sqlite");
}

function ensureInventorySchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT
    );
  `);

  const columns = (db.prepare("PRAGMA table_info(inventory)").all() as Array<{ name: string }>).map(
    (row) => row.name
  );

  for (const [column, type] of Object.entries(INVENTORY_COLUMNS)) {
    if (!columns.includes(column)) {
      db.exec(`ALTER TABLE inventory ADD COLUMN ${column} ${type};`);
    }
  }

  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_item_number ON inventory(item_number);");
}

function ensureCoreTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      phone TEXT,
      address_1 TEXT,
      address_2 TEXT,
      city TEXT,
      state TEXT,
      postal_code TEXT,
      country TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventory_id INTEGER NOT NULL,
      vendor_name TEXT,
      purchase_date TEXT,
      purchase_price REAL,
      shipping_price REAL,
      reference_number TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(inventory_id) REFERENCES inventory(id) ON DELETE RESTRICT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS other_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventory_id INTEGER NOT NULL,
      cost_type TEXT,
      amount REAL NOT NULL DEFAULT 0,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(inventory_id) REFERENCES inventory(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE,
      customer_id INTEGER,
      order_date TEXT,
      order_status TEXT,
      payment_status TEXT,
      subtotal REAL,
      shipping_total REAL,
      tax_total REAL,
      discount_total REAL,
      grand_total REAL,
      source_channel TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      inventory_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL,
      line_total REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY(inventory_id) REFERENCES inventory(id) ON DELETE RESTRICT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      label TEXT,
      first_line TEXT,
      second_line TEXT,
      city TEXT,
      state TEXT,
      postal_code TEXT,
      country TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS etsy_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_id TEXT UNIQUE NOT NULL,
      shop_id TEXT NOT NULL,
      receipt_json TEXT NOT NULL,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS report_artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_name TEXT NOT NULL,
      report_params_json TEXT NOT NULL,
      artifact_path TEXT,
      artifact_json TEXT,
      generated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS listing_exports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      export_id TEXT UNIQUE NOT NULL,
      inventory_id INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(inventory_id) REFERENCES inventory(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS listing_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventory_id INTEGER NOT NULL,
      export_id TEXT,
      payload_json TEXT NOT NULL,
      source_label TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(inventory_id) REFERENCES inventory(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS listing_publish_previews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventory_id INTEGER NOT NULL,
      preview_hash TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(inventory_id) REFERENCES inventory(id) ON DELETE CASCADE
    );
  `);

  db.exec("CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory(status);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_purchases_inventory_id ON purchases(inventory_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_other_costs_inventory_id ON other_costs(inventory_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_addresses_customer_id ON addresses(customer_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_order_items_inventory_id ON order_items(inventory_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_etsy_receipts_shop_id ON etsy_receipts(shop_id);");
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_listing_exports_inventory_id ON listing_exports(inventory_id);"
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_listing_imports_inventory_id ON listing_imports(inventory_id);"
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_listing_publish_previews_inventory_id ON listing_publish_previews(inventory_id);"
  );
}

export function getDb(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const databasePath = getDatabasePath();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  dbInstance = new Database(databasePath);
  dbInstance.pragma("journal_mode = WAL");

  if (!schemaReady) {
    ensureInventorySchema(dbInstance);
    ensureCoreTables(dbInstance);
    schemaReady = true;
  }

  return dbInstance;
}
