import { getDb } from "@/lib/sqlite";
import { getSetting } from "@/lib/settings-store";
import { computeListingScore } from "@/lib/listing-score";
import { logActivity } from "@/lib/activity-log";

type ReportMetricValue = number | string;

type ReportSection = {
  title: string;
  rows: Array<Record<string, ReportMetricValue>>;
  compact?: boolean;
  no_totals?: boolean;
};

export type ReportResult = {
  report_name: string;
  generated_at: string;
  summary: string;
  metrics: Record<string, ReportMetricValue>;
  sections: ReportSection[];
};

export type ReportFormat = "json" | "csv" | "pdf";

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
  const db = getDb();
  const effectiveFrom = fromDate ?? (() => {
    const row = db.prepare(
      `SELECT MIN(d) AS d FROM (
        SELECT MIN(order_date) AS d FROM orders WHERE order_status = 'active' AND order_date IS NOT NULL
        UNION ALL
        SELECT MIN(date_purchased) AS d FROM inventory WHERE date_purchased IS NOT NULL
      )`
    ).get() as { d: string | null } | undefined;
    return row?.d ?? isoDateOnly(new Date());
  })();
  const effectiveTo = toDate ?? isoDateOnly(new Date());
  return `${effectiveFrom} to ${effectiveTo}`;
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

  const totalCosts = asNumber(
    (
      db
        .prepare(
          `SELECT ROUND(SUM(
            COALESCE(i.purchase_cost, 0) + COALESCE(i.shipping_cost, 0)
          ), 2) AS v
          FROM order_items oi
          JOIN inventory i ON i.id = oi.inventory_id
          JOIN orders o ON o.id = oi.order_id
          WHERE o.order_status = 'active' ${dateClause}`
        )
        .get(...dateParams) as { v: number }
    ).v
  );

  const otherCosts = asNumber(
    (
      db
        .prepare(
          `SELECT ROUND(SUM(COALESCE(oc.amount, 0)), 2) AS v
          FROM other_costs oc
          JOIN order_items oi ON oi.inventory_id = oc.inventory_id
          JOIN orders o ON o.id = oi.order_id
          WHERE o.order_status = 'active' ${dateClause}`
        )
        .get(...dateParams) as { v: number }
    ).v
  );

  const itemsSold = getCount(
    `SELECT SUM(COALESCE(oi.quantity, 1)) AS c
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.order_status = 'active' ${dateClause}`,
    dateParams
  );

  const shippingRevenue = asNumber(
    (
      db
        .prepare(
          `SELECT ROUND(SUM(COALESCE(shipping_total, 0)), 2) AS v FROM orders o WHERE o.order_status = 'active' ${dateClause}`
        )
        .get(...dateParams) as { v: number }
    ).v
  );

  const taxCollected = asNumber(
    (
      db
        .prepare(
          `SELECT ROUND(SUM(COALESCE(tax_total, 0)), 2) AS v FROM orders o WHERE o.order_status = 'active' ${dateClause}`
        )
        .get(...dateParams) as { v: number }
    ).v
  );

  const totalDiscounts = asNumber(
    (
      db
        .prepare(
          `SELECT ROUND(SUM(COALESCE(discount_total, 0)), 2) AS v FROM orders o WHERE o.order_status = 'active' ${dateClause}`
        )
        .get(...dateParams) as { v: number }
    ).v
  );

  const allCosts = totalCosts + otherCosts;
  const netRevenue = Number((grossRevenue - allCosts).toFixed(2));
  const avgCostPerItem = itemsSold > 0 ? Number((allCosts / itemsSold).toFixed(2)) : 0;
  const avgRevenuePerItem = itemsSold > 0 ? Number((grossRevenue / itemsSold).toFixed(2)) : 0;

  return {
    report_name: "sales",
    generated_at: new Date().toISOString(),
    summary: `Sales performance — ${dateLabel}.`,
    metrics: {
      date_range: dateLabel,
      order_count: orderCount,
      items_sold: itemsSold,
      gross_revenue: grossRevenue,
      shipping_revenue: shippingRevenue,
      tax_collected: taxCollected,
      discounts: totalDiscounts,
      total_costs: allCosts,
      net_revenue: netRevenue,
      avg_cost_per_item: avgCostPerItem,
      avg_revenue_per_item: avgRevenuePerItem,
      cost_per_revenue_dollar: avgRevenuePerItem > 0
        ? `$${(avgCostPerItem / avgRevenuePerItem).toFixed(2)} of every $1.00 of revenue pays costs`
        : "N/A",
      revenue_per_cost_dollar: avgCostPerItem > 0
        ? `Every $1.00 of cost returns $${(avgRevenuePerItem / avgCostPerItem).toFixed(2)} in revenue`
        : "N/A",
    },
    sections: [{ title: "Top selling items", rows: topItems }],
  };
}

function buildCostsReport(params?: ReportParams): ReportResult {
  const db = getDb();
  let purchaseWhere = "";
  let otherCostsWhere = "";
  const purchaseBinds: Record<string, string> = {};
  const otherCostsBinds: Record<string, string> = {};

  if (params?.from_date) {
    purchaseWhere += " WHERE purchase_date >= @from_date";
    otherCostsWhere += " WHERE created_at >= @from_date";
    purchaseBinds.from_date = params.from_date;
    otherCostsBinds.from_date = params.from_date;
  }
  if (params?.to_date) {
    const prefix = purchaseWhere ? " AND" : " WHERE";
    purchaseWhere += `${prefix} purchase_date <= @to_date`;
    otherCostsWhere += `${prefix} created_at <= @to_date`;
    purchaseBinds.to_date = params.to_date;
    otherCostsBinds.to_date = params.to_date;
  }

  const totals = db
    .prepare(
      `SELECT
        ROUND(SUM(COALESCE(p.purchase_price, 0)), 2) AS purchase_total,
        ROUND(SUM(COALESCE(p.shipping_price, 0)), 2) AS purchase_shipping_total
      FROM purchases p${purchaseWhere}`
    )
    .get(purchaseBinds) as { purchase_total: number; purchase_shipping_total: number };
  const otherCostsAllTotal = asNumber(
    (
      db
        .prepare(
          `SELECT ROUND(SUM(COALESCE(amount, 0)), 2) AS v FROM other_costs${otherCostsWhere}`
        )
        .get(otherCostsBinds) as { v: number }
    ).v
  );

  const { dateClause: orderDateClause, dateParams: orderDateParams } = buildDateClause(
    "o.order_date",
    params?.from_date,
    params?.to_date
  );
  const sellerShippingTotal = asNumber(
    (
      db
        .prepare(
          `SELECT ROUND(SUM(COALESCE(o.seller_shipping_cost, 0)), 2) AS v
          FROM orders o
          WHERE o.order_status = 'active' ${orderDateClause}`
        )
        .get(...orderDateParams) as { v: number }
    ).v
  );

  const shippingByCarrier = db
    .prepare(
      `SELECT
        COALESCE(o.shipper, 'Other') AS carrier,
        COUNT(*) AS shipments,
        ROUND(SUM(COALESCE(o.seller_shipping_cost, 0)), 2) AS shipping_cost
      FROM orders o
      WHERE o.order_status = 'active'
        AND COALESCE(o.seller_shipping_cost, 0) > 0
        ${orderDateClause}
      GROUP BY COALESCE(o.shipper, 'Other')
      ORDER BY shipping_cost DESC`
    )
    .all(...orderDateParams) as Array<Record<string, number | string>>;

  const purchaseRows = db
    .prepare(
      `SELECT
        vendor_name AS vendor,
        COUNT(*) AS items,
        ROUND(SUM(COALESCE(purchase_price, 0)), 2) AS purchase_total,
        ROUND(SUM(COALESCE(shipping_price, 0)), 2) AS shipping_total,
        ROUND(SUM(COALESCE(purchase_price, 0)) + SUM(COALESCE(shipping_price, 0)), 2) AS total_cost
      FROM purchases${purchaseWhere}
      GROUP BY vendor_name
      ORDER BY total_cost DESC`
    )
    .all(purchaseBinds) as Array<Record<string, number | string>>;

  const byType = db
    .prepare(
      `SELECT
        COALESCE(cost_type, '(unspecified)') AS cost_type,
        ROUND(SUM(COALESCE(amount, 0)), 2) AS total
      FROM other_costs${otherCostsWhere}
      GROUP BY COALESCE(cost_type, '(unspecified)')
      ORDER BY total DESC
      LIMIT 20`
    )
    .all(otherCostsBinds) as Array<{ cost_type: string; total: number }>;

  const dateLabel = describeDateRange(params?.from_date, params?.to_date);

  const vendorShippingTotal = asNumber(totals.purchase_shipping_total);
  const totalShippingCosts = Number(
    (sellerShippingTotal + vendorShippingTotal).toFixed(2)
  );

  const shippingBreakdown: Array<Record<string, number | string>> = [
    { category: "Seller shipping (to customers)", amount: sellerShippingTotal },
    { category: "Vendor shipping (inbound)", amount: vendorShippingTotal },
  ];

  const sections: Array<{ title: string; rows: Array<Record<string, number | string>>; compact?: boolean }> = [
    { title: "Purchase costs by vendor", rows: purchaseRows },
  ];
  if (shippingByCarrier.length > 0) {
    sections.push({ title: "Seller shipping by carrier", rows: shippingByCarrier, compact: true });
  }
  sections.push({ title: "Shipping cost breakdown", rows: shippingBreakdown, compact: true });
  if (byType.length > 0) {
    sections.push({ title: "Other costs by type", rows: byType, compact: true });
  }

  const purchaseTotal = asNumber(totals.purchase_total);
  const grandTotal = Number(
    (purchaseTotal + totalShippingCosts + otherCostsAllTotal).toFixed(2)
  );

  return {
    report_name: "costs",
    generated_at: new Date().toISOString(),
    summary: `Inventory purchase and operating costs — ${dateLabel}.`,
    metrics: {
      date_range: dateLabel,
      total_item_purchases: purchaseTotal,
      total_shipping_costs: totalShippingCosts,
      other_costs_total: otherCostsAllTotal,
      total_costs: grandTotal,
    },
    sections,
  };
}



function buildOutstandingItemsReport(): ReportResult {
  const rawRows = getDb()
    .prepare(
      `
      SELECT
        id,
        COALESCE(item_number, '(no item number)') AS item_number,
        COALESCE(status, '(unknown)') AS status,
        COALESCE(description, '') AS description,
        COALESCE(date_listed, '') AS date_listed,
        COALESCE(sale_revenue, 0) AS listed_price,
        COALESCE(purchase_cost, 0) AS purchase_cost,
        listing_title, listing_description, listing_tags,
        category_tags, condition_code, condition_notes,
        has_condition_issue, item_number AS raw_item_number,
        picture_1, picture_2, picture_3, picture_4, picture_5,
        picture_6, picture_7, picture_8, picture_9, picture_10
      FROM inventory
      WHERE COALESCE(status, '') NOT IN ('Sold', 'Retired')
        AND COALESCE(is_listed, 0) = 0
      ORDER BY COALESCE(updated_at, created_at, '') DESC, id DESC
      LIMIT 200
    `
    )
    .all() as Array<Record<string, unknown>>;

  const now = Date.now();
  const rows = rawRows.map((r) => {
    const scoreResult = computeListingScore(r as Parameters<typeof computeListingScore>[0]);
    const dateListed = String(r.date_listed ?? "");
    let daysListed = 0;
    if (dateListed) {
      const listedMs = new Date(dateListed).getTime();
      if (!isNaN(listedMs)) daysListed = Math.floor((now - listedMs) / 86_400_000);
    }
    const picCount = [r.picture_1, r.picture_2, r.picture_3, r.picture_4, r.picture_5,
      r.picture_6, r.picture_7, r.picture_8, r.picture_9, r.picture_10]
      .filter((p) => typeof p === "string" && p.trim().length > 0).length;
    return {
      item_number: String(r.item_number ?? ""),
      description: String(r.description ?? ""),
      status: String(r.status ?? ""),
      date_listed: dateListed,
      days_listed: daysListed,
      listed_price: Number(r.listed_price ?? 0),
      purchase_cost: Number(r.purchase_cost ?? 0),
      pictures: picCount,
      quality_score: scoreResult.score,
      quality_grade: scoreResult.grade,
    };
  });

  return {
    report_name: "outstanding-items",
    generated_at: new Date().toISOString(),
    summary: "Inventory not yet listed/sold and requiring action.",
    metrics: {
      date_range: `As of ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
      outstanding_count: rows.length,
    },
    sections: [{ title: "Outstanding inventory", rows, no_totals: true }],
  };
}

function buildArAgingReport(): ReportResult {
  const rows = getDb()
    .prepare(
      `
      SELECT
        COALESCE(o.order_number, CAST(o.id AS TEXT)) AS order_number,
        COALESCE(c.first_name, '') || CASE WHEN c.last_name IS NOT NULL AND c.last_name <> '' THEN ' ' || c.last_name ELSE '' END AS customer,
        COALESCE(o.order_date, o.created_at, '') AS order_date,
        ROUND(COALESCE(o.grand_total, 0), 2) AS amount,
        ROUND(COALESCE((
          SELECT SUM(COALESCE(i.purchase_cost, 0) + COALESCE(i.shipping_cost, 0))
          FROM order_items oi
          JOIN inventory i ON i.id = oi.inventory_id
          WHERE oi.order_id = o.id
        ), 0) + COALESCE((
          SELECT SUM(COALESCE(oc.amount, 0))
          FROM other_costs oc
          JOIN order_items oi2 ON oi2.inventory_id = oc.inventory_id
          WHERE oi2.order_id = o.id
        ), 0) + COALESCE(o.seller_shipping_cost, 0), 2) AS total_cost,
        CAST(julianday('now') - julianday(COALESCE(o.order_date, o.created_at, date('now'))) AS INTEGER) AS days_outstanding
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.order_status = 'active'
        AND (o.was_paid = 0 OR o.was_paid IS NULL)
      ORDER BY days_outstanding DESC, o.id DESC
    `
    )
    .all() as Array<{
    order_number: string;
    customer: string;
    order_date: string;
    amount: number;
    total_cost: number;
    days_outstanding: number;
  }>;

  const buckets = {
    current_0_30: 0,
    days_31_60: 0,
    days_61_90: 0,
    over_90_days: 0,
  };
  for (const row of rows) {
    if (row.days_outstanding <= 30) buckets.current_0_30 += asNumber(row.amount);
    else if (row.days_outstanding <= 60) buckets.days_31_60 += asNumber(row.amount);
    else if (row.days_outstanding <= 90) buckets.days_61_90 += asNumber(row.amount);
    else buckets.over_90_days += asNumber(row.amount);
  }

  return {
    report_name: "ar-aging",
    generated_at: new Date().toISOString(),
    summary: "Unpaid receivables with aging buckets.",
    metrics: {
      date_range: `As of ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
      unpaid_order_count: rows.length,
      ...Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, Number(v.toFixed(2))])),
      total_unpaid: Number(
        Object.values(buckets)
          .reduce((sum, v) => sum + v, 0)
          .toFixed(2)
      ),
      total_cost_at_risk: Number(
        rows.reduce((sum, r) => sum + asNumber(r.total_cost), 0).toFixed(2)
      ),
    },
    sections: [{ title: "Unpaid orders", rows, no_totals: true }],
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

  const invoiceMetrics: Record<string, ReportMetricValue> = {
    business_name: businessName,
    invoice_number: orderNumber,
    order_date: String(order.order_date ?? ""),
    ship_to: formatShipTo(order),
    subtotal: asNumber(order.subtotal),
    discount_total: asNumber(order.discount_total),
    shipping_total: asNumber(order.shipping_total),
    tax_total: asNumber(order.tax_total),
    grand_total: asNumber(order.grand_total),
    shipper: String(order.shipper ?? ""),
    payment_status: paymentStatus,
    shipping_status: shipStatus,
  };

  const trackingNumber = order.tracking_number ? String(order.tracking_number) : "";
  if (trackingNumber) {
    invoiceMetrics.tracking_number = trackingNumber;
  }
  if (order.shipping_carrier_service) {
    invoiceMetrics.shipping_carrier_service = String(order.shipping_carrier_service);
  }

  return {
    report_name: `invoice-${orderNumber}`,
    generated_at: new Date().toISOString(),
    summary: `Invoice #${orderNumber} for ${formatShipTo(order) || "customer"}.`,
    metrics: invoiceMetrics,
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

  const metrics: Record<string, ReportMetricValue> = {
    business_name: businessName,
    customer_name: customerName,
    order_number: orderNumber,
    order_date: String(order.order_date ?? ""),
    greeting: "Thank you for your order!",
    closing: "We hope you enjoy your purchase!",
  };

  const trackingNumber = order.tracking_number ? String(order.tracking_number) : "";
  if (trackingNumber) {
    metrics.tracking_number = trackingNumber;
    metrics.tracking_message = "Your package is on its way!";
    if (order.shipping_carrier_service) {
      metrics.shipping_carrier_service = String(order.shipping_carrier_service);
    }
  }

  return {
    report_name: `thank-you-${orderNumber}`,
    generated_at: new Date().toISOString(),
    summary: `Thank you for your order, ${customerName}!`,
    metrics,
    sections: [{ title: "Items in your order", rows: lineItems }],
  };
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
  const { dateClause, dateParams } = buildDateClause("i.date_of_sale", params?.from_date, params?.to_date);
  const dateLabel = describeDateRange(params?.from_date, params?.to_date);

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
        ROUND(COALESCE(ord_agg.discount_total, 0), 2) AS discount,
        ROUND(
          COALESCE(i.sale_revenue, 0) - COALESCE(ord_agg.discount_total, 0) -
          (COALESCE(i.purchase_cost, 0) + COALESCE(i.shipping_cost, 0) + COALESCE(oc.other_total, 0)),
          2
        ) AS net_profit,
        CASE
          WHEN COALESCE(i.sale_revenue, 0) = 0 THEN NULL
          ELSE ROUND(
            ((COALESCE(i.sale_revenue, 0) - COALESCE(ord_agg.discount_total, 0) -
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
      LEFT JOIN (
        SELECT oi.inventory_id,
          SUM(COALESCE(o.discount_total, 0)) AS discount_total,
          SUM(COALESCE(o.tax_total, 0)) AS tax_total
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id AND o.order_status = 'active'
        GROUP BY oi.inventory_id
      ) ord_agg ON ord_agg.inventory_id = i.id
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
    discount: number;
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

function buildVendorProfitabilityReport(params?: ReportParams): ReportResult {
  const db = getDb();
  const from = params?.from_date ?? yearStartDate();
  const to = params?.to_date ?? isoDateOnly(new Date());
  const dateLabel = describeDateRange(from, to);

  const vendorRows = db
    .prepare(
      `
      SELECT
        COALESCE(p.vendor_name, '(No vendor)') AS vendor_name,
        COUNT(DISTINCT i.id) AS item_count,
        SUM(CASE WHEN i.status = 'Sold' THEN 1 ELSE 0 END) AS sold_count,
        SUM(CASE WHEN i.status IN ('In stock', 'Listed', 'Reserved') THEN 1 ELSE 0 END) AS unsold_count,
        ROUND(SUM(COALESCE(p.purchase_price, 0)), 2) AS total_purchase_cost,
        ROUND(SUM(COALESCE(p.shipping_price, 0)), 2) AS total_vendor_shipping,
        ROUND(SUM(COALESCE(oc.other_total, 0)), 2) AS total_other_costs,
        ROUND(SUM(COALESCE(p.purchase_price, 0) + COALESCE(p.shipping_price, 0) + COALESCE(oc.other_total, 0)), 2) AS total_invested,
        ROUND(SUM(CASE WHEN i.status = 'Sold' THEN COALESCE(i.sale_revenue, 0) ELSE 0 END), 2) AS total_revenue,
        ROUND(SUM(CASE WHEN i.status = 'Sold' THEN COALESCE(ord_agg.discount_total, 0) ELSE 0 END), 2) AS total_discounts,
        ROUND(
          SUM(CASE WHEN i.status = 'Sold' THEN COALESCE(i.sale_revenue, 0) - COALESCE(ord_agg.discount_total, 0) ELSE 0 END) -
          SUM(CASE WHEN i.status = 'Sold' THEN COALESCE(p.purchase_price, 0) + COALESCE(p.shipping_price, 0) + COALESCE(oc.other_total, 0) ELSE 0 END),
          2
        ) AS total_profit,
        CASE
          WHEN SUM(CASE WHEN i.status = 'Sold' THEN COALESCE(i.sale_revenue, 0) ELSE 0 END) = 0 THEN NULL
          ELSE ROUND(
            (SUM(CASE WHEN i.status = 'Sold' THEN COALESCE(i.sale_revenue, 0) - COALESCE(ord_agg.discount_total, 0) ELSE 0 END) -
             SUM(CASE WHEN i.status = 'Sold' THEN COALESCE(p.purchase_price, 0) + COALESCE(p.shipping_price, 0) + COALESCE(oc.other_total, 0) ELSE 0 END))
            * 100.0 /
            SUM(CASE WHEN i.status = 'Sold' THEN COALESCE(i.sale_revenue, 0) ELSE 0 END),
            1
          )
        END AS margin_pct,
        CASE
          WHEN SUM(CASE WHEN i.status = 'Sold' THEN 1 ELSE 0 END) = 0 THEN NULL
          ELSE ROUND(
            (SUM(CASE WHEN i.status = 'Sold' THEN COALESCE(i.sale_revenue, 0) - COALESCE(ord_agg.discount_total, 0) ELSE 0 END) -
             SUM(CASE WHEN i.status = 'Sold' THEN COALESCE(p.purchase_price, 0) + COALESCE(p.shipping_price, 0) + COALESCE(oc.other_total, 0) ELSE 0 END))
            * 1.0 /
            SUM(CASE WHEN i.status = 'Sold' THEN 1 ELSE 0 END),
            2
          )
        END AS avg_profit_per_item
      FROM purchases p
      JOIN inventory i ON i.id = p.inventory_id
      LEFT JOIN (
        SELECT inventory_id, SUM(amount) AS other_total
        FROM other_costs GROUP BY inventory_id
      ) oc ON oc.inventory_id = i.id
      LEFT JOIN (
        SELECT oi.inventory_id,
          SUM(COALESCE(o.discount_total, 0)) AS discount_total,
          SUM(COALESCE(o.tax_total, 0)) AS tax_total
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id AND o.order_status = 'active'
        GROUP BY oi.inventory_id
      ) ord_agg ON ord_agg.inventory_id = i.id
      WHERE p.purchase_date IS NULL
         OR (p.purchase_date >= @from AND p.purchase_date <= @to)
      GROUP BY COALESCE(p.vendor_name, '(No vendor)')
      ORDER BY total_profit DESC
    `
    )
    .all({ from, to }) as Array<{
    vendor_name: string;
    item_count: number;
    sold_count: number;
    unsold_count: number;
    total_purchase_cost: number;
    total_vendor_shipping: number;
    total_other_costs: number;
    total_invested: number;
    total_revenue: number;
    total_discounts: number;
    total_profit: number;
    margin_pct: number | null;
    avg_profit_per_item: number | null;
  }>;

  const itemDetailRows = db
    .prepare(
      `
      SELECT
        COALESCE(p.vendor_name, '(No vendor)') AS vendor_name,
        i.item_number,
        i.description,
        i.status,
        ROUND(COALESCE(p.purchase_price, 0), 2) AS purchase_price,
        ROUND(COALESCE(p.shipping_price, 0), 2) AS vendor_shipping,
        ROUND(COALESCE(oc.other_total, 0), 2) AS other_costs,
        ROUND(COALESCE(i.sale_revenue, 0), 2) AS sale_revenue,
        ROUND(COALESCE(ord_agg.discount_total, 0), 2) AS discount,
        CASE WHEN i.status = 'Sold'
          THEN ROUND(COALESCE(i.sale_revenue, 0) - COALESCE(ord_agg.discount_total, 0) - COALESCE(p.purchase_price, 0) - COALESCE(p.shipping_price, 0) - COALESCE(oc.other_total, 0), 2)
          ELSE NULL
        END AS profit
      FROM purchases p
      JOIN inventory i ON i.id = p.inventory_id
      LEFT JOIN (
        SELECT inventory_id, SUM(amount) AS other_total
        FROM other_costs GROUP BY inventory_id
      ) oc ON oc.inventory_id = i.id
      LEFT JOIN (
        SELECT oi.inventory_id,
          SUM(COALESCE(o.discount_total, 0)) AS discount_total,
          SUM(COALESCE(o.tax_total, 0)) AS tax_total
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id AND o.order_status = 'active'
        GROUP BY oi.inventory_id
      ) ord_agg ON ord_agg.inventory_id = i.id
      WHERE p.purchase_date IS NULL
         OR (p.purchase_date >= @from AND p.purchase_date <= @to)
      ORDER BY COALESCE(p.vendor_name, '(No vendor)'), i.item_number
    `
    )
    .all({ from, to }) as Array<{
    vendor_name: string;
    item_number: string;
    description: string;
    status: string;
    purchase_price: number;
    vendor_shipping: number;
    other_costs: number;
    sale_revenue: number;
    discount: number;
    profit: number | null;
  }>;

  const grandTotals = vendorRows.reduce(
    (acc, r) => {
      acc.items += r.item_count;
      acc.sold += r.sold_count;
      acc.invested += r.total_invested;
      acc.revenue += r.total_revenue;
      acc.profit += r.total_profit;
      return acc;
    },
    { items: 0, sold: 0, invested: 0, revenue: 0, profit: 0 }
  );

  return {
    report_name: "vendor-profitability",
    generated_at: new Date().toISOString(),
    summary:
      vendorRows.length === 0
        ? "No vendor purchase records found."
        : `Vendor profitability — ${dateLabel}. ${vendorRows.length} vendor${vendorRows.length === 1 ? "" : "s"}, ${grandTotals.items} items.`,
    metrics: {
      date_range: dateLabel,
      vendor_count: vendorRows.length,
      total_items: grandTotals.items,
      total_sold: grandTotals.sold,
      total_invested: Number(grandTotals.invested.toFixed(2)),
      total_revenue: Number(grandTotals.revenue.toFixed(2)),
      total_profit: Number(grandTotals.profit.toFixed(2)),
      overall_margin_pct:
        grandTotals.revenue > 0
          ? Number(((grandTotals.profit / grandTotals.revenue) * 100).toFixed(1))
          : 0,
    },
    sections: [
      {
        title: "By vendor (ranked by profit)",
        rows: vendorRows as unknown as Array<Record<string, ReportMetricValue>>,
      },
      {
        title: "Item detail by vendor",
        rows: itemDetailRows as unknown as Array<Record<string, ReportMetricValue>>,
      },
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

  const configuredRate = getSetting("tax.default_rate");
  const taxRatePct = configuredRate ? parseFloat(configuredRate) : null;

  const formatted = rows.map((row) => {
    const [y, m] = row.month_key.split("-");
    const monthName = new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });
    return {
      month: monthName,
      order_count: row.order_count,
      gross_sales: row.gross_sales,
      taxable_sales: row.taxable_sales,
      tax_collected: row.tax_collected,
    };
  });

  const totalOrders = formatted.reduce((s, r) => s + asNumber(r.order_count), 0);
  const totalGross = formatted.reduce((s, r) => s + asNumber(r.gross_sales), 0);
  const totalTaxable = formatted.reduce((s, r) => s + asNumber(r.taxable_sales), 0);
  const totalTax = formatted.reduce((s, r) => s + asNumber(r.tax_collected), 0);

  const totalPaid = asNumber(
    (
      db
        .prepare(
          `SELECT ROUND(SUM(COALESCE(amount, 0)), 2) AS v FROM tax_payments`
        )
        .get() as { v: number }
    ).v
  );

  const paymentRows = db
    .prepare(
      `SELECT payment_date, COALESCE(payee, '') AS payee,
              COALESCE(reason, '') AS reason, amount,
              COALESCE(period_from, '') AS period_from,
              COALESCE(period_to, '') AS period_to,
              COALESCE(reference_number, '') AS reference_number,
              COALESCE(notes, '') AS notes
       FROM tax_payments
       ORDER BY payment_date DESC`
    )
    .all() as Array<Record<string, number | string>>;

  const liability = Number((totalTax - totalPaid).toFixed(2));

  const sections: Array<{ title: string; rows: Array<Record<string, number | string>>; compact?: boolean; no_totals?: boolean }> = [
    { title: "Monthly tax summary", rows: formatted },
  ];
  if (paymentRows.length > 0) {
    sections.push({ title: "Tax payments made", rows: paymentRows });
  }

  return {
    report_name: "sales-tax-summary",
    generated_at: new Date().toISOString(),
    summary:
      formatted.length === 0
        ? "No orders found for the selected date range."
        : `Sales tax summary — ${dateLabel}.`,
    metrics: {
      date_range: dateLabel,
      tax_rate_pct: taxRatePct != null && taxRatePct > 0 ? `${taxRatePct}%` : "Not configured",
      order_count: totalOrders,
      gross_sales: Number(totalGross.toFixed(2)),
      taxable_sales: Number(totalTaxable.toFixed(2)),
      tax_collected: Number(totalTax.toFixed(2)),
      taxes_paid: totalPaid,
      current_liability: liability,
    },
    sections,
  };
}

function buildInventoryAgingReport(params?: ReportParams): ReportResult {
  const db = getDb();
  const { dateClause, dateParams } = buildDateClause(
    "COALESCE(date_purchased, created_at)",
    params?.from_date,
    params?.to_date
  );
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
        ${dateClause}
      ORDER BY days_in_stock DESC, item_number ASC
    `
    )
    .all(...dateParams) as Array<{
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

  const dateLabel = describeDateRange(params?.from_date, params?.to_date);

  return {
    report_name: "inventory-aging",
    generated_at: new Date().toISOString(),
    summary:
      enriched.length === 0
        ? "No unsold inventory items found."
        : `Inventory aging for unsold items — ${dateLabel}.`,
    metrics: {
      date_range: dateLabel,
      item_count: enriched.length,
      total_purchase_cost: Number(totalCost.toFixed(2)),
      avg_days_in_stock: avgDays,
    },
    sections: [
      {
        title: "Aging inventory",
        rows: enriched as unknown as Array<Record<string, ReportMetricValue>>,
        no_totals: true,
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
  "Acct #": string;
  Account: string;
};

function loadAcctMap(): Record<string, string> {
  const db = getDb();
  const rows = db.prepare("SELECT account_name, acct_number FROM chart_of_accounts WHERE is_active = 1").all() as Array<{ account_name: string; acct_number: string }>;
  const map: Record<string, string> = {};
  for (const r of rows) map[r.account_name] = r.acct_number;
  return map;
}

export function buildAccountingExportRows(params?: ReportParams): AccountingExportRow[] {
  const db = getDb();
  const rows: AccountingExportRow[] = [];
  const ACCT = loadAcctMap();

  const sales = db
    .prepare(
      `SELECT
        o.order_date AS tx_date,
        COALESCE(o.order_number, CAST(o.id AS TEXT)) AS reference,
        ROUND(COALESCE(oi.line_total, oi.unit_price * oi.quantity, 0), 2) AS amount,
        COALESCE(i.description, '') AS item_description,
        COALESCE(i.item_number, CAST(i.id AS TEXT)) AS item_number,
        ROUND(COALESCE(i.purchase_cost, 0) + COALESCE(i.shipping_cost, 0), 2) AS item_cost
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN inventory i ON i.id = oi.inventory_id
      WHERE o.order_status = 'active'`
    )
    .all() as Array<{
    tx_date: string; reference: string; amount: number;
    item_description: string; item_number: string; item_cost: number;
  }>;

  const push2 = (date: string, type: string, ref: string, desc: string, amount: string, debitAcct: string, creditAcct: string) => {
    rows.push({ Date: date, "Transaction Type": type, Reference: ref, Description: desc, Debit: amount, Credit: "", "Acct #": ACCT[debitAcct] ?? "", Account: debitAcct });
    rows.push({ Date: date, "Transaction Type": type, Reference: ref, Description: desc, Debit: "", Credit: amount, "Acct #": ACCT[creditAcct] ?? "", Account: creditAcct });
  };

  for (const row of sales) {
    if (params?.from_date && row.tx_date < params.from_date) continue;
    if (params?.to_date && row.tx_date > params.to_date) continue;
    const date = row.tx_date?.slice(0, 10) ?? "";
    push2(date, "Sale", row.reference,
      `Sale: ${row.item_description} (${row.item_number})`,
      row.amount.toFixed(2), "Accounts Receivable", "Sales Revenue");
    if (row.item_cost > 0) {
      push2(date, "COGS", row.reference,
        `Cost of sale: ${row.item_description} (${row.item_number})`,
        row.item_cost.toFixed(2), "Cost of Goods Sold", "Inventory");
    }
  }

  const paidOrders = db
    .prepare(
      `SELECT order_date AS tx_date, COALESCE(order_number, CAST(id AS TEXT)) AS order_number,
        ROUND(COALESCE(grand_total, 0), 2) AS amount
      FROM orders
      WHERE order_status = 'active' AND payment_status = 'paid' AND COALESCE(grand_total, 0) > 0`
    )
    .all() as Array<{ tx_date: string; order_number: string; amount: number }>;

  for (const row of paidOrders) {
    if (params?.from_date && row.tx_date < params.from_date) continue;
    if (params?.to_date && row.tx_date > params.to_date) continue;
    push2(row.tx_date?.slice(0, 10) ?? "", "Payment", row.order_number,
      `Payment received: Order ${row.order_number}`,
      row.amount.toFixed(2), "Cash", "Accounts Receivable");
  }

  const shippingRevenue = db
    .prepare(
      `SELECT order_date AS tx_date, COALESCE(order_number, CAST(id AS TEXT)) AS order_number,
        ROUND(COALESCE(shipping_total, 0), 2) AS amount
      FROM orders WHERE order_status = 'active' AND COALESCE(shipping_total, 0) > 0`
    )
    .all() as Array<{ tx_date: string; order_number: string; amount: number }>;

  for (const row of shippingRevenue) {
    if (params?.from_date && row.tx_date < params.from_date) continue;
    if (params?.to_date && row.tx_date > params.to_date) continue;
    push2(row.tx_date?.slice(0, 10) ?? "", "Shipping Revenue", row.order_number,
      `Shipping revenue: Order ${row.order_number}`,
      row.amount.toFixed(2), "Accounts Receivable", "Shipping Income");
  }

  const discountRows = db
    .prepare(
      `SELECT order_date AS tx_date, COALESCE(order_number, CAST(id AS TEXT)) AS order_number,
        ROUND(COALESCE(discount_total, 0), 2) AS amount
      FROM orders WHERE order_status = 'active' AND COALESCE(discount_total, 0) > 0`
    )
    .all() as Array<{ tx_date: string; order_number: string; amount: number }>;

  for (const row of discountRows) {
    if (params?.from_date && row.tx_date < params.from_date) continue;
    if (params?.to_date && row.tx_date > params.to_date) continue;
    push2(row.tx_date?.slice(0, 10) ?? "", "Discount", row.order_number,
      `Discount: Order ${row.order_number}`,
      row.amount.toFixed(2), "Sales Discounts", "Accounts Receivable");
  }

  const refundedOrders = db
    .prepare(
      `SELECT o.order_date AS tx_date, COALESCE(o.order_number, CAST(o.id AS TEXT)) AS order_number,
        ROUND(COALESCE(o.subtotal, 0), 2) AS subtotal,
        ROUND(COALESCE(o.tax_total, 0), 2) AS tax,
        ROUND(COALESCE(o.grand_total, 0), 2) AS grand_total
      FROM orders o WHERE o.order_status = 'active' AND o.payment_status = 'refunded'`
    )
    .all() as Array<{ tx_date: string; order_number: string; subtotal: number; tax: number; grand_total: number }>;

  for (const row of refundedOrders) {
    if (params?.from_date && row.tx_date < params.from_date) continue;
    if (params?.to_date && row.tx_date > params.to_date) continue;
    const date = row.tx_date?.slice(0, 10) ?? "";
    if (row.subtotal > 0) {
      push2(date, "Refund", row.order_number,
        `Refund — reverse revenue: Order ${row.order_number}`,
        row.subtotal.toFixed(2), "Sales Returns & Allowances", "Cash");
    }
    if (row.tax > 0) {
      push2(date, "Refund", row.order_number,
        `Refund — reverse tax: Order ${row.order_number}`,
        row.tax.toFixed(2), "Sales Tax Payable", "Cash");
    }
  }

  const refundedItems = db
    .prepare(
      `SELECT o.order_date AS tx_date, COALESCE(o.order_number, CAST(o.id AS TEXT)) AS order_number,
        COALESCE(i.item_number, CAST(i.id AS TEXT)) AS item_number,
        COALESCE(i.description, '') AS item_description,
        ROUND(COALESCE(i.purchase_cost, 0) + COALESCE(i.shipping_cost, 0), 2) AS item_cost
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN inventory i ON i.id = oi.inventory_id
      WHERE o.order_status = 'active' AND o.payment_status = 'refunded'`
    )
    .all() as Array<{ tx_date: string; order_number: string; item_number: string; item_description: string; item_cost: number }>;

  for (const row of refundedItems) {
    if (params?.from_date && row.tx_date < params.from_date) continue;
    if (params?.to_date && row.tx_date > params.to_date) continue;
    if (row.item_cost > 0) {
      push2(row.tx_date?.slice(0, 10) ?? "", "Refund", row.order_number,
        `Refund — return to inventory: ${row.item_description} (${row.item_number})`,
        row.item_cost.toFixed(2), "Inventory", "Cost of Goods Sold");
    }
  }

  const shipping = db
    .prepare(
      `SELECT order_date AS tx_date, order_number, ROUND(COALESCE(seller_shipping_cost, 0), 2) AS amount
      FROM orders WHERE order_status = 'active' AND COALESCE(seller_shipping_cost, 0) > 0`
    )
    .all() as Array<{ tx_date: string; order_number: string; amount: number }>;

  for (const row of shipping) {
    if (params?.from_date && row.tx_date < params.from_date) continue;
    if (params?.to_date && row.tx_date > params.to_date) continue;
    push2(row.tx_date?.slice(0, 10) ?? "", "Shipping Expense", row.order_number,
      `Shipping cost: Order ${row.order_number}`,
      row.amount.toFixed(2), "Shipping Expense", "Cash");
  }

  const taxRows = db
    .prepare(
      `SELECT order_date AS tx_date, order_number, ROUND(COALESCE(tax_total, 0), 2) AS amount
      FROM orders WHERE order_status = 'active' AND COALESCE(tax_total, 0) > 0`
    )
    .all() as Array<{ tx_date: string; order_number: string; amount: number }>;

  for (const row of taxRows) {
    if (params?.from_date && row.tx_date < params.from_date) continue;
    if (params?.to_date && row.tx_date > params.to_date) continue;
    push2(row.tx_date?.slice(0, 10) ?? "", "Tax Collected", row.order_number,
      `Tax collected: Order ${row.order_number}`,
      row.amount.toFixed(2), "Accounts Receivable", "Sales Tax Payable");
  }

  const purchases = db
    .prepare(
      `SELECT p.purchase_date AS tx_date,
        COALESCE(i.item_number, CAST(p.inventory_id AS TEXT)) AS item_number,
        COALESCE(i.description, '') AS item_description,
        ROUND(COALESCE(p.purchase_price, 0), 2) AS purchase_price,
        ROUND(COALESCE(p.shipping_price, 0), 2) AS shipping_price
      FROM purchases p LEFT JOIN inventory i ON i.id = p.inventory_id`
    )
    .all() as Array<{
    tx_date: string; item_number: string; item_description: string;
    purchase_price: number; shipping_price: number;
  }>;

  for (const row of purchases) {
    const date = row.tx_date?.slice(0, 10) ?? "";
    if (params?.from_date && date < params.from_date) continue;
    if (params?.to_date && date > params.to_date) continue;
    if (row.purchase_price > 0) {
      push2(date, "Purchase", row.item_number,
        `Purchase: ${row.item_description} (${row.item_number})`,
        row.purchase_price.toFixed(2), "Inventory", "Cash");
    }
    if (row.shipping_price > 0) {
      push2(date, "Purchase Shipping", row.item_number,
        `Purchase shipping: ${row.item_description} (${row.item_number})`,
        row.shipping_price.toFixed(2), "Inventory", "Cash");
    }
  }

  const otherCosts = db
    .prepare(
      `SELECT date(oc.created_at) AS tx_date, oc.cost_type,
        ROUND(COALESCE(oc.amount, 0), 2) AS amount,
        COALESCE(i.item_number, CAST(oc.inventory_id AS TEXT)) AS item_number
      FROM other_costs oc LEFT JOIN inventory i ON i.id = oc.inventory_id`
    )
    .all() as Array<{ tx_date: string; cost_type: string; amount: number; item_number: string }>;

  for (const row of otherCosts) {
    if (params?.from_date && row.tx_date < params.from_date) continue;
    if (params?.to_date && row.tx_date > params.to_date) continue;
    if (row.amount <= 0) continue;
    push2(row.tx_date, "Other Cost", row.item_number,
      `Other cost: ${row.cost_type} - ${row.item_number}`,
      row.amount.toFixed(2), "Operating Expenses", "Cash");
  }

  const taxPayments = db
    .prepare(
      `SELECT payment_date AS tx_date, ROUND(amount, 2) AS amount,
        COALESCE(reference_number, CAST(id AS TEXT)) AS ref,
        COALESCE(payee, 'Tax Authority') AS payee
      FROM tax_payments WHERE amount > 0`
    )
    .all() as Array<{ tx_date: string; amount: number; ref: string; payee: string }>;

  for (const row of taxPayments) {
    if (params?.from_date && row.tx_date < params.from_date) continue;
    if (params?.to_date && row.tx_date > params.to_date) continue;
    push2(row.tx_date, "Tax Remittance", row.ref,
      `Tax payment to ${row.payee}`,
      row.amount.toFixed(2), "Sales Tax Payable", "Cash");
  }

  const bizExpenses = db
    .prepare(
      `SELECT expense_date AS tx_date, ROUND(amount * business_use_pct / 100.0, 2) AS amount,
        COALESCE(invoice_number, CAST(id AS TEXT)) AS ref,
        COALESCE(vendor_name, '') AS vendor_name,
        category,
        COALESCE(gl_account, CASE WHEN is_cogs = 1 THEN '5000' ELSE '6200' END) AS gl_acct
      FROM business_expenses WHERE amount > 0`
    )
    .all() as Array<{ tx_date: string; amount: number; ref: string; vendor_name: string; category: string; gl_acct: string }>;

  const acctNameByNumber: Record<string, string> = {};
  for (const [name, num] of Object.entries(ACCT)) acctNameByNumber[num] = name;

  for (const row of bizExpenses) {
    if (params?.from_date && row.tx_date < params.from_date) continue;
    if (params?.to_date && row.tx_date > params.to_date) continue;
    const debitAcctName = acctNameByNumber[row.gl_acct] ?? "Operating Expenses";
    push2(row.tx_date, "Business Expense", row.ref,
      `${row.category}${row.vendor_name ? ` — ${row.vendor_name}` : ""}`,
      row.amount.toFixed(2), debitAcctName, "Cash");
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
    "Acct #",
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
        toCsvValue(row["Acct #"]),
        toCsvValue(row.Account),
      ].join(",")
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Balance Sheet
// ---------------------------------------------------------------------------

type AccountBalance = { acct_number: string; account_name: string; account_type: string; normal_balance: string; balance: number };

function computeAccountBalances(asOfDate?: string): AccountBalance[] {
  const db = getDb();
  const accounts = db.prepare(
    "SELECT acct_number, account_name, account_type, normal_balance FROM chart_of_accounts WHERE is_active = 1"
  ).all() as Array<{ acct_number: string; account_name: string; account_type: string; normal_balance: string }>;

  const balances: Record<string, number> = {};
  for (const a of accounts) balances[a.account_name] = 0;

  const acctMap: Record<string, string> = {};
  for (const a of accounts) acctMap[a.acct_number] = a.account_name;
  const normalMap: Record<string, string> = {};
  for (const a of accounts) normalMap[a.account_name] = a.normal_balance;

  const addBalance = (acctName: string, amount: number, side: "debit" | "credit") => {
    if (!(acctName in balances)) return;
    const normal = normalMap[acctName];
    if (side === normal) {
      balances[acctName] += amount;
    } else {
      balances[acctName] -= amount;
    }
  };

  const dateFilter = asOfDate ? ` AND order_date <= '${asOfDate}'` : "";
  const purchDateFilter = asOfDate ? ` AND purchase_date <= '${asOfDate}'` : "";
  const expDateFilter = asOfDate ? ` AND expense_date <= '${asOfDate}'` : "";
  const taxDateFilter = asOfDate ? ` AND payment_date <= '${asOfDate}'` : "";

  // Sales → DR AR, CR Revenue
  const sales = db.prepare(
    `SELECT ROUND(COALESCE(SUM(oi.line_total), 0), 2) AS total
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.order_status = 'active'${dateFilter}`
  ).get() as { total: number };
  addBalance("Accounts Receivable", sales.total, "debit");
  addBalance("Sales Revenue", sales.total, "credit");

  // COGS → DR COGS, CR Inventory
  const cogs = db.prepare(
    `SELECT ROUND(COALESCE(SUM(COALESCE(i.purchase_cost, 0) + COALESCE(i.shipping_cost, 0)), 0), 2) AS total
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     LEFT JOIN inventory i ON i.id = oi.inventory_id
     WHERE o.order_status = 'active'${dateFilter}`
  ).get() as { total: number };
  addBalance("Cost of Goods Sold", cogs.total, "debit");
  addBalance("Inventory", cogs.total, "credit");

  // Payments → DR Cash, CR AR
  const payments = db.prepare(
    `SELECT ROUND(COALESCE(SUM(grand_total), 0), 2) AS total
     FROM orders WHERE order_status = 'active' AND payment_status = 'paid' AND COALESCE(grand_total, 0) > 0${dateFilter}`
  ).get() as { total: number };
  addBalance("Cash", payments.total, "debit");
  addBalance("Accounts Receivable", payments.total, "credit");

  // Shipping Revenue → DR AR, CR Shipping Income
  const shipRev = db.prepare(
    `SELECT ROUND(COALESCE(SUM(shipping_total), 0), 2) AS total
     FROM orders WHERE order_status = 'active' AND COALESCE(shipping_total, 0) > 0${dateFilter}`
  ).get() as { total: number };
  addBalance("Accounts Receivable", shipRev.total, "debit");
  addBalance("Shipping Income", shipRev.total, "credit");

  // Discounts → DR Sales Discounts, CR AR
  const discounts = db.prepare(
    `SELECT ROUND(COALESCE(SUM(discount_total), 0), 2) AS total
     FROM orders WHERE order_status = 'active' AND COALESCE(discount_total, 0) > 0${dateFilter}`
  ).get() as { total: number };
  addBalance("Sales Discounts", discounts.total, "debit");
  addBalance("Accounts Receivable", discounts.total, "credit");

  // Tax Collected → DR AR, CR Sales Tax Payable
  const taxCollected = db.prepare(
    `SELECT ROUND(COALESCE(SUM(tax_total), 0), 2) AS total
     FROM orders WHERE order_status = 'active' AND COALESCE(tax_total, 0) > 0${dateFilter}`
  ).get() as { total: number };
  addBalance("Accounts Receivable", taxCollected.total, "debit");
  addBalance("Sales Tax Payable", taxCollected.total, "credit");

  // Shipping Expense → DR Shipping Expense, CR Cash
  const shipExp = db.prepare(
    `SELECT ROUND(COALESCE(SUM(seller_shipping_cost), 0), 2) AS total
     FROM orders WHERE order_status = 'active' AND COALESCE(seller_shipping_cost, 0) > 0${dateFilter}`
  ).get() as { total: number };
  addBalance("Shipping Expense", shipExp.total, "debit");
  addBalance("Cash", shipExp.total, "credit");

  // Refunds → DR Returns & Allowances, CR Cash; DR Sales Tax Payable, CR Cash
  const refunds = db.prepare(
    `SELECT ROUND(COALESCE(SUM(subtotal), 0), 2) AS sub_total,
            ROUND(COALESCE(SUM(tax_total), 0), 2) AS tax_total
     FROM orders WHERE order_status = 'active' AND payment_status = 'refunded'${dateFilter}`
  ).get() as { sub_total: number; tax_total: number };
  addBalance("Sales Returns & Allowances", refunds.sub_total, "debit");
  addBalance("Cash", refunds.sub_total, "credit");
  addBalance("Sales Tax Payable", refunds.tax_total, "debit");
  addBalance("Cash", refunds.tax_total, "credit");

  // Refund COGS reversal → DR Inventory, CR COGS
  const refundCogs = db.prepare(
    `SELECT ROUND(COALESCE(SUM(COALESCE(i.purchase_cost, 0) + COALESCE(i.shipping_cost, 0)), 0), 2) AS total
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     LEFT JOIN inventory i ON i.id = oi.inventory_id
     WHERE o.order_status = 'active' AND o.payment_status = 'refunded'${dateFilter}`
  ).get() as { total: number };
  addBalance("Inventory", refundCogs.total, "debit");
  addBalance("Cost of Goods Sold", refundCogs.total, "credit");

  // Purchases → DR Inventory, CR Cash
  const purch = db.prepare(
    `SELECT ROUND(COALESCE(SUM(COALESCE(purchase_price, 0) + COALESCE(shipping_price, 0)), 0), 2) AS total
     FROM purchases WHERE 1=1${purchDateFilter}`
  ).get() as { total: number };
  addBalance("Inventory", purch.total, "debit");
  addBalance("Cash", purch.total, "credit");

  // Other Costs → DR Operating Expenses, CR Cash
  const otherCosts = db.prepare(
    `SELECT ROUND(COALESCE(SUM(amount), 0), 2) AS total
     FROM other_costs WHERE COALESCE(amount, 0) > 0`
  ).get() as { total: number };
  addBalance("Operating Expenses", otherCosts.total, "debit");
  addBalance("Cash", otherCosts.total, "credit");

  // Tax Remittance → DR Sales Tax Payable, CR Cash
  const taxPaid = db.prepare(
    `SELECT ROUND(COALESCE(SUM(amount), 0), 2) AS total
     FROM tax_payments WHERE amount > 0${taxDateFilter}`
  ).get() as { total: number };
  addBalance("Sales Tax Payable", taxPaid.total, "debit");
  addBalance("Cash", taxPaid.total, "credit");

  // Business Expenses → DR expense acct, CR Cash
  const bizExp = db.prepare(
    `SELECT COALESCE(gl_account, CASE WHEN is_cogs = 1 THEN '5000' ELSE '6200' END) AS gl_acct,
            ROUND(SUM(amount * business_use_pct / 100.0), 2) AS total
     FROM business_expenses WHERE amount > 0${expDateFilter}
     GROUP BY gl_acct`
  ).all() as Array<{ gl_acct: string; total: number }>;
  for (const row of bizExp) {
    const acctName = acctMap[row.gl_acct] ?? "Operating Expenses";
    addBalance(acctName, row.total, "debit");
    addBalance("Cash", row.total, "credit");
  }

  return accounts.map((a) => ({
    ...a,
    balance: Math.round((balances[a.account_name] ?? 0) * 100) / 100,
  }));
}

function buildBalanceSheetReport(params?: ReportParams): ReportResult {
  const asOfDate = params?.to_date ?? new Date().toISOString().slice(0, 10);
  const allBalances = computeAccountBalances(asOfDate);

  const bsTypes = new Set(["Asset", "Liability", "Equity"]);
  const bsAccounts = allBalances.filter((a) => bsTypes.has(a.account_type));

  const netIncome = computeNetIncome(allBalances);

  const assetRows = bsAccounts
    .filter((a) => a.account_type === "Asset")
    .map((a) => ({ "Acct #": a.acct_number, Account: a.account_name, Balance: a.balance }));
  const totalAssets = assetRows.reduce((s, r) => s + (r.Balance as number), 0);

  const liabilityRows = bsAccounts
    .filter((a) => a.account_type === "Liability")
    .map((a) => ({ "Acct #": a.acct_number, Account: a.account_name, Balance: a.balance }));
  const totalLiabilities = liabilityRows.reduce((s, r) => s + (r.Balance as number), 0);

  const equityRows = bsAccounts
    .filter((a) => a.account_type === "Equity")
    .map((a) => ({ "Acct #": a.acct_number, Account: a.account_name, Balance: a.balance }));
  equityRows.push({ "Acct #": "----", Account: "Current Period Net Income", Balance: Math.round(netIncome * 100) / 100 });
  const totalEquity = equityRows.reduce((s, r) => s + (r.Balance as number), 0);

  return {
    report_name: "balance-sheet",
    generated_at: new Date().toISOString(),
    summary: `As of ${asOfDate}`,
    metrics: {
      as_of_date: asOfDate,
      total_assets: Math.round(totalAssets * 100) / 100,
      total_liabilities: Math.round(totalLiabilities * 100) / 100,
      total_equity: Math.round(totalEquity * 100) / 100,
      total_liabilities_and_equity: Math.round((totalLiabilities + totalEquity) * 100) / 100,
    },
    sections: [
      { title: "Assets", no_totals: true, rows: [...assetRows, { "Acct #": "", Account: "Total Assets", Balance: Math.round(totalAssets * 100) / 100 }] },
      { title: "Liabilities", no_totals: true, rows: [...liabilityRows, { "Acct #": "", Account: "Total Liabilities", Balance: Math.round(totalLiabilities * 100) / 100 }] },
      { title: "Equity", no_totals: true, rows: [...equityRows, { "Acct #": "", Account: "Total Equity", Balance: Math.round(totalEquity * 100) / 100 }] },
    ],
  };
}

// ---------------------------------------------------------------------------
// Income Statement (P&L)
// ---------------------------------------------------------------------------

function computeNetIncome(allBalances: AccountBalance[]): number {
  let netIncome = 0;
  for (const a of allBalances) {
    if (a.account_type === "Revenue") {
      netIncome += a.balance;
    } else if (a.account_type === "Contra-Revenue") {
      netIncome -= a.balance;
    } else if (a.account_type === "COGS") {
      netIncome -= a.balance;
    } else if (a.account_type === "Expense") {
      netIncome -= a.balance;
    }
  }
  return netIncome;
}

function buildIncomeStatementReport(params?: ReportParams): ReportResult {
  const allBalances = computeAccountBalances(params?.to_date);

  const revenueAccounts = allBalances.filter((a) => a.account_type === "Revenue");
  const contraAccounts = allBalances.filter((a) => a.account_type === "Contra-Revenue");
  const cogsAccounts = allBalances.filter((a) => a.account_type === "COGS");
  const expenseAccounts = allBalances.filter((a) => a.account_type === "Expense");

  const totalRevenue = revenueAccounts.reduce((s, a) => s + a.balance, 0);
  const totalContra = contraAccounts.reduce((s, a) => s + a.balance, 0);
  const netRevenue = totalRevenue - totalContra;
  const totalCogs = cogsAccounts.reduce((s, a) => s + a.balance, 0);
  const grossProfit = netRevenue - totalCogs;
  const totalExpenses = expenseAccounts.reduce((s, a) => s + a.balance, 0);
  const netIncome = grossProfit - totalExpenses;

  const round = (n: number) => Math.round(n * 100) / 100;

  const revenueRows = revenueAccounts.map((a) => ({ "Acct #": a.acct_number, Account: a.account_name, Amount: a.balance }));
  const contraRows = contraAccounts.map((a) => ({ "Acct #": a.acct_number, Account: a.account_name, Amount: -a.balance }));
  const cogsRows = cogsAccounts.map((a) => ({ "Acct #": a.acct_number, Account: a.account_name, Amount: a.balance }));
  const expenseRows = expenseAccounts.map((a) => ({ "Acct #": a.acct_number, Account: a.account_name, Amount: a.balance }));

  const dateRange = describeDateRange(params?.from_date, params?.to_date);

  return {
    report_name: "income-statement",
    generated_at: new Date().toISOString(),
    summary: dateRange,
    metrics: {
      date_range: dateRange,
      total_revenue: round(totalRevenue),
      total_contra_revenue: round(totalContra),
      net_revenue: round(netRevenue),
      total_cogs: round(totalCogs),
      gross_profit: round(grossProfit),
      total_operating_expenses: round(totalExpenses),
      net_income: round(netIncome),
    },
    sections: [
      {
        title: "Revenue",
        no_totals: true,
        rows: [
          ...revenueRows,
          ...(contraRows.length > 0 ? [{ "Acct #": "" as string | number, Account: "Less:", Amount: "" as string | number }] : []),
          ...contraRows,
          { "Acct #": "", Account: "Net Revenue", Amount: round(netRevenue) },
        ],
      },
      {
        title: "Cost of Goods Sold",
        no_totals: true,
        rows: [
          ...cogsRows,
          { "Acct #": "", Account: "Total COGS", Amount: round(totalCogs) },
        ],
      },
      {
        title: "Gross Profit",
        no_totals: true,
        rows: [
          { "Acct #": "", Account: "Gross Profit (Net Revenue − COGS)", Amount: round(grossProfit) },
        ],
      },
      {
        title: "Operating Expenses",
        no_totals: true,
        rows: [
          ...expenseRows,
          { "Acct #": "", Account: "Total Operating Expenses", Amount: round(totalExpenses) },
        ],
      },
      {
        title: "Net Income",
        no_totals: true,
        rows: [
          { "Acct #": "", Account: "Net Income", Amount: round(netIncome) },
        ],
      },
    ],
  };
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
  if (reportName === "costs") return buildCostsReport(params);
  if (reportName === "outstanding-items") return buildOutstandingItemsReport();
  if (reportName === "ar-aging") return buildArAgingReport();
  if (reportName === "invoice") return buildInvoiceReport();
  if (reportName === "thank-you-note") return buildThankYouReport();
  if (reportName === "profit-by-item") return buildProfitByItemReport(params);
  if (reportName === "vendor-profitability") return buildVendorProfitabilityReport(params);
  if (reportName === "sales-tax-summary") return buildSalesTaxSummaryReport(params);
  if (reportName === "inventory-aging") return buildInventoryAgingReport(params);
  if (reportName === "accounting-export") return buildAccountingExportReport(params);
  if (reportName === "balance-sheet") return buildBalanceSheetReport(params);
  if (reportName === "income-statement") return buildIncomeStatementReport(params);
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
    return "json";
  }
  const lower = value.toLowerCase();
  if (lower === "csv") return "csv";
  if (lower === "json") return "json";
  return "json";
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

export function saveReportArtifact(reportName: string, report: ReportResult, format?: string): void {
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
  logActivity({ action: "report.generated", entityType: "report", entityLabel: reportName, detail: { report_name: reportName, format: format ?? "pdf" } });
}
