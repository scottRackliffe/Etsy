import { getDb } from "@/lib/sqlite";
import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
import { getSetting } from "@/lib/settings-store";

type ReportMetricValue = number | string;

type ReportSection = {
  title: string;
  rows: Array<Record<string, ReportMetricValue>>;
};

export type ReportResult = {
  report_name: string;
  generated_at: string;
  summary: string;
  metrics: Record<string, ReportMetricValue>;
  sections: ReportSection[];
};

export type ReportFormat = "pdf" | "csv";

function getCount(sql: string, params: unknown[] = []): number {
  const row = getDb()
    .prepare(sql)
    .get(...params) as { c: number };
  return row.c;
}

function asNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function isoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthStart(): string {
  const d = new Date();
  return isoDateOnly(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
}

function yearStart(): string {
  const d = new Date();
  return isoDateOnly(new Date(Date.UTC(d.getUTCFullYear(), 0, 1)));
}

function buildDateClause(
  column: string,
  fromDate?: string,
  toDate?: string
): { dateClause: string; dateParams: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (fromDate) {
    parts.push(`AND ${column} >= ?`);
    params.push(fromDate);
  }
  if (toDate) {
    parts.push(`AND ${column} <= ?`);
    params.push(toDate);
  }
  return { dateClause: parts.join(" "), dateParams: params };
}

function describeDateRange(fromDate?: string, toDate?: string): string {
  if (fromDate && toDate) return `${fromDate} to ${toDate}`;
  if (fromDate) return `from ${fromDate}`;
  if (toDate) return `through ${toDate}`;
  return "All time";
}

function buildSalesReport(params?: { from_date?: string; to_date?: string }): ReportResult {
  const db = getDb();
  const { dateClause, dateParams } = buildDateClause(
    "o.order_date",
    params?.from_date,
    params?.to_date
  );
  const dateLabel = describeDateRange(params?.from_date, params?.to_date);

  const topItems = db
    .prepare(
      `
      SELECT
        COALESCE(i.item_number, CAST(i.id AS TEXT), '(unknown)') AS item,
        SUM(COALESCE(oi.quantity, 0)) AS units_sold,
        ROUND(SUM(COALESCE(oi.line_total, COALESCE(oi.unit_price, 0) * COALESCE(oi.quantity, 0))), 2) AS revenue
      FROM order_items oi
      JOIN inventory i ON i.id = oi.inventory_id
      JOIN orders o ON o.id = oi.order_id
      WHERE o.order_status = 'active' ${dateClause}
      GROUP BY oi.inventory_id
      ORDER BY revenue DESC, units_sold DESC
      LIMIT 10
    `
    )
    .all(...dateParams) as Array<{ item: string; units_sold: number; revenue: number }>;

  const orderCount = getCount(
    `SELECT COUNT(*) AS c FROM orders o WHERE o.order_status = 'active' ${dateClause}`,
    dateParams
  );
  const grossRevenue = asNumber(
    (
      db
        .prepare(
          `SELECT ROUND(SUM(COALESCE(grand_total, 0)), 2) AS v FROM orders o WHERE o.order_status = 'active' ${dateClause}`
        )
        .get(...dateParams) as { v: number }
    ).v
  );

  return {
    report_name: "sales",
    generated_at: new Date().toISOString(),
    summary: `Sales performance — ${dateLabel}.`,
    metrics: {
      date_range: dateLabel,
      order_count: orderCount,
      gross_revenue: grossRevenue,
      average_order_value: orderCount > 0 ? Number((grossRevenue / orderCount).toFixed(2)) : 0,
    },
    sections: [{ title: "Top selling items", rows: topItems }],
  };
}

function buildCostsReport(): ReportResult {
  const db = getDb();
  const totals = db
    .prepare(
      `
      SELECT
        ROUND(SUM(COALESCE(p.purchase_price, 0)), 2) AS purchase_total,
        ROUND(SUM(COALESCE(p.shipping_price, 0)), 2) AS purchase_shipping_total
      FROM purchases p
    `
    )
    .get() as { purchase_total: number; purchase_shipping_total: number };
  const otherCostsTotal = asNumber(
    (
      db.prepare("SELECT ROUND(SUM(COALESCE(amount, 0)), 2) AS v FROM other_costs").get() as {
        v: number;
      }
    ).v
  );

  const byType = db
    .prepare(
      `
      SELECT
        COALESCE(cost_type, '(unspecified)') AS cost_type,
        ROUND(SUM(COALESCE(amount, 0)), 2) AS total
      FROM other_costs
      GROUP BY COALESCE(cost_type, '(unspecified)')
      ORDER BY total DESC
      LIMIT 20
    `
    )
    .all() as Array<{ cost_type: string; total: number }>;

  return {
    report_name: "costs",
    generated_at: new Date().toISOString(),
    summary: "Inventory purchase and operating costs.",
    metrics: {
      purchase_total: asNumber(totals.purchase_total),
      purchase_shipping_total: asNumber(totals.purchase_shipping_total),
      other_costs_total: otherCostsTotal,
      total_costs: Number(
        (
          asNumber(totals.purchase_total) +
          asNumber(totals.purchase_shipping_total) +
          otherCostsTotal
        ).toFixed(2)
      ),
    },
    sections: [{ title: "Other costs by type", rows: byType }],
  };
}

function buildIncomeReport(kind: "income-mtd" | "income-ytd"): ReportResult {
  const db = getDb();
  const startDate = kind === "income-mtd" ? monthStart() : yearStart();
  const baseWhere = "WHERE order_status = 'active' AND COALESCE(order_date, created_at, '') >= ?";

  const gross = asNumber(
    (
      db
        .prepare(`SELECT ROUND(SUM(COALESCE(grand_total, 0)), 2) AS v FROM orders ${baseWhere}`)
        .get(startDate) as { v: number }
    ).v
  );
  const shipping = asNumber(
    (
      db
        .prepare(`SELECT ROUND(SUM(COALESCE(shipping_total, 0)), 2) AS v FROM orders ${baseWhere}`)
        .get(startDate) as { v: number }
    ).v
  );
  const tax = asNumber(
    (
      db
        .prepare(`SELECT ROUND(SUM(COALESCE(tax_total, 0)), 2) AS v FROM orders ${baseWhere}`)
        .get(startDate) as { v: number }
    ).v
  );
  const discount = asNumber(
    (
      db
        .prepare(`SELECT ROUND(SUM(COALESCE(discount_total, 0)), 2) AS v FROM orders ${baseWhere}`)
        .get(startDate) as { v: number }
    ).v
  );
  const orders = getCount(`SELECT COUNT(*) AS c FROM orders ${baseWhere}`, [startDate]);

  return {
    report_name: kind,
    generated_at: new Date().toISOString(),
    summary: `Income totals from ${startDate} to current date.`,
    metrics: {
      period_start: startDate,
      order_count: orders,
      gross_revenue: gross,
      shipping_revenue: shipping,
      tax_collected: tax,
      discounts: discount,
      net_revenue_estimate: Number((gross - discount).toFixed(2)),
    },
    sections: [],
  };
}

function buildPostalByVendorReport(params?: {
  from_date?: string;
  to_date?: string;
}): ReportResult {
  const { dateClause, dateParams } = buildDateClause(
    "o.order_date",
    params?.from_date,
    params?.to_date
  );
  const dateLabel = describeDateRange(params?.from_date, params?.to_date);

  const rows = getDb()
    .prepare(
      `
      SELECT
        COALESCE(o.shipper, 'Other') AS vendor,
        COUNT(*) AS order_count,
        ROUND(SUM(COALESCE(o.seller_shipping_cost, 0)), 2) AS shipping_total
      FROM orders o
      WHERE o.order_status = 'active'
        AND o.shipping_date IS NOT NULL AND o.shipping_date <> ''
        ${dateClause}
      GROUP BY COALESCE(o.shipper, 'Other')
      ORDER BY shipping_total DESC, order_count DESC
    `
    )
    .all(...dateParams) as Array<{ vendor: string; order_count: number; shipping_total: number }>;

  return {
    report_name: "postal-by-vendor",
    generated_at: new Date().toISOString(),
    summary: `Postal costs by carrier — ${dateLabel}.`,
    metrics: {
      vendor_count: rows.length,
      shipping_total: Number(
        rows.reduce((sum, row) => sum + asNumber(row.shipping_total), 0).toFixed(2)
      ),
    },
    sections: [{ title: "Postal spend by vendor", rows }],
  };
}

function buildOutstandingItemsReport(): ReportResult {
  const rows = getDb()
    .prepare(
      `
      SELECT
        id,
        COALESCE(item_number, '(no item number)') AS item_number,
        COALESCE(status, '(unknown)') AS status,
        COALESCE(is_listed, 0) AS is_listed,
        COALESCE(description, '') AS description
      FROM inventory
      WHERE COALESCE(status, '') NOT IN ('Sold', 'Retired')
        AND COALESCE(is_listed, 0) = 0
      ORDER BY COALESCE(updated_at, created_at, '') DESC, id DESC
      LIMIT 200
    `
    )
    .all() as Array<{
    id: number;
    item_number: string;
    status: string;
    is_listed: number;
    description: string;
  }>;

  return {
    report_name: "outstanding-items",
    generated_at: new Date().toISOString(),
    summary: "Inventory not yet listed/sold and requiring action.",
    metrics: {
      outstanding_count: rows.length,
    },
    sections: [{ title: "Outstanding inventory", rows }],
  };
}

function buildArAgingReport(): ReportResult {
  const rows = getDb()
    .prepare(
      `
      SELECT
        id,
        COALESCE(order_number, CAST(id AS TEXT)) AS order_number,
        COALESCE(customer_id, 0) AS customer_id,
        COALESCE(order_date, created_at, '') AS order_date,
        ROUND(COALESCE(grand_total, 0), 2) AS amount,
        CAST(julianday('now') - julianday(COALESCE(order_date, created_at, date('now'))) AS INTEGER) AS age_days
      FROM orders
      WHERE order_status = 'active'
        AND (was_paid = 0 OR was_paid IS NULL)
      ORDER BY age_days DESC, id DESC
    `
    )
    .all() as Array<{
    id: number;
    order_number: string;
    customer_id: number;
    order_date: string;
    amount: number;
    age_days: number;
  }>;

  const buckets = {
    current_0_30: 0,
    days_31_60: 0,
    days_61_90: 0,
    days_90_plus: 0,
  };
  for (const row of rows) {
    if (row.age_days <= 30) buckets.current_0_30 += asNumber(row.amount);
    else if (row.age_days <= 60) buckets.days_31_60 += asNumber(row.amount);
    else if (row.age_days <= 90) buckets.days_61_90 += asNumber(row.amount);
    else buckets.days_90_plus += asNumber(row.amount);
  }

  return {
    report_name: "ar-aging",
    generated_at: new Date().toISOString(),
    summary: "Unpaid receivables with aging buckets.",
    metrics: {
      unpaid_order_count: rows.length,
      ...Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, Number(v.toFixed(2))])),
      total_unpaid: Number(
        Object.values(buckets)
          .reduce((sum, v) => sum + v, 0)
          .toFixed(2)
      ),
    },
    sections: [{ title: "Unpaid orders", rows }],
  };
}

function buildInvoiceReport(): ReportResult {
  const rows = getDb()
    .prepare(
      `
      SELECT
        o.id,
        COALESCE(o.order_number, CAST(o.id AS TEXT)) AS order_number,
        COALESCE(o.order_date, o.created_at, '') AS order_date,
        ROUND(COALESCE(o.grand_total, 0), 2) AS amount_due,
        COALESCE(c.first_name, '') || CASE WHEN c.last_name IS NOT NULL AND c.last_name <> '' THEN ' ' || c.last_name ELSE '' END AS customer_name,
        COALESCE(c.email, '') AS customer_email
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.order_status = 'active'
        AND (o.was_paid = 0 OR o.was_paid IS NULL)
      ORDER BY COALESCE(o.order_date, o.created_at, '') DESC
      LIMIT 200
    `
    )
    .all() as Array<{
    id: number;
    order_number: string;
    order_date: string;
    amount_due: number;
    customer_name: string;
    customer_email: string;
  }>;

  return {
    report_name: "invoice",
    generated_at: new Date().toISOString(),
    summary: "Open invoices to issue or follow up.",
    metrics: {
      invoice_count: rows.length,
      total_amount_due: Number(
        rows.reduce((sum, row) => sum + asNumber(row.amount_due), 0).toFixed(2)
      ),
    },
    sections: [{ title: "Open invoices", rows }],
  };
}

function buildThankYouReport(): ReportResult {
  const rows = getDb()
    .prepare(
      `
      SELECT
        o.id,
        COALESCE(o.order_number, CAST(o.id AS TEXT)) AS order_number,
        COALESCE(o.order_date, o.created_at, '') AS order_date,
        COALESCE(c.first_name, '') || CASE WHEN c.last_name IS NOT NULL AND c.last_name <> '' THEN ' ' || c.last_name ELSE '' END AS customer_name,
        COALESCE(c.email, '') AS customer_email,
        ROUND(COALESCE(o.grand_total, 0), 2) AS amount
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.order_status = 'active'
        AND o.was_paid = 1
      ORDER BY COALESCE(o.order_date, o.created_at, '') DESC
      LIMIT 200
    `
    )
    .all() as Array<{
    id: number;
    order_number: string;
    order_date: string;
    customer_name: string;
    customer_email: string;
    amount: number;
  }>;

  return {
    report_name: "thank-you-note",
    generated_at: new Date().toISOString(),
    summary: "Recent paid orders to send thank-you notes.",
    metrics: {
      paid_order_count: rows.length,
      paid_order_value: Number(rows.reduce((sum, row) => sum + asNumber(row.amount), 0).toFixed(2)),
    },
    sections: [{ title: "Thank-you queue", rows }],
  };
}

function loadActiveOrder(orderId: number): Record<string, unknown> | null {
  const row = getDb()
    .prepare("SELECT * FROM orders WHERE id = ? AND order_status = 'active'")
    .get(orderId);
  return row ? (row as Record<string, unknown>) : null;
}

function loadOrderLineItems(orderId: number) {
  return getDb()
    .prepare(
      `
      SELECT
        oi.quantity,
        ROUND(COALESCE(oi.unit_price, 0), 2) AS unit_price,
        ROUND(COALESCE(oi.line_total, COALESCE(oi.unit_price, 0) * COALESCE(oi.quantity, 0)), 2) AS line_total,
        COALESCE(i.description, i.item_number, CAST(i.id AS TEXT), '(item)') AS description,
        COALESCE(i.item_number, CAST(i.id AS TEXT), '') AS item_number
      FROM order_items oi
      LEFT JOIN inventory i ON i.id = oi.inventory_id
      WHERE oi.order_id = ?
      ORDER BY oi.id ASC
    `
    )
    .all(orderId) as Array<Record<string, ReportMetricValue>>;
}

function formatShipTo(order: Record<string, unknown>): string {
  const parts = [
    [order.ship_to_first_name, order.ship_to_last_name].filter(Boolean).join(" "),
    order.ship_to_address_line_1,
    order.ship_to_address_line_2,
    [order.ship_to_city, order.ship_to_state_province, order.ship_to_postal_code]
      .filter(Boolean)
      .join(", "),
    order.ship_to_country,
  ].filter((part) => typeof part === "string" && part.trim().length > 0);
  return parts.join(" | ");
}

export function buildSingleOrderInvoice(orderId: number): ReportResult | null {
  const order = loadActiveOrder(orderId);
  if (!order) return null;

  const lineItems = loadOrderLineItems(orderId);
  const businessName = getSetting("business_name")?.trim() || "Business";
  const orderNumber = String(order.order_number ?? orderId);
  const paymentStatus = Number(order.was_paid) === 1 ? "Paid" : "Unpaid";
  const shipStatus = order.shipping_date ? "Shipped" : "Not shipped";

  return {
    report_name: `invoice-${orderNumber}`,
    generated_at: new Date().toISOString(),
    summary: `Invoice #${orderNumber} for ${formatShipTo(order) || "customer"}.`,
    metrics: {
      business_name: businessName,
      invoice_number: orderNumber,
      order_date: String(order.order_date ?? ""),
      ship_to: formatShipTo(order),
      subtotal: asNumber(order.subtotal),
      discount_total: asNumber(order.discount_total),
      shipping_total: asNumber(order.shipping_total),
      grand_total: asNumber(order.grand_total),
      payment_status: paymentStatus,
      shipping_status: shipStatus,
    },
    sections: [{ title: "Line items", rows: lineItems }],
  };
}

export function buildSingleOrderThankYou(orderId: number): ReportResult | null {
  const order = loadActiveOrder(orderId);
  if (!order) return null;

  const lineItems = loadOrderLineItems(orderId).map((row) => ({
    description: row.description,
    quantity: row.quantity,
    item_number: row.item_number,
  }));
  const businessName = getSetting("business_name")?.trim() || "Business";
  const customerName =
    [order.ship_to_first_name, order.ship_to_last_name].filter(Boolean).join(" ") || "Customer";
  const orderNumber = String(order.order_number ?? orderId);

  return {
    report_name: `thank-you-${orderNumber}`,
    generated_at: new Date().toISOString(),
    summary: `Thank you for your order, ${customerName}!`,
    metrics: {
      business_name: businessName,
      customer_name: customerName,
      order_number: orderNumber,
      order_date: String(order.order_date ?? ""),
      greeting: "Thank you for your order!",
      closing: "We hope you enjoy your purchase!",
    },
    sections: [{ title: "Items in your order", rows: lineItems }],
  };
}

function monthStartDate(): string {
  return monthStart();
}

function yearStartDate(): string {
  return yearStart();
}

function agingBucket(days: number): string {
  if (days <= 30) return "Fresh";
  if (days <= 60) return "Moderate";
  if (days <= 90) return "Aging";
  if (days <= 180) return "Slow";
  return "Stale";
}

function buildProfitByItemReport(params?: ReportParams): ReportResult {
  const db = getDb();
  const from = params?.from_date ?? monthStartDate();
  const to = params?.to_date ?? isoDateOnly(new Date());
  const { dateClause, dateParams } = buildDateClause("i.date_of_sale", from, to);
  const dateLabel = describeDateRange(from, to);

  const rows = db
    .prepare(
      `
      SELECT
        i.item_number,
        i.description,
        i.date_of_sale,
        ROUND(COALESCE(i.purchase_cost, 0), 2) AS purchase_cost,
        ROUND(COALESCE(i.shipping_cost, 0), 2) AS shipping_in,
        ROUND(COALESCE(oc.other_total, 0), 2) AS other_costs,
        ROUND(COALESCE(i.purchase_cost, 0) + COALESCE(i.shipping_cost, 0) + COALESCE(oc.other_total, 0), 2) AS total_cost,
        ROUND(COALESCE(i.sale_revenue, 0), 2) AS sale_revenue,
        ROUND(
          COALESCE(i.sale_revenue, 0) -
          (COALESCE(i.purchase_cost, 0) + COALESCE(i.shipping_cost, 0) + COALESCE(oc.other_total, 0)),
          2
        ) AS net_profit,
        CASE
          WHEN COALESCE(i.sale_revenue, 0) = 0 THEN NULL
          ELSE ROUND(
            ((COALESCE(i.sale_revenue, 0) -
              (COALESCE(i.purchase_cost, 0) + COALESCE(i.shipping_cost, 0) + COALESCE(oc.other_total, 0)))
              * 100.0 / i.sale_revenue),
            2
          )
        END AS margin_pct
      FROM inventory i
      LEFT JOIN (
        SELECT inventory_id, SUM(amount) AS other_total
        FROM other_costs
        GROUP BY inventory_id
      ) oc ON oc.inventory_id = i.id
      WHERE i.status = 'Sold' ${dateClause}
      ORDER BY i.date_of_sale DESC, i.item_number ASC
    `
    )
    .all(...dateParams) as Array<{
    item_number: string;
    description: string;
    date_of_sale: string;
    purchase_cost: number;
    shipping_in: number;
    other_costs: number;
    total_cost: number;
    sale_revenue: number;
    net_profit: number;
    margin_pct: number | null;
  }>;

  const totals = rows.reduce(
    (acc, row) => {
      acc.purchase_cost += row.purchase_cost;
      acc.shipping_in += row.shipping_in;
      acc.other_costs += row.other_costs;
      acc.total_cost += row.total_cost;
      acc.sale_revenue += row.sale_revenue;
      acc.net_profit += row.net_profit;
      return acc;
    },
    {
      purchase_cost: 0,
      shipping_in: 0,
      other_costs: 0,
      total_cost: 0,
      sale_revenue: 0,
      net_profit: 0,
    }
  );

  const weightedMargin =
    totals.sale_revenue > 0
      ? Number(((totals.net_profit / totals.sale_revenue) * 100).toFixed(2))
      : 0;

  return {
    report_name: "profit-by-item",
    generated_at: new Date().toISOString(),
    summary:
      rows.length === 0
        ? "No sold items found for the selected date range."
        : `Profit by item — ${dateLabel}.`,
    metrics: {
      date_range: dateLabel,
      item_count: rows.length,
      total_purchase_cost: Number(totals.purchase_cost.toFixed(2)),
      total_sale_revenue: Number(totals.sale_revenue.toFixed(2)),
      total_net_profit: Number(totals.net_profit.toFixed(2)),
      weighted_margin_pct: weightedMargin,
    },
    sections: [
      { title: "Sold items", rows: rows as unknown as Array<Record<string, ReportMetricValue>> },
    ],
  };
}

function buildSalesTaxSummaryReport(params?: ReportParams): ReportResult {
  const db = getDb();
  const from = params?.from_date ?? yearStartDate();
  const to = params?.to_date ?? isoDateOnly(new Date());
  const { dateClause, dateParams } = buildDateClause("o.order_date", from, to);
  const dateLabel = describeDateRange(from, to);

  const rows = db
    .prepare(
      `
      SELECT
        strftime('%Y-%m', o.order_date) AS month_key,
        COUNT(*) AS order_count,
        ROUND(SUM(COALESCE(o.subtotal, 0)), 2) AS gross_sales,
        ROUND(SUM(CASE WHEN COALESCE(o.tax_total, 0) > 0 THEN COALESCE(o.subtotal, 0) ELSE 0 END), 2) AS taxable_sales,
        ROUND(SUM(COALESCE(o.tax_total, 0)), 2) AS tax_collected
      FROM orders o
      WHERE o.order_status = 'active' ${dateClause}
      GROUP BY month_key
      ORDER BY month_key ASC
    `
    )
    .all(...dateParams) as Array<{
    month_key: string;
    order_count: number;
    gross_sales: number;
    taxable_sales: number;
    tax_collected: number;
  }>;

  const formatted = rows.map((row) => {
    const [y, m] = row.month_key.split("-");
    const monthName = new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });
    const effectiveRate =
      row.taxable_sales > 0
        ? Number(((row.tax_collected / row.taxable_sales) * 100).toFixed(2))
        : "—";
    return {
      month: monthName,
      order_count: row.order_count,
      gross_sales: row.gross_sales,
      taxable_sales: row.taxable_sales,
      tax_collected: row.tax_collected,
      effective_rate_pct: effectiveRate,
    };
  });

  const totalOrders = formatted.reduce((s, r) => s + asNumber(r.order_count), 0);
  const totalGross = formatted.reduce((s, r) => s + asNumber(r.gross_sales), 0);
  const totalTaxable = formatted.reduce((s, r) => s + asNumber(r.taxable_sales), 0);
  const totalTax = formatted.reduce((s, r) => s + asNumber(r.tax_collected), 0);

  return {
    report_name: "sales-tax-summary",
    generated_at: new Date().toISOString(),
    summary:
      formatted.length === 0
        ? "No orders found for the selected date range."
        : `Sales tax summary — ${dateLabel}.`,
    metrics: {
      date_range: dateLabel,
      order_count: totalOrders,
      gross_sales: Number(totalGross.toFixed(2)),
      taxable_sales: Number(totalTaxable.toFixed(2)),
      tax_collected: Number(totalTax.toFixed(2)),
      effective_rate_pct:
        totalTaxable > 0 ? Number(((totalTax / totalTaxable) * 100).toFixed(2)) : "—",
    },
    sections: [{ title: "Monthly tax summary", rows: formatted }],
  };
}

function buildInventoryAgingReport(): ReportResult {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT
        item_number,
        description,
        status,
        ROUND(COALESCE(purchase_cost, 0), 2) AS purchase_cost,
        ROUND(COALESCE(sale_revenue, 0), 2) AS sale_revenue,
        date_purchased,
        date_listed,
        CAST(
          julianday('now') - julianday(COALESCE(date_purchased, date_listed, created_at))
          AS INTEGER
        ) AS days_in_stock
      FROM inventory
      WHERE status IN ('Draft', 'In stock', 'Listed', 'Reserved')
      ORDER BY days_in_stock DESC, item_number ASC
    `
    )
    .all() as Array<{
    item_number: string;
    description: string;
    status: string;
    purchase_cost: number;
    sale_revenue: number;
    date_purchased: string | null;
    date_listed: string | null;
    days_in_stock: number;
  }>;

  const enriched = rows.map((row) => ({
    ...row,
    aging_bucket: agingBucket(row.days_in_stock),
  }));

  const totalCost = enriched.reduce((s, r) => s + r.purchase_cost, 0);
  const avgDays =
    enriched.length > 0
      ? Number((enriched.reduce((s, r) => s + r.days_in_stock, 0) / enriched.length).toFixed(1))
      : 0;

  return {
    report_name: "inventory-aging",
    generated_at: new Date().toISOString(),
    summary:
      enriched.length === 0
        ? "No unsold inventory items found."
        : "Inventory aging for unsold items.",
    metrics: {
      item_count: enriched.length,
      total_purchase_cost: Number(totalCost.toFixed(2)),
      avg_days_in_stock: avgDays,
    },
    sections: [
      {
        title: "Aging inventory",
        rows: enriched as unknown as Array<Record<string, ReportMetricValue>>,
      },
    ],
  };
}

export type AccountingExportRow = {
  Date: string;
  "Transaction Type": string;
  Reference: string;
  Description: string;
  Debit: string;
  Credit: string;
  Account: string;
};

export function buildAccountingExportRows(params?: ReportParams): AccountingExportRow[] {
  const db = getDb();
  const rows: AccountingExportRow[] = [];

  const sales = db
    .prepare(
      `
      SELECT
        o.order_date AS tx_date,
        COALESCE(o.order_number, CAST(o.id AS TEXT)) AS reference,
        ROUND(COALESCE(oi.line_total, oi.unit_price * oi.quantity, 0), 2) AS amount,
        COALESCE(i.description, '') AS item_description,
        COALESCE(i.item_number, CAST(i.id AS TEXT)) AS item_number
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN inventory i ON i.id = oi.inventory_id
      WHERE o.order_status = 'active'
    `
    )
    .all() as Array<{
    tx_date: string;
    reference: string;
    amount: number;
    item_description: string;
    item_number: string;
  }>;

  for (const row of sales) {
    if (params?.from_date && row.tx_date < params.from_date) continue;
    if (params?.to_date && row.tx_date > params.to_date) continue;
    rows.push({
      Date: row.tx_date?.slice(0, 10) ?? "",
      "Transaction Type": "Sale",
      Reference: row.reference,
      Description: `Sale: ${row.item_description} (${row.item_number})`,
      Debit: "",
      Credit: row.amount.toFixed(2),
      Account: "Sales Revenue",
    });
  }

  const shipping = db
    .prepare(
      `
      SELECT order_date AS tx_date, order_number, ROUND(COALESCE(seller_shipping_cost, 0), 2) AS amount
      FROM orders
      WHERE order_status = 'active' AND COALESCE(seller_shipping_cost, 0) > 0
    `
    )
    .all() as Array<{ tx_date: string; order_number: string; amount: number }>;

  for (const row of shipping) {
    if (params?.from_date && row.tx_date < params.from_date) continue;
    if (params?.to_date && row.tx_date > params.to_date) continue;
    rows.push({
      Date: row.tx_date?.slice(0, 10) ?? "",
      "Transaction Type": "Shipping",
      Reference: row.order_number,
      Description: `Shipping: Order ${row.order_number}`,
      Debit: row.amount.toFixed(2),
      Credit: "",
      Account: "Shipping Expense",
    });
  }

  const taxRows = db
    .prepare(
      `
      SELECT order_date AS tx_date, order_number, ROUND(COALESCE(tax_total, 0), 2) AS amount
      FROM orders
      WHERE order_status = 'active' AND COALESCE(tax_total, 0) > 0
    `
    )
    .all() as Array<{ tx_date: string; order_number: string; amount: number }>;

  for (const row of taxRows) {
    if (params?.from_date && row.tx_date < params.from_date) continue;
    if (params?.to_date && row.tx_date > params.to_date) continue;
    rows.push({
      Date: row.tx_date?.slice(0, 10) ?? "",
      "Transaction Type": "Tax",
      Reference: row.order_number,
      Description: `Tax collected: Order ${row.order_number}`,
      Debit: "",
      Credit: row.amount.toFixed(2),
      Account: "Tax Collected",
    });
  }

  const purchases = db
    .prepare(
      `
      SELECT
        p.purchase_date AS tx_date,
        COALESCE(i.item_number, CAST(p.inventory_id AS TEXT)) AS item_number,
        COALESCE(i.description, '') AS item_description,
        ROUND(COALESCE(p.purchase_price, 0), 2) AS purchase_price,
        ROUND(COALESCE(p.shipping_price, 0), 2) AS shipping_price
      FROM purchases p
      LEFT JOIN inventory i ON i.id = p.inventory_id
    `
    )
    .all() as Array<{
    tx_date: string;
    item_number: string;
    item_description: string;
    purchase_price: number;
    shipping_price: number;
  }>;

  for (const row of purchases) {
    const date = row.tx_date?.slice(0, 10) ?? "";
    if (params?.from_date && date < params.from_date) continue;
    if (params?.to_date && date > params.to_date) continue;
    if (row.purchase_price > 0) {
      rows.push({
        Date: date,
        "Transaction Type": "Purchase",
        Reference: row.item_number,
        Description: `Purchase: ${row.item_description} (${row.item_number})`,
        Debit: row.purchase_price.toFixed(2),
        Credit: "",
        Account: "Cost of Goods",
      });
    }
    if (row.shipping_price > 0) {
      rows.push({
        Date: date,
        "Transaction Type": "Purchase",
        Reference: row.item_number,
        Description: `Purchase shipping: ${row.item_description} (${row.item_number})`,
        Debit: row.shipping_price.toFixed(2),
        Credit: "",
        Account: "Cost of Goods",
      });
    }
  }

  const otherCosts = db
    .prepare(
      `
      SELECT
        date(oc.created_at) AS tx_date,
        oc.cost_type,
        ROUND(COALESCE(oc.amount, 0), 2) AS amount,
        COALESCE(i.item_number, CAST(oc.inventory_id AS TEXT)) AS item_number
      FROM other_costs oc
      LEFT JOIN inventory i ON i.id = oc.inventory_id
    `
    )
    .all() as Array<{ tx_date: string; cost_type: string; amount: number; item_number: string }>;

  for (const row of otherCosts) {
    if (params?.from_date && row.tx_date < params.from_date) continue;
    if (params?.to_date && row.tx_date > params.to_date) continue;
    if (row.amount <= 0) continue;
    rows.push({
      Date: row.tx_date,
      "Transaction Type": "Other Cost",
      Reference: row.item_number,
      Description: `Other cost: ${row.cost_type} - ${row.item_number}`,
      Debit: row.amount.toFixed(2),
      Credit: "",
      Account: "Other Expense",
    });
  }

  rows.sort((a, b) => {
    const dateCmp = a.Date.localeCompare(b.Date);
    if (dateCmp !== 0) return dateCmp;
    return a["Transaction Type"].localeCompare(b["Transaction Type"]);
  });

  return rows;
}

export function buildAccountingExportCsv(params?: ReportParams): string {
  const rows = buildAccountingExportRows(params);
  const header = [
    "Date",
    "Transaction Type",
    "Reference",
    "Description",
    "Debit",
    "Credit",
    "Account",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        toCsvValue(row.Date),
        toCsvValue(row["Transaction Type"]),
        toCsvValue(row.Reference),
        toCsvValue(row.Description),
        toCsvValue(row.Debit),
        toCsvValue(row.Credit),
        toCsvValue(row.Account),
      ].join(",")
    );
  }
  return lines.join("\n");
}

function buildAccountingExportReport(params?: ReportParams): ReportResult {
  const rows = buildAccountingExportRows(params);
  return {
    report_name: "accounting-export",
    generated_at: new Date().toISOString(),
    summary: describeDateRange(params?.from_date, params?.to_date),
    metrics: {
      date_range: describeDateRange(params?.from_date, params?.to_date),
      row_count: rows.length,
    },
    sections: [
      {
        title: "Accounting export",
        rows: rows as unknown as Array<Record<string, ReportMetricValue>>,
      },
    ],
  };
}

export type ReportParams = {
  from_date?: string;
  to_date?: string;
};

export function buildReport(reportName: string, params?: ReportParams): ReportResult {
  if (reportName === "sales") return buildSalesReport(params);
  if (reportName === "costs") return buildCostsReport();
  if (reportName === "income-mtd" || reportName === "income-ytd")
    return buildIncomeReport(reportName);
  if (reportName === "postal-by-vendor") return buildPostalByVendorReport(params);
  if (reportName === "outstanding-items") return buildOutstandingItemsReport();
  if (reportName === "ar-aging") return buildArAgingReport();
  if (reportName === "invoice") return buildInvoiceReport();
  if (reportName === "thank-you-note") return buildThankYouReport();
  if (reportName === "profit-by-item") return buildProfitByItemReport(params);
  if (reportName === "sales-tax-summary") return buildSalesTaxSummaryReport(params);
  if (reportName === "inventory-aging") return buildInventoryAgingReport();
  if (reportName === "accounting-export") return buildAccountingExportReport(params);
  const generated_at = new Date().toISOString();
  return {
    report_name: reportName,
    generated_at,
    summary: "Generic report output.",
    metrics: {
      inventory_count: getCount("SELECT COUNT(*) AS c FROM inventory"),
      customer_count: getCount("SELECT COUNT(*) AS c FROM customers"),
      purchase_count: getCount("SELECT COUNT(*) AS c FROM purchases"),
      order_count: getCount("SELECT COUNT(*) AS c FROM orders"),
    },
    sections: [],
  };
}

function isReportEmpty(report: ReportResult): boolean {
  const allSectionsEmpty = report.sections.every((s) => s.rows.length === 0);
  const metricsAllZero = Object.values(report.metrics).every(
    (v) => v === 0 || v === "0" || v === "All time"
  );
  return allSectionsEmpty && metricsAllZero;
}

export function parseReportFormat(value: string | null): ReportFormat {
  if (value === null || value === "") {
    return "pdf";
  }
  return value.toLowerCase() === "csv" ? "csv" : "pdf";
}

function toCsvValue(value: unknown): string {
  const raw = String(value ?? "");
  if (!raw.includes(",") && !raw.includes('"') && !raw.includes("\n")) {
    return raw;
  }
  return `"${raw.replaceAll('"', '""')}"`;
}

export function buildReportCsv(report: ReportResult): string {
  const lines: string[] = [];
  lines.push("field,value");
  lines.push(`report_name,${toCsvValue(report.report_name)}`);
  lines.push(`generated_at,${toCsvValue(report.generated_at)}`);
  lines.push(`summary,${toCsvValue(report.summary)}`);
  for (const [key, value] of Object.entries(report.metrics)) {
    lines.push(`${toCsvValue(key)},${toCsvValue(value)}`);
  }
  for (const section of report.sections) {
    lines.push("");
    lines.push(`section,${toCsvValue(section.title)}`);
    const keys = Array.from(new Set(section.rows.flatMap((row) => Object.keys(row)))) as Array<
      keyof (typeof section.rows)[number]
    >;
    if (keys.length === 0) {
      lines.push("note,no rows");
      continue;
    }
    lines.push(keys.map((key) => toCsvValue(String(key))).join(","));
    for (const row of section.rows) {
      lines.push(keys.map((key) => toCsvValue(row[key])).join(","));
    }
  }
  return lines.join("\n");
}

export async function buildReportPdf(report: ReportResult): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      autoFirstPage: true,
      info: {
        Title: `${report.report_name} report`,
        Author: "Etsy Sales Manager",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (error) => reject(error));

    const reportIconSetting = getSetting("ui.icons.report_header_path");
    const reportIconWidthSetting = getSetting("ui.icons.report_header_width_px");
    const reportIconPath =
      reportIconSetting && reportIconSetting.startsWith("/")
        ? path.join(process.cwd(), "public", reportIconSetting.replace(/^\/+/, ""))
        : path.join(process.cwd(), "public", "icons", "report-header.png");
    const reportIconWidth = Number.isFinite(Number(reportIconWidthSetting))
      ? Math.max(80, Math.min(640, Math.floor(Number(reportIconWidthSetting))))
      : 220;
    if (fs.existsSync(reportIconPath)) {
      try {
        doc.image(reportIconPath, {
          fit: [reportIconWidth, 80] as [number, number],
        });
        doc.moveDown(0.5);
      } catch {
        // Non-blocking: continue report generation without icon.
      }
    }

    renderReportContent(doc, report);
    doc.end();
  });
}

export function renderReportContent(
  doc: InstanceType<typeof PDFDocument>,
  report: ReportResult
): void {
  doc.fontSize(18).text(`${report.report_name} report`, { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(11).text(`Generated: ${report.generated_at}`);
  doc.moveDown(0.5);
  doc.fontSize(11).text(report.summary);
  doc.moveDown();

  if (isReportEmpty(report)) {
    doc.moveDown();
    doc.fontSize(14).text("No data found for the selected criteria.", { align: "center" });
    doc.moveDown();
    doc
      .fontSize(11)
      .text("Try adjusting the date range or filters, or check that relevant records exist.", {
        align: "center",
      });
  } else {
    doc.fontSize(13).text("Metrics");
    doc.moveDown(0.5);
    for (const [metric, value] of Object.entries(report.metrics)) {
      doc.fontSize(11).text(`- ${metric}: ${value}`);
    }
    for (const section of report.sections) {
      doc.moveDown();
      doc.fontSize(13).text(section.title);
      doc.moveDown(0.4);
      if (section.rows.length === 0) {
        doc.fontSize(10).text("No rows.");
        continue;
      }
      for (const row of section.rows.slice(0, 100)) {
        const line = Object.entries(row)
          .map(([key, value]) => `${key}: ${value}`)
          .join(" | ");
        doc.fontSize(10).text(line);
      }
      if (section.rows.length > 100) {
        doc
          .fontSize(10)
          .text(`... ${section.rows.length - 100} additional rows omitted in PDF output.`);
      }
    }
  }
}

export function saveReportArtifact(reportName: string, report: ReportResult): void {
  const db = getDb();
  db.prepare(
    `
      INSERT INTO report_artifacts(report_name, report_params_json, artifact_json, generated_at)
      VALUES(@report_name, @report_params_json, @artifact_json, @generated_at)
    `
  ).run({
    report_name: reportName,
    report_params_json: JSON.stringify({}),
    artifact_json: JSON.stringify(report),
    generated_at: report.generated_at,
  });
}
