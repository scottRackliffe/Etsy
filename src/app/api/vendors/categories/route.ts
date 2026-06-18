import { NextResponse } from "next/server";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { getDb } from "@/lib/sqlite";

const DEFAULT_CATEGORIES = [
  "Antique mall",
  "Auction house",
  "Estate sale",
  "Flea market",
  "Online",
  "Private seller",
  "Retail store",
  "Thrift store",
  "Wholesale",
];

const DEFAULT_PAYMENT_TERMS = [
  "Cash",
  "Check",
  "COD",
  "Credit card",
  "Net 15",
  "Net 30",
  "Net 60",
  "PayPal",
  "Prepaid",
  "Venmo",
  "Wire transfer",
];

const DEFAULT_SHIPPING_METHODS = [
  "DHL",
  "FedEx",
  "FedEx Ground",
  "Freight",
  "Local pickup",
  "USPS First Class",
  "USPS Priority",
  "UPS",
  "UPS Ground",
  "Will call",
];

function mergeDistinct(defaults: string[], dbValues: string[]): string[] {
  return Array.from(new Set([...defaults, ...dbValues])).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

export async function GET() {
  try {
    const db = getDb();

    const catRows = db
      .prepare(
        `SELECT DISTINCT vendor_category FROM vendors
         WHERE vendor_category IS NOT NULL AND vendor_category != ''
         ORDER BY vendor_category COLLATE NOCASE`
      )
      .all() as Array<{ vendor_category: string }>;

    const ptRows = db
      .prepare(
        `SELECT DISTINCT payment_terms FROM vendors
         WHERE payment_terms IS NOT NULL AND payment_terms != ''
         ORDER BY payment_terms COLLATE NOCASE`
      )
      .all() as Array<{ payment_terms: string }>;

    const smRows = db
      .prepare(
        `SELECT DISTINCT default_shipping_method FROM vendors
         WHERE default_shipping_method IS NOT NULL AND default_shipping_method != ''
         ORDER BY default_shipping_method COLLATE NOCASE`
      )
      .all() as Array<{ default_shipping_method: string }>;

    return NextResponse.json({
      ok: true,
      categories: mergeDistinct(DEFAULT_CATEGORIES, catRows.map((r) => r.vendor_category)),
      payment_terms: mergeDistinct(DEFAULT_PAYMENT_TERMS, ptRows.map((r) => r.payment_terms)),
      shipping_methods: mergeDistinct(DEFAULT_SHIPPING_METHODS, smRows.map((r) => r.default_shipping_method)),
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to load vendor dropdown options",
        userMessage: "Could not load vendor dropdown options.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
