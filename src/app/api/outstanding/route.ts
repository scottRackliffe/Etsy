/**
 * GET /api/outstanding
 *
 * Returns all outstanding items per ADR-020: paid-not-shipped, unpaid,
 * in-stock-not-listed, missing-address, and missing-shipping-cost.
 * Each item includes type, label, target tab, and record id.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { getDb } from "@/lib/sqlite";
import { computeListingScore, type ListingScoreInput } from "@/lib/listing-score";

export type OutstandingItem = {
  type: string;
  type_label: string;
  label: string;
  target_tab: string;
  record_id: number | string;
  date: string | null;
};

function queryOutstandingItems(): OutstandingItem[] {
  const db = getDb();
  const items: OutstandingItem[] = [];

  // Type 1: Orders paid but not yet shipped (ADR-020 §1)
  const paidNotShipped = db
    .prepare(
      `SELECT id, order_number, ship_to_first_name, ship_to_last_name, order_date
       FROM orders
       WHERE order_status = 'active'
         AND was_paid = 1
         AND (shipping_date IS NULL OR shipping_date = '')`
    )
    .all() as Array<{
    id: number;
    order_number: string | null;
    ship_to_first_name: string | null;
    ship_to_last_name: string | null;
    order_date: string | null;
  }>;

  for (const o of paidNotShipped) {
    const name = [o.ship_to_first_name, o.ship_to_last_name].filter(Boolean).join(" ");
    items.push({
      type: "paid_not_shipped",
      type_label: "Paid not shipped",
      label: `Order ${o.order_number ?? `#${o.id}`}${name ? ` – ${name}` : ""} – not shipped`,
      target_tab: "sales",
      record_id: o.id,
      date: o.order_date,
    });
  }

  // Type 2: Orders not yet marked paid (ADR-020 §2)
  const unpaid = db
    .prepare(
      `SELECT id, order_number, ship_to_first_name, ship_to_last_name, order_date
       FROM orders
       WHERE order_status = 'active'
         AND (was_paid = 0 OR was_paid IS NULL)`
    )
    .all() as Array<{
    id: number;
    order_number: string | null;
    ship_to_first_name: string | null;
    ship_to_last_name: string | null;
    order_date: string | null;
  }>;

  for (const o of unpaid) {
    const name = [o.ship_to_first_name, o.ship_to_last_name].filter(Boolean).join(" ");
    items.push({
      type: "unpaid",
      type_label: "Unpaid",
      label: `Order ${o.order_number ?? `#${o.id}`}${name ? ` – ${name}` : ""} – unpaid`,
      target_tab: "sales",
      record_id: o.id,
      date: o.order_date,
    });
  }

  // Type 4: Inventory in stock but not listed (ADR-020 §4)
  const notListed = db
    .prepare(
      `SELECT id, item_number, description, created_at
       FROM inventory
       WHERE status = 'In stock' AND (date_listed IS NULL OR date_listed = '')`
    )
    .all() as Array<{
    id: number;
    item_number: string | null;
    description: string | null;
    created_at: string | null;
  }>;

  for (const item of notListed) {
    const desc = item.description
      ? item.description.length > 40
        ? item.description.slice(0, 40) + "…"
        : item.description
      : "";
    items.push({
      type: "not_listed",
      type_label: "Not listed",
      label: `Item ${item.item_number ?? `#${item.id}`}${desc ? ` – ${desc}` : ""} – not listed`,
      target_tab: "inventory",
      record_id: item.id,
      date: item.created_at,
    });
  }

  // Type 5: Customers with no address or incomplete address (ADR-020 §5)
  const missingAddress = db
    .prepare(
      `SELECT c.id, c.first_name, c.last_name, c.created_at,
              c.address_1, c.city, c.postal_code, c.country
       FROM customers c
       WHERE c.id NOT IN (
         SELECT a.customer_id FROM addresses a
         WHERE a.first_line IS NOT NULL AND a.first_line <> ''
           AND a.city IS NOT NULL AND a.city <> ''
           AND a.country IS NOT NULL AND a.country <> ''
           AND a.postal_code IS NOT NULL AND a.postal_code <> ''
       )
       AND (c.address_1 IS NULL OR c.address_1 = ''
            OR c.city IS NULL OR c.city = ''
            OR c.postal_code IS NULL OR c.postal_code = ''
            OR c.country IS NULL OR c.country = '')
       AND (c.is_active = 1 OR c.is_active IS NULL)`
    )
    .all() as Array<{
    id: number;
    first_name: string | null;
    last_name: string | null;
    created_at: string | null;
    address_1: string | null;
    city: string | null;
    postal_code: string | null;
    country: string | null;
  }>;

  for (const c of missingAddress) {
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || `Customer #${c.id}`;
    const hasAnyAddressData = !!(c.address_1 || c.city || c.postal_code || c.country);
    const addressLabel = hasAnyAddressData ? "Incomplete address" : "No address on file";
    items.push({
      type: "missing_address",
      type_label: "Missing address",
      label: `${name} – ${addressLabel}`,
      target_tab: "customers",
      record_id: c.id,
      date: c.created_at,
    });
  }

  // Type 8: Inventory items missing Etsy publish fields (era or category)
  const missingEtsyFields = db
    .prepare(
      `SELECT id, item_number, description
       FROM inventory
       WHERE listing_draft_state IN ('generated','imported','approved')
         AND (etsy_when_made IS NULL OR etsy_taxonomy_id IS NULL)`
    )
    .all() as Array<{
    id: number;
    item_number: string | null;
    description: string | null;
  }>;

  for (const row of missingEtsyFields) {
    const desc = row.description
      ? row.description.length > 40
        ? row.description.slice(0, 40) + "…"
        : row.description
      : "";
    items.push({
      type: "missing_etsy_fields",
      type_label: "Missing Etsy fields",
      label: `Item ${row.item_number ?? `#${row.id}`}${desc ? ` – ${desc}` : ""} – missing era or category for Etsy publish`,
      target_tab: "inventory",
      record_id: row.id,
      date: null,
    });
  }

  // Type 6: Orders missing shipping cost (ADR-020 §6)
  const missingShippingCost = db
    .prepare(
      `SELECT id, order_number, ship_to_first_name, ship_to_last_name, order_date
       FROM orders
       WHERE order_status = 'active'
         AND shipping_date IS NOT NULL AND shipping_date <> ''
         AND shipper IS NOT NULL AND shipper <> ''
         AND (seller_shipping_cost IS NULL OR seller_shipping_cost = 0)`
    )
    .all() as Array<{
    id: number;
    order_number: string | null;
    ship_to_first_name: string | null;
    ship_to_last_name: string | null;
    order_date: string | null;
  }>;

  for (const o of missingShippingCost) {
    const name = [o.ship_to_first_name, o.ship_to_last_name].filter(Boolean).join(" ");
    items.push({
      type: "missing_shipping_cost",
      type_label: "Missing shipping cost",
      label: `Order ${o.order_number ?? `#${o.id}`}${name ? ` – ${name}` : ""} – no shipping cost`,
      target_tab: "sales",
      record_id: o.id,
      date: o.order_date,
    });
  }

  // Type 9: Listings with quality score below 90 (improveable)
  const minScoreRaw = db.prepare("SELECT value FROM settings WHERE key = ?").get("listing.min_quality_score") as { value: string } | undefined;
  const configuredMin = minScoreRaw?.value != null ? parseInt(minScoreRaw.value, 10) : 80;
  const listingCandidates = db
    .prepare(
      `SELECT *
       FROM inventory
       WHERE listing_draft_state IN ('draft','generated','imported','approved','published')
         AND listing_title IS NOT NULL AND listing_title <> ''`
    )
    .all() as Array<ListingScoreInput & { id: number; item_number: string | null; description: string | null; created_at: string | null }>;

  for (const row of listingCandidates) {
    const scoreResult = computeListingScore(row, configuredMin);
    if (scoreResult.score >= 90) continue;
    const desc = row.description
      ? row.description.length > 40
        ? row.description.slice(0, 40) + "…"
        : row.description
      : "";
    const belowMin = configuredMin > 0 && scoreResult.score < configuredMin;
    items.push({
      type: "low_quality_score",
      type_label: belowMin ? "Below minimum score" : "Quality improveable",
      label: `Item ${row.item_number ?? `#${row.id}`}${desc ? ` – ${desc}` : ""} – quality score ${scoreResult.score}/100${belowMin ? ` (minimum: ${configuredMin})` : ""}`,
      target_tab: "inventory",
      record_id: row.id,
      date: row.created_at ?? null,
    });
  }

  return items;
}

export async function GET() {
  try {
    requireEtsyAccessToken(await cookies());
    const items = queryOutstandingItems();

    // Default sort: date descending (newest first), nulls last
    items.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    });

    // Group counts by type
    const counts: Record<string, number> = {};
    for (const item of items) {
      counts[item.type] = (counts[item.type] ?? 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      items,
      total: items.length,
      counts,
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load outstanding items",
        userMessage: "We could not load outstanding items.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
