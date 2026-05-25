import fs from "node:fs";
import path from "node:path";
import { purgeOldActivityLog } from "@/lib/activity-log";
import { logger } from "@/lib/logging";
import { runStartupIntegrityCheckIfDue } from "@/lib/sqlite-integrity";
import Database from "better-sqlite3";

/**
 * better-sqlite3 uses a single synchronous connection (not thread-safe across instances).
 * The singleton below is the correct pattern for Next.js API routes in this app.
 */
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

export function getSqliteDatabasePath(): string {
  return getDatabasePath();
}

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

const ORDERS_RECONCILIATION_COLUMNS: Record<string, string> = {
  was_paid: "INTEGER DEFAULT 0",
  shipper: "TEXT",
  seller_shipping_cost: "REAL",
  shipped_without_paid_override: "INTEGER DEFAULT 0",
  etsy_receipt_id: "TEXT",
  shipping_date: "TEXT",
  ship_to_first_name: "TEXT",
  ship_to_last_name: "TEXT",
  ship_to_address_line_1: "TEXT",
  ship_to_address_line_2: "TEXT",
  ship_to_city: "TEXT",
  ship_to_state_province: "TEXT",
  ship_to_country: "TEXT",
  ship_to_postal_code: "TEXT",
  tracking_number: "TEXT",
};

const CUSTOMERS_RECONCILIATION_COLUMNS: Record<string, string> = {
  default_address_id: "INTEGER REFERENCES addresses(id)",
  currency_code: "TEXT DEFAULT 'USD'",
  is_active: "INTEGER DEFAULT 1",
};

function ensureTableColumns(
  db: Database.Database,
  table: string,
  requiredColumns: Record<string, string>
): void {
  const existing = (
    db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  ).map((row) => row.name);

  for (const [column, typeDef] of Object.entries(requiredColumns)) {
    if (!existing.includes(column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeDef};`);
    }
  }
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
      default_address_id INTEGER,
      currency_code TEXT DEFAULT 'USD',
      is_active INTEGER DEFAULT 1,
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
      order_status TEXT DEFAULT 'active',
      payment_status TEXT,
      was_paid INTEGER DEFAULT 0,
      shipper TEXT,
      seller_shipping_cost REAL,
      shipped_without_paid_override INTEGER DEFAULT 0,
      etsy_receipt_id TEXT,
      shipping_date TEXT,
      ship_to_first_name TEXT,
      ship_to_last_name TEXT,
      ship_to_address_line_1 TEXT,
      ship_to_address_line_2 TEXT,
      ship_to_city TEXT,
      ship_to_state_province TEXT,
      ship_to_country TEXT,
      ship_to_postal_code TEXT,
      tracking_number TEXT,
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

  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      entity_label TEXT,
      detail_json TEXT,
      source TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      note_text TEXT NOT NULL,
      note_type TEXT NOT NULL DEFAULT 'general',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Ensure reconciliation columns exist on pre-existing databases
  ensureTableColumns(db, "orders", ORDERS_RECONCILIATION_COLUMNS);
  ensureTableColumns(db, "customers", CUSTOMERS_RECONCILIATION_COLUMNS);

  // Indexes
  db.exec("CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory(status);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_inventory_date_of_sale ON inventory(date_of_sale);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_inventory_date_listed ON inventory(date_listed);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_purchases_inventory_id ON purchases(inventory_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_other_costs_inventory_id ON other_costs(inventory_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_orders_was_paid ON orders(was_paid);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_orders_shipping_date ON orders(shipping_date);");
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_orders_etsy_receipt_id ON orders(etsy_receipt_id);"
  );
  db.exec("CREATE INDEX IF NOT EXISTS idx_orders_shipper ON orders(shipper);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_addresses_customer_id ON addresses(customer_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_customers_is_active ON customers(is_active);");
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
  db.exec("CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_customer_notes_customer_id ON customer_notes(customer_id);");
}

function configureDatabasePragmas(db: Database.Database): void {
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
}

export function getDb(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const databasePath = getDatabasePath();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  dbInstance = new Database(databasePath);
  configureDatabasePragmas(dbInstance);

  if (!schemaReady) {
    ensureInventorySchema(dbInstance);
    ensureCoreTables(dbInstance);
    schemaReady = true;
    purgeOldActivityLog();
    runStartupIntegrityCheckIfDue(dbInstance);
  }

  return dbInstance;
}

export function resetSqliteConnection(): void {
  if (dbInstance) {
    try {
      dbInstance.pragma("wal_checkpoint(TRUNCATE)");
      dbInstance.close();
    } catch (error) {
      logger.warn("sqlite close during reset failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    dbInstance = null;
    schemaReady = false;
  }
}
