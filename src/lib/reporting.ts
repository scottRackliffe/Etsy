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
  const row = getDb().prepare(sql).get(...params) as { c: number };
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

function buildSalesReport(): ReportResult {
  const db = getDb();
  const topItems = db
    .prepare(
      `
      SELECT
        COALESCE(i.item_number, CAST(i.id AS TEXT), '(unknown)') AS item,
        SUM(COALESCE(oi.quantity, 0)) AS units_sold,
        ROUND(SUM(COALESCE(oi.line_total, COALESCE(oi.unit_price, 0) * COALESCE(oi.quantity, 0))), 2) AS revenue
      FROM order_items oi
      JOIN inventory i ON i.id = oi.inventory_id
      GROUP BY oi.inventory_id
      ORDER BY revenue DESC, units_sold DESC
      LIMIT 10
    `
    )
    .all() as Array<{ item: string; units_sold: number; revenue: number }>;

  const orderCount = getCount("SELECT COUNT(*) AS c FROM orders");
  const grossRevenue = asNumber(
    (db.prepare("SELECT ROUND(SUM(COALESCE(grand_total, 0)), 2) AS v FROM orders").get() as { v: number })
      .v
  );

  return {
    report_name: "sales",
    generated_at: new Date().toISOString(),
    summary: "Sales performance with order totals and top items.",
    metrics: {
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
    (db.prepare("SELECT ROUND(SUM(COALESCE(amount, 0)), 2) AS v FROM other_costs").get() as { v: number }).v
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
        (asNumber(totals.purchase_total) + asNumber(totals.purchase_shipping_total) + otherCostsTotal).toFixed(
          2
        )
      ),
    },
    sections: [{ title: "Other costs by type", rows: byType }],
  };
}

function buildIncomeReport(kind: "income-mtd" | "income-ytd"): ReportResult {
  const db = getDb();
  const startDate = kind === "income-mtd" ? monthStart() : yearStart();
  const gross = asNumber(
    (
      db
        .prepare(
          `
          SELECT ROUND(SUM(COALESCE(grand_total, 0)), 2) AS v
          FROM orders
          WHERE COALESCE(order_date, created_at, '') >= ?
        `
        )
        .get(startDate) as { v: number }
    ).v
  );
  const shipping = asNumber(
    (
      db
        .prepare(
          `
          SELECT ROUND(SUM(COALESCE(shipping_total, 0)), 2) AS v
          FROM orders
          WHERE COALESCE(order_date, created_at, '') >= ?
        `
        )
        .get(startDate) as { v: number }
    ).v
  );
  const tax = asNumber(
    (
      db
        .prepare(
          `
          SELECT ROUND(SUM(COALESCE(tax_total, 0)), 2) AS v
          FROM orders
          WHERE COALESCE(order_date, created_at, '') >= ?
        `
        )
        .get(startDate) as { v: number }
    ).v
  );
  const discount = asNumber(
    (
      db
        .prepare(
          `
          SELECT ROUND(SUM(COALESCE(discount_total, 0)), 2) AS v
          FROM orders
          WHERE COALESCE(order_date, created_at, '') >= ?
        `
        )
        .get(startDate) as { v: number }
    ).v
  );
  const orders = getCount(
    "SELECT COUNT(*) AS c FROM orders WHERE COALESCE(order_date, created_at, '') >= ?",
    [startDate]
  );

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

function buildPostalByVendorReport(): ReportResult {
  const rows = getDb()
    .prepare(
      `
      SELECT
        COALESCE(vendor_name, '(unspecified)') AS vendor_name,
        COUNT(*) AS purchase_count,
        ROUND(SUM(COALESCE(shipping_price, 0)), 2) AS shipping_total
      FROM purchases
      GROUP BY COALESCE(vendor_name, '(unspecified)')
      ORDER BY shipping_total DESC, purchase_count DESC
    `
    )
    .all() as Array<{ vendor_name: string; purchase_count: number; shipping_total: number }>;

  return {
    report_name: "postal-by-vendor",
    generated_at: new Date().toISOString(),
    summary: "Shipping cost exposure by vendor.",
    metrics: {
      vendor_count: rows.length,
      shipping_total: rows.reduce((sum, row) => sum + asNumber(row.shipping_total), 0),
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
      WHERE COALESCE(status, '') NOT IN ('sold', 'archived')
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
      WHERE LOWER(COALESCE(payment_status, '')) NOT IN ('paid', 'complete')
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
      total_unpaid: Number(Object.values(buckets).reduce((sum, v) => sum + v, 0).toFixed(2)),
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
      WHERE LOWER(COALESCE(o.payment_status, '')) NOT IN ('paid', 'complete')
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
      total_amount_due: Number(rows.reduce((sum, row) => sum + asNumber(row.amount_due), 0).toFixed(2)),
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
      WHERE LOWER(COALESCE(o.payment_status, '')) IN ('paid', 'complete')
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

export function buildReport(reportName: string): ReportResult {
  if (reportName === "sales") return buildSalesReport();
  if (reportName === "costs") return buildCostsReport();
  if (reportName === "income-mtd" || reportName === "income-ytd") return buildIncomeReport(reportName);
  if (reportName === "postal-by-vendor") return buildPostalByVendorReport();
  if (reportName === "outstanding-items") return buildOutstandingItemsReport();
  if (reportName === "ar-aging") return buildArAgingReport();
  if (reportName === "invoice") return buildInvoiceReport();
  if (reportName === "thank-you-note") return buildThankYouReport();
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
    const keys = Array.from(
      new Set(section.rows.flatMap((row) => Object.keys(row)))
    ) as Array<keyof (typeof section.rows)[number]>;
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

    doc.fontSize(18).text(`${report.report_name} report`, { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Generated: ${report.generated_at}`);
    doc.moveDown(0.5);
    doc.fontSize(11).text(report.summary);
    doc.moveDown();
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
        doc.fontSize(10).text(`... ${section.rows.length - 100} additional rows omitted in PDF output.`);
      }
    }
    doc.end();
  });
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
