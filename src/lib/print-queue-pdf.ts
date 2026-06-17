import PDFDocument from "pdfkit";
import { getOrder } from "@/lib/records";
import {
  buildSingleOrderInvoice,
  buildSingleOrderThankYou,
  type ReportResult,
} from "@/lib/reporting";
import type { PrintQueueDocType } from "@/lib/print-queue";
import { getShippingInfoForCarrier } from "@/lib/shipping-info-server";
import {
  isOrderShipToComplete,
  isShippingInfoComplete,
  type ShippingInfoData,
} from "@/lib/shipping-info";

export type PrintQueueRequestItem = {
  type: PrintQueueDocType;
  orderId: number;
};

const MAX_ITEMS = 50;

function isActiveOrder(order: Record<string, unknown> | null): order is Record<string, unknown> {
  return Boolean(order && String(order.order_status ?? "active") === "active");
}

function orderLabel(order: Record<string, unknown>, orderId: number): string {
  return String(order.order_number ?? `Order ${orderId}`);
}

function renderShippingLabelContent(
  doc: InstanceType<typeof PDFDocument>,
  order: Record<string, unknown>,
  shipper: string,
  info: ShippingInfoData
): void {
  const toName = [order.ship_to_first_name, order.ship_to_last_name].filter(Boolean).join(" ");
  const toLines = [
    toName,
    order.ship_to_address_line_1,
    order.ship_to_address_line_2,
    [order.ship_to_city, order.ship_to_state_province, order.ship_to_postal_code]
      .filter(Boolean)
      .join(", "),
    order.ship_to_country,
  ].filter((line) => typeof line === "string" && line.trim().length > 0) as string[];

  const fromLines = [
    info.return_name,
    info.return_address_line_1,
    info.return_address_line_2,
    [info.return_city, info.return_state, info.return_postal_code].filter(Boolean).join(", "),
    info.return_country,
    info.phone,
    info.account_number ? `Acct: ${info.account_number}` : "",
  ].filter((line) => typeof line === "string" && line.trim().length > 0);

  doc.fontSize(14).text("Shipping label");
  doc.moveDown(0.3);
  doc.fontSize(11).text(`${shipper} · ${orderLabel(order, Number(order.id))}`);
  doc.moveDown();

  doc.fontSize(9).text("SHIP TO", { underline: true });
  doc.moveDown(0.2);
  doc.fontSize(11);
  for (const line of toLines) {
    doc.text(String(line));
  }
  doc.moveDown();

  doc.fontSize(9).text("RETURN / SENDER", { underline: true });
  doc.moveDown(0.2);
  doc.fontSize(11);
  for (const line of fromLines) {
    doc.text(String(line));
  }

  if (order.tracking_number) {
    doc.moveDown();
    doc.fontSize(10).text(`Tracking: ${String(order.tracking_number)}`);
  }
}

function typeLabel(type: PrintQueueDocType): string {
  switch (type) {
    case "invoice":
      return "Invoice";
    case "thank-you":
      return "Thank-you note";
    case "label":
      return "Shipping label";
  }
}

export function validatePrintQueueItems(items: PrintQueueRequestItem[]): string[] {
  const failures: string[] = [];
  for (const item of items) {
    const order = getOrder(item.orderId) as Record<string, unknown> | null;
    if (!order) {
      failures.push(`${typeLabel(item.type)} for order ${item.orderId}: order not found`);
      continue;
    }
    if (!isActiveOrder(order)) {
      failures.push(
        `${typeLabel(item.type)} for ${orderLabel(order, item.orderId)}: order is void or cancelled`
      );
      continue;
    }

    if (item.type === "invoice") {
      if (!buildSingleOrderInvoice(item.orderId)) {
        failures.push(`Invoice for ${orderLabel(order, item.orderId)}: could not build document`);
      }
    } else if (item.type === "thank-you") {
      if (!buildSingleOrderThankYou(item.orderId)) {
        failures.push(
          `Thank-you note for ${orderLabel(order, item.orderId)}: could not build document`
        );
      }
    } else {
      if (!isOrderShipToComplete(order)) {
        failures.push(
          `Shipping label for ${orderLabel(order, item.orderId)}: ship-to address is incomplete`
        );
        continue;
      }
      const shipper = String(order.shipper ?? "").trim();
      const shippingInfo = getShippingInfoForCarrier(shipper);
      if (!isShippingInfoComplete(shipper, shippingInfo)) {
        failures.push(
          `Shipping label for ${orderLabel(order, item.orderId)}: Shipping Info missing for ${shipper || "carrier"}`
        );
      }
    }
  }
  return failures;
}

function renderReportToPdf(
  doc: InstanceType<typeof PDFDocument>,
  report: ReportResult
): void {
  doc.fontSize(18).text(`${report.report_name}`, { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(11).text(`Generated: ${report.generated_at}`);
  doc.moveDown(0.5);
  doc.fontSize(11).text(report.summary);
  doc.moveDown();
  for (const [metric, value] of Object.entries(report.metrics)) {
    doc.fontSize(11).text(`${metric}: ${value}`);
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
  }
}

function resolveReportForItem(item: PrintQueueRequestItem): ReportResult | null {
  if (item.type === "invoice") return buildSingleOrderInvoice(item.orderId);
  if (item.type === "thank-you") return buildSingleOrderThankYou(item.orderId);
  return null;
}

export async function buildPrintQueuePdf(items: PrintQueueRequestItem[]): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      autoFirstPage: false,
      info: {
        Title: "Print queue",
        Author: "AiCE",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (error) => reject(error));

    for (const item of items) {
      const order = getOrder(item.orderId) as Record<string, unknown>;
      const label = orderLabel(order, item.orderId);

      doc.addPage();
      doc
        .fontSize(12)
        .fillColor("#444444")
        .text(`${typeLabel(item.type)} — ${label}`, {
          align: "center",
        });
      doc.fillColor("#000000");
      doc.moveDown();

      if (item.type === "label") {
        const shipper = String(order.shipper ?? "").trim();
        const shippingInfo = getShippingInfoForCarrier(shipper);
        renderShippingLabelContent(doc, order, shipper, shippingInfo);
      } else {
        const report = resolveReportForItem(item);
        if (report) {
          renderReportToPdf(doc, report);
        }
      }
    }

    doc.end();
  });
}

export function parsePrintQueueRequestItems(body: unknown): PrintQueueRequestItem[] {
  if (!body || typeof body !== "object" || !("items" in body)) {
    throw new Error("INVALID_BODY");
  }
  const rawItems = (body as { items: unknown }).items;
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > MAX_ITEMS) {
    throw new Error("INVALID_ITEMS");
  }

  const parsed: PrintQueueRequestItem[] = [];
  for (const row of rawItems) {
    if (!row || typeof row !== "object") throw new Error("INVALID_ITEMS");
    const type = (row as { type?: unknown }).type;
    const orderId = Number((row as { orderId?: unknown }).orderId);
    if (
      (type !== "invoice" && type !== "thank-you" && type !== "label") ||
      !Number.isInteger(orderId) ||
      orderId <= 0
    ) {
      throw new Error("INVALID_ITEMS");
    }
    parsed.push({ type, orderId });
  }
  return parsed;
}
