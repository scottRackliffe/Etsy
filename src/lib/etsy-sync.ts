/**
 * Etsy receipt sync engine (ADR-019)
 *
 * Converts Etsy receipts into local customers, addresses, orders, and order_items.
 * Idempotent by etsy_receipt_id on orders — already-synced receipts are skipped.
 */
import { getDb } from "@/lib/sqlite";
import { getSetting, setSetting, deleteSetting } from "@/lib/settings-store";
import { getShopReceipts, type Receipt, type ReceiptTransaction } from "@/lib/etsy";
import { getValidAccessToken, refreshAndRetry } from "@/lib/auth-session";
import { EtsyApiError } from "@/lib/etsy";
import { ApiRouteError } from "@/lib/api-error";
import { logger } from "@/lib/logging";

type CookieReader = { get(name: string): { value: string } | undefined };

export type SyncResult = {
  synced: number;
  skipped_already_imported: number;
  skipped_errors: { receipt_id: string; reason: string }[];
  created_customers: number;
  created_addresses: number;
  created_orders: number;
  created_order_items: number;
  created_placeholder_inventory: number;
  pages_fetched: number;
  stopped_early: boolean;
};

const SYNC_LOCK_KEY = "sync_in_progress";
const LAST_SYNC_KEY = "last_etsy_sync_at";
const MAX_PAGES = 5;
const PAGE_SIZE = 200;

// ---------------------------------------------------------------------------
// Concurrent sync protection (ADR-019)
// ---------------------------------------------------------------------------

function acquireSyncLock(): void {
  const existing = getSetting(SYNC_LOCK_KEY);
  if (existing) {
    throw new ApiRouteError({
      status: 409,
      code: "VALIDATION_ERROR",
      message: "Sync already in progress",
      userMessage: "A sync is already in progress. Please wait for it to complete.",
      actions: ["Wait for the current sync to finish, then try again."],
      canRetry: false,
    });
  }
  setSetting(SYNC_LOCK_KEY, new Date().toISOString());
}

function releaseSyncLock(): void {
  deleteSetting(SYNC_LOCK_KEY);
}

// ---------------------------------------------------------------------------
// Money helpers — Etsy v3 returns { amount, divisor, currency_code } or string
// ---------------------------------------------------------------------------

function parseMoneyAmount(
  val: { amount: number; divisor: number } | string | null | undefined
): number | null {
  if (val == null) return null;
  if (typeof val === "string") {
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
  }
  if (typeof val === "object" && "amount" in val && "divisor" in val) {
    return val.amount / val.divisor;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Customer resolution (ADR-019 §2)
// ---------------------------------------------------------------------------

function resolveOrCreateCustomer(receipt: Receipt): number {
  const db = getDb();
  const buyerEmail = receipt.buyer_email || receipt.payment_email;
  const nameParts = splitName(receipt.name);

  // Match by email (case-insensitive)
  if (buyerEmail) {
    const byEmail = db
      .prepare("SELECT id FROM customers WHERE LOWER(email) = LOWER(?)")
      .get(buyerEmail.trim()) as { id: number } | undefined;
    if (byEmail) return byEmail.id;
  }

  // Fall back to name match (case-insensitive)
  if (nameParts.firstName || nameParts.lastName) {
    const byName = db
      .prepare(
        "SELECT id FROM customers WHERE LOWER(first_name) = LOWER(?) AND LOWER(last_name) = LOWER(?)"
      )
      .get(nameParts.firstName, nameParts.lastName) as { id: number } | undefined;
    if (byName) return byName.id;
  }

  // Create new customer
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO customers (first_name, last_name, email, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(nameParts.firstName, nameParts.lastName, buyerEmail || null, now, now);

  return Number(result.lastInsertRowid);
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = (fullName || "").trim();
  if (!trimmed) return { firstName: "", lastName: "" };
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx < 0) return { firstName: trimmed, lastName: "" };
  return {
    firstName: trimmed.slice(0, spaceIdx),
    lastName: trimmed.slice(spaceIdx + 1).trim(),
  };
}

// ---------------------------------------------------------------------------
// Address resolution (ADR-019 §2)
// ---------------------------------------------------------------------------

function resolveOrCreateAddress(customerId: number, receipt: Receipt): number {
  const db = getDb();
  const firstLine = (receipt.first_line || "").trim();
  const city = (receipt.city || "").trim();
  const postalCode = (receipt.zip || "").trim();
  const country = (receipt.country_iso || "").trim();

  // Match existing address (normalized comparison)
  if (firstLine && city && postalCode && country) {
    const existing = db
      .prepare(
        `SELECT id FROM addresses
         WHERE customer_id = ?
           AND LOWER(TRIM(first_line)) = LOWER(?)
           AND LOWER(TRIM(city)) = LOWER(?)
           AND TRIM(postal_code) = ?
           AND LOWER(TRIM(country)) = LOWER(?)`
      )
      .get(
        customerId,
        firstLine.toLowerCase(),
        city.toLowerCase(),
        postalCode,
        country.toLowerCase()
      ) as { id: number } | undefined;
    if (existing) return existing.id;
  }

  // Create new address
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO addresses (customer_id, label, first_line, second_line, city, state, postal_code, country, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
    )
    .run(
      customerId,
      "Etsy import",
      firstLine || null,
      receipt.second_line || null,
      city || null,
      receipt.state || null,
      postalCode || null,
      country || null,
      now,
      now
    );

  return Number(result.lastInsertRowid);
}

// ---------------------------------------------------------------------------
// Inventory resolution (ADR-019 §2)
// ---------------------------------------------------------------------------

function resolveOrCreateInventory(
  transaction: ReceiptTransaction,
  createdPlaceholders: Map<string, number>
): { inventoryId: number; isPlaceholder: boolean } {
  const db = getDb();
  const etsyListingId = String(transaction.listing_id);

  // Already created a placeholder for this listing_id in this sync run
  const cached = createdPlaceholders.get(etsyListingId);
  if (cached) return { inventoryId: cached, isPlaceholder: false };

  // Match by etsy_listing_id (exact string match, first by id ASC)
  const existing = db
    .prepare("SELECT id FROM inventory WHERE etsy_listing_id = ? ORDER BY id ASC LIMIT 1")
    .get(etsyListingId) as { id: number } | undefined;
  if (existing) {
    createdPlaceholders.set(etsyListingId, existing.id);
    return { inventoryId: existing.id, isPlaceholder: false };
  }

  // Create placeholder inventory row
  const now = new Date().toISOString();
  const itemNumber = `etsy-${etsyListingId}`;
  const description = transaction.title || `Imported from Etsy (listing_id ${etsyListingId})`;

  const result = db
    .prepare(
      `INSERT INTO inventory (item_number, description, status, quantity, is_listed, etsy_listing_id, created_at, updated_at)
       VALUES (?, ?, 'Listed', 1, 1, ?, ?, ?)`
    )
    .run(itemNumber, description, etsyListingId, now, now);

  const inventoryId = Number(result.lastInsertRowid);
  createdPlaceholders.set(etsyListingId, inventoryId);
  return { inventoryId, isPlaceholder: true };
}

// ---------------------------------------------------------------------------
// Receipt → order + order_items (ADR-019 §2)
// ---------------------------------------------------------------------------

function isReceiptAlreadySynced(receiptId: string): boolean {
  const db = getDb();
  const row = db.prepare("SELECT id FROM orders WHERE etsy_receipt_id = ?").get(receiptId) as
    | { id: number }
    | undefined;
  return !!row;
}

function importReceipt(
  receipt: Receipt,
  shopId: number,
  createdPlaceholders: Map<string, number>
): {
  createdCustomer: boolean;
  createdAddress: boolean;
  orderItemCount: number;
  placeholderCount: number;
} {
  const db = getDb();
  const transactions = receipt.transactions ?? [];

  // Skip receipts with no line items
  if (transactions.length === 0) {
    throw new Error("Receipt has no line items");
  }

  const now = new Date().toISOString();
  const receiptId = String(receipt.receipt_id);

  // Count existing customers/addresses before resolution for tracking
  const customerCountBefore = (
    db.prepare("SELECT COUNT(*) AS c FROM customers").get() as { c: number }
  ).c;
  const addressCountBefore = (
    db.prepare("SELECT COUNT(*) AS c FROM addresses").get() as { c: number }
  ).c;

  // Resolve or create customer
  const customerId = resolveOrCreateCustomer(receipt);
  const customerCountAfter = (
    db.prepare("SELECT COUNT(*) AS c FROM customers").get() as { c: number }
  ).c;
  const createdCustomer = customerCountAfter > customerCountBefore;

  // Resolve or create address
  const addressId = resolveOrCreateAddress(customerId, receipt);
  const addressCountAfter = (
    db.prepare("SELECT COUNT(*) AS c FROM addresses").get() as { c: number }
  ).c;
  const createdAddress = addressCountAfter > addressCountBefore;

  // Compute totals from receipt
  const totalPrice = parseMoneyAmount(receipt.total_price) ?? 0;
  const totalShipping = parseMoneyAmount(receipt.total_shipping_cost) ?? 0;
  const totalTax = parseMoneyAmount(receipt.total_tax_cost) ?? 0;

  // Receipt creation date → YYYY-MM-DD
  const orderDate = receipt.creation_tsz
    ? new Date(receipt.creation_tsz * 1000).toISOString().slice(0, 10)
    : now.slice(0, 10);

  // Ship-to snapshot
  const shipToNames = splitName(receipt.name);

  // Create order
  const orderResult = db
    .prepare(
      `INSERT INTO orders (
        order_number, customer_id, order_date, order_status, payment_status, was_paid,
        etsy_receipt_id, source_channel,
        ship_to_first_name, ship_to_last_name,
        ship_to_address_line_1, ship_to_address_line_2,
        ship_to_city, ship_to_state_province, ship_to_country, ship_to_postal_code,
        subtotal, shipping_total, tax_total, discount_total, grand_total,
        notes, created_at, updated_at
      ) VALUES (
        ?, ?, ?, 'active', ?, ?, ?, 'etsy',
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, 0, ?,
        'Synced from Etsy', ?, ?
      )`
    )
    .run(
      `ETSY-${receiptId}`,
      customerId,
      orderDate,
      receipt.was_paid ? "paid" : "unpaid",
      receipt.was_paid ? 1 : 0,
      receiptId,
      shipToNames.firstName,
      shipToNames.lastName,
      receipt.first_line || null,
      receipt.second_line || null,
      receipt.city || null,
      receipt.state || null,
      receipt.country_iso || null,
      receipt.zip || null,
      totalPrice,
      totalShipping,
      totalTax,
      totalPrice + totalShipping + totalTax,
      now,
      now
    );

  const orderId = Number(orderResult.lastInsertRowid);
  let placeholderCount = 0;

  // Create order_items — one per transaction/line item
  for (const txn of transactions) {
    const { inventoryId, isPlaceholder } = resolveOrCreateInventory(txn, createdPlaceholders);
    if (isPlaceholder) placeholderCount++;

    const unitPrice = txn.price ? txn.price.amount / txn.price.divisor : null;
    const qty = Math.max(1, txn.quantity ?? 1);
    const lineTotal = unitPrice != null ? unitPrice * qty : null;

    // Update inventory sale_revenue if we have a price and it's currently null
    if (unitPrice != null) {
      db.prepare(
        "UPDATE inventory SET sale_revenue = COALESCE(sale_revenue, ?), updated_at = ? WHERE id = ?"
      ).run(unitPrice, now, inventoryId);
    }

    db.prepare(
      `INSERT INTO order_items (order_id, inventory_id, quantity, unit_price, line_total, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(orderId, inventoryId, qty, unitPrice, lineTotal, now, now);
  }

  // Also cache the raw receipt JSON
  db.prepare(
    `INSERT INTO etsy_receipts (receipt_id, shop_id, receipt_json, synced_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(receipt_id) DO UPDATE SET
       receipt_json = excluded.receipt_json,
       synced_at = excluded.synced_at`
  ).run(receiptId, String(shopId), JSON.stringify(receipt), now);

  return {
    createdCustomer,
    createdAddress,
    orderItemCount: transactions.length,
    placeholderCount,
  };
}

// ---------------------------------------------------------------------------
// Main sync function (ADR-019)
// ---------------------------------------------------------------------------

export type SyncProgressCallback = (progress: {
  current: number;
  total: number;
  message: string;
}) => void;

export async function syncEtsyReceipts(
  cookieStore: CookieReader,
  shopId: number,
  options?: {
    onProgress?: SyncProgressCallback;
    shouldCancel?: () => boolean;
  }
): Promise<SyncResult> {
  acquireSyncLock();

  const result: SyncResult = {
    synced: 0,
    skipped_already_imported: 0,
    skipped_errors: [],
    created_customers: 0,
    created_addresses: 0,
    created_orders: 0,
    created_order_items: 0,
    created_placeholder_inventory: 0,
    pages_fetched: 0,
    stopped_early: false,
  };

  const createdPlaceholders = new Map<string, number>();
  let processed = 0;
  let estimatedTotal = 0;

  const reportProgress = (message: string) => {
    options?.onProgress?.({
      current: processed,
      total: estimatedTotal,
      message,
    });
  };

  try {
    let offset = 0;

    for (let page = 0; page < MAX_PAGES; page++) {
      if (options?.shouldCancel?.()) {
        result.stopped_early = true;
        break;
      }
      // Get a valid token (proactive refresh)
      const token = await getValidAccessToken(cookieStore);

      let data;
      try {
        data = await getShopReceipts(token, shopId, { limit: PAGE_SIZE, offset });
      } catch (err) {
        if (err instanceof EtsyApiError && err.status === 401) {
          data = await refreshAndRetry(cookieStore, `/shops/${shopId}/receipts`, (t) =>
            getShopReceipts(t, shopId, { limit: PAGE_SIZE, offset })
          );
        } else {
          throw err;
        }
      }

      result.pages_fetched++;
      const receipts = data.results ?? [];
      if (estimatedTotal === 0 && (data.count ?? 0) > 0) {
        estimatedTotal = Math.min(data.count ?? 0, MAX_PAGES * PAGE_SIZE);
      }
      if (estimatedTotal === 0 && receipts.length > 0) {
        estimatedTotal = receipts.length;
      }

      if (receipts.length === 0) break;

      // Check if all remaining receipts are already synced (early stop)
      let allAlreadySynced = true;

      for (const receipt of receipts) {
        if (options?.shouldCancel?.()) {
          result.stopped_early = true;
          break;
        }

        const receiptId = String(receipt.receipt_id);
        reportProgress(`Processing receipt #${receiptId}…`);

        if (isReceiptAlreadySynced(receiptId)) {
          result.skipped_already_imported++;
          processed++;
          reportProgress(`Skipped receipt #${receiptId} (already imported)`);
          continue;
        }

        allAlreadySynced = false;

        // Skip receipts with no line items
        if (!receipt.transactions || receipt.transactions.length === 0) {
          result.skipped_errors.push({
            receipt_id: receiptId,
            reason: "No line items in receipt",
          });
          continue;
        }

        try {
          const imported = importReceipt(receipt, shopId, createdPlaceholders);
          result.synced++;
          result.created_orders++;
          result.created_order_items += imported.orderItemCount;
          result.created_placeholder_inventory += imported.placeholderCount;
          if (imported.createdCustomer) result.created_customers++;
          if (imported.createdAddress) result.created_addresses++;
          processed++;
          reportProgress(`Imported receipt #${receiptId}`);
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          logger.warn("etsy.sync.receipt_import_failed", {
            receipt_id: receiptId,
            reason,
          });
          result.skipped_errors.push({ receipt_id: receiptId, reason });
          processed++;
        }
      }

      if (options?.shouldCancel?.()) {
        result.stopped_early = true;
        break;
      }

      // Stop paginating if all receipts on this page were already synced
      if (allAlreadySynced) {
        result.stopped_early = true;
        break;
      }

      // Check if there are more pages
      const totalFromEtsy = data.count ?? 0;
      offset += PAGE_SIZE;
      if (offset >= totalFromEtsy) break;
    }

    if (estimatedTotal === 0) estimatedTotal = Math.max(processed, 1);
    options?.onProgress?.({
      current: processed,
      total: estimatedTotal,
      message: "Finishing sync…",
    });

    // Update last sync timestamp
    setSetting(LAST_SYNC_KEY, new Date().toISOString());

    logger.info("etsy.sync.completed", {
      shop_id: shopId,
      synced: result.synced,
      skipped_already_imported: result.skipped_already_imported,
      skipped_errors: result.skipped_errors.length,
      pages_fetched: result.pages_fetched,
    });

    return result;
  } finally {
    releaseSyncLock();
  }
}
