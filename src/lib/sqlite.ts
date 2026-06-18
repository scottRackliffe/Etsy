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
  // ADR-017 spec says NOT NULL, but ALTER TABLE in SQLite cannot add NOT NULL constraints.
  // The UNIQUE index (idx_inventory_item_number) partially enforces uniqueness.
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
  picture_11: "TEXT",
  picture_12: "TEXT",
  picture_13: "TEXT",
  picture_14: "TEXT",
  picture_15: "TEXT",
  picture_16: "TEXT",
  picture_17: "TEXT",
  picture_18: "TEXT",
  picture_19: "TEXT",
  picture_20: "TEXT",
  video_path: "TEXT",
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
  etsy_when_made: "TEXT",
  etsy_taxonomy_id: "INTEGER",
  etsy_who_made: "TEXT",
  etsy_shipping_profile_id: "INTEGER",
  etsy_return_policy_id: "INTEGER",
  quantity: "INTEGER",
  category_tags: "TEXT",
  store_category: "TEXT",
  materials: "TEXT",
  item_weight: "REAL",
  item_weight_unit: "TEXT",
  item_length: "REAL",
  item_width: "REAL",
  item_height: "REAL",
  item_dimensions_unit: "TEXT",
  is_supply: "INTEGER DEFAULT 0",
  picture_classifications: "TEXT",
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
  is_listed: "INTEGER DEFAULT 0",
  receipt_description: "TEXT",
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
  easypost_shipment_id: "TEXT",
  label_url: "TEXT",
  label_format: "TEXT",
  shipping_rate_cents: "INTEGER",
  shipping_carrier_service: "TEXT",
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
  const existing = (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    (row) => row.name
  );

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
      receipt_image TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(inventory_id) REFERENCES inventory(id) ON DELETE RESTRICT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_name TEXT NOT NULL,
      purchase_date TEXT,
      receipt_image TEXT,
      shipping_price REAL,
      reference_number TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS receipt_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      cost REAL,
      inventory_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(receipt_id) REFERENCES receipts(id) ON DELETE CASCADE,
      FOREIGN KEY(inventory_id) REFERENCES inventory(id) ON DELETE SET NULL
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
    CREATE TABLE IF NOT EXISTS api_call_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      status_code INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS connection_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      last_heartbeat TEXT NOT NULL,
      duration_seconds INTEGER DEFAULT 0
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS etsy_taxonomy_nodes (
      id INTEGER PRIMARY KEY,
      parent_id INTEGER,
      name TEXT NOT NULL,
      full_path TEXT,
      level INTEGER NOT NULL DEFAULT 0
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS etsy_taxonomy_properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      taxonomy_id INTEGER NOT NULL,
      property_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      display_name TEXT,
      is_required INTEGER NOT NULL DEFAULT 0,
      supports_attributes INTEGER NOT NULL DEFAULT 0,
      supports_variations INTEGER NOT NULL DEFAULT 0,
      possible_values_json TEXT,
      scales_json TEXT,
      UNIQUE(taxonomy_id, property_id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS vendors (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      name                    TEXT    NOT NULL UNIQUE,
      address_1               TEXT,
      address_2               TEXT,
      city                    TEXT,
      state                   TEXT,
      postal_code             TEXT,
      country                 TEXT    DEFAULT 'US',
      contact_person          TEXT,
      email                   TEXT,
      phone                   TEXT,
      website                 TEXT,
      account_number          TEXT,
      payment_terms           TEXT,
      tax_id                  TEXT,
      is_preferred            INTEGER NOT NULL DEFAULT 0,
      vendor_category         TEXT,
      default_shipping_method TEXT,
      notes                   TEXT,
      is_active               INTEGER NOT NULL DEFAULT 1,
      created_at              TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at              TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS business_expenses (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_date          TEXT    NOT NULL,
      date_paid             TEXT,
      amount                REAL    NOT NULL,
      currency_code         TEXT    NOT NULL DEFAULT 'USD',
      payment_method        TEXT,
      vendor_id             INTEGER REFERENCES vendors(id),
      vendor_name           TEXT,
      category              TEXT    NOT NULL,
      subcategory           TEXT,
      tax_deductible        INTEGER NOT NULL DEFAULT 1,
      tax_category          TEXT,
      business_use_pct      REAL    NOT NULL DEFAULT 100.0,
      is_cogs               INTEGER NOT NULL DEFAULT 0,
      is_asset              INTEGER NOT NULL DEFAULT 0,
      depreciation_years    INTEGER,
      inventory_id          INTEGER REFERENCES inventory(id),
      invoice_number        TEXT,
      receipt_attached      INTEGER NOT NULL DEFAULT 0,
      receipt_path          TEXT,
      paid_by               TEXT,
      is_recurring          INTEGER NOT NULL DEFAULT 0,
      recurring_frequency   TEXT,
      recurring_next_date   TEXT,
      contract_end_date     TEXT,
      gl_account            TEXT,
      fiscal_quarter        TEXT,
      notes                 TEXT,
      created_at            TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at            TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS chart_of_accounts (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      acct_number    TEXT    NOT NULL UNIQUE,
      account_name   TEXT    NOT NULL,
      account_type   TEXT    NOT NULL,
      normal_balance TEXT    NOT NULL,
      description    TEXT,
      is_active      INTEGER NOT NULL DEFAULT 1,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS gl_transaction_rules (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_type TEXT    NOT NULL,
      description      TEXT,
      debit_acct       TEXT    NOT NULL,
      credit_acct      TEXT    NOT NULL,
      source_table     TEXT,
      source_column    TEXT,
      is_active        INTEGER NOT NULL DEFAULT 1,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed chart of accounts if empty
  const coaCount = db.prepare("SELECT COUNT(*) AS c FROM chart_of_accounts").get() as { c: number };
  if (coaCount.c === 0) {
    db.exec(`
      INSERT INTO chart_of_accounts (acct_number, account_name, account_type, normal_balance, description) VALUES
        ('1000', 'Cash',                       'Asset',          'debit',  'Cash on hand and in bank'),
        ('1100', 'Accounts Receivable',        'Asset',          'debit',  'Money owed by customers for sales'),
        ('1300', 'Inventory',                  'Asset',          'debit',  'Merchandise held for resale'),
        ('2100', 'Sales Tax Payable',          'Liability',      'credit', 'Tax collected, owed to state/local authority'),
        ('4000', 'Sales Revenue',              'Revenue',        'credit', 'Income from sale of merchandise'),
        ('4100', 'Shipping Income',            'Revenue',        'credit', 'Shipping charges collected from customers'),
        ('4800', 'Sales Returns & Allowances', 'Contra-Revenue', 'debit',  'Returns and allowances reducing gross revenue'),
        ('4900', 'Sales Discounts',            'Contra-Revenue', 'debit',  'Discounts given to customers (contra-income)'),
        ('5000', 'Cost of Goods Sold',         'COGS',           'debit',  'Cost of merchandise sold'),
        ('6100', 'Shipping Expense',           'Expense',        'debit',  'Seller-paid shipping costs to carriers'),
        ('6200', 'Operating Expenses',         'Expense',        'debit',  'Packaging, supplies, and other operating costs'),
        ('3000', 'Owner''s Equity',            'Equity',         'credit', 'Owner capital contributions'),
        ('3200', 'Retained Earnings',          'Equity',         'credit', 'Accumulated net income from prior periods');
    `);
  }

  const glCount = db.prepare("SELECT COUNT(*) AS c FROM gl_transaction_rules").get() as { c: number };
  if (glCount.c === 0) {
    db.exec(`
      INSERT INTO gl_transaction_rules (transaction_type, description, debit_acct, credit_acct, source_table, source_column) VALUES
        ('Sale',               'Sale recorded — AR increases, revenue recognized',     '1100', '4000', 'order_items',   'line_total'),
        ('COGS',               'Cost of sale — COGS recognized, inventory reduced',    '5000', '1300', 'inventory',     'purchase_cost'),
        ('Payment',            'Payment received — cash in, AR cleared',               '1000', '1100', 'orders',        'grand_total'),
        ('Discount',           'Discount given — contra-income, AR reduced',           '4900', '1100', 'orders',        'discount_total'),
        ('Shipping Revenue',   'Shipping charged to customer',                         '1100', '4100', 'orders',        'shipping_total'),
        ('Shipping Expense',   'Seller pays carrier for shipping',                     '6100', '1000', 'orders',        'seller_shipping_cost'),
        ('Tax Collected',      'Tax collected from customer — AR up, liability up',    '1100', '2100', 'orders',        'tax_total'),
        ('Tax Remittance',     'Tax paid to state — liability cleared, cash out',      '2100', '1000', 'tax_payments',  'amount'),
        ('Refund - Revenue',   'Refund issued — contra-revenue, cash returned',        '4800', '1000', 'orders',        'subtotal'),
        ('Refund - Tax',       'Refund tax portion — liability reversed, cash out',    '2100', '1000', 'orders',        'tax_total'),
        ('Refund - Inventory', 'Item returned to stock — inventory up, COGS reversed', '1300', '5000', 'inventory',     'purchase_cost'),
        ('Purchase',           'Buy inventory item for resale',                        '1300', '1000', 'purchases',     'purchase_price'),
        ('Purchase Shipping',  'Shipping cost to acquire inventory',                   '1300', '1000', 'purchases',     'shipping_price'),
        ('Other Cost',         'Operating expense (packaging, supplies, etc.)',        '6200', '1000', 'other_costs',   'amount'),
        ('Business Expense',   'Business overhead expense — debit expense acct, credit cash', '6200', '1000', 'business_expenses', 'amount');
    `);
  }

  // Ensure equity accounts + business expense GL rule exist on pre-existing databases
  db.exec(`
    INSERT OR IGNORE INTO chart_of_accounts (acct_number, account_name, account_type, normal_balance, description)
    VALUES ('3000', 'Owner''s Equity', 'Equity', 'credit', 'Owner capital contributions');
  `);
  db.exec(`
    INSERT OR IGNORE INTO chart_of_accounts (acct_number, account_name, account_type, normal_balance, description)
    VALUES ('3200', 'Retained Earnings', 'Equity', 'credit', 'Accumulated net income from prior periods');
  `);
  {
    const hasRule = db.prepare(
      "SELECT COUNT(*) AS c FROM gl_transaction_rules WHERE transaction_type = 'Business Expense'"
    ).get() as { c: number };
    if (hasRule.c === 0) {
      db.exec(`
        INSERT INTO gl_transaction_rules (transaction_type, description, debit_acct, credit_acct, source_table, source_column)
        VALUES ('Business Expense', 'Business overhead expense — debit expense acct, credit cash', '6200', '1000', 'business_expenses', 'amount');
      `);
    }
  }

  // Ensure reconciliation columns exist on pre-existing databases
  ensureTableColumns(db, "orders", ORDERS_RECONCILIATION_COLUMNS);
  ensureTableColumns(db, "customers", CUSTOMERS_RECONCILIATION_COLUMNS);
  ensureTableColumns(db, "purchases", { receipt_image: "TEXT", vendor_id: "INTEGER REFERENCES vendors(id)" });
  ensureTableColumns(db, "receipts", { vendor_id: "INTEGER REFERENCES vendors(id)" });
  ensureTableColumns(db, "inventory", { etsy_attributes_json: "TEXT" });

  // Indexes
  db.exec("CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory(status);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_inventory_date_of_sale ON inventory(date_of_sale);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_inventory_date_listed ON inventory(date_listed);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_purchases_inventory_id ON purchases(inventory_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_purchases_vendor_id ON purchases(vendor_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_receipts_vendor_id ON receipts(vendor_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_vendors_name ON vendors(name);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_vendors_is_active ON vendors(is_active);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_other_costs_inventory_id ON other_costs(inventory_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_business_expenses_date ON business_expenses(expense_date);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_business_expenses_category ON business_expenses(category);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_business_expenses_vendor_id ON business_expenses(vendor_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_orders_was_paid ON orders(was_paid);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_orders_shipping_date ON orders(shipping_date);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_orders_etsy_receipt_id ON orders(etsy_receipt_id);");
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
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);"
  );
  db.exec("CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action);");
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_customer_notes_customer_id ON customer_notes(customer_id);"
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_api_call_log_service_month ON api_call_log(service, created_at);"
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_connection_sessions_service ON connection_sessions(service, started_at);"
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_etsy_taxonomy_nodes_parent ON etsy_taxonomy_nodes(parent_id);"
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_etsy_taxonomy_properties_taxonomy ON etsy_taxonomy_properties(taxonomy_id);"
  );
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
