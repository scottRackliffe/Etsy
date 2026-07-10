/**
 * GET /api/inventory/[id]/shot-list-pdf
 *
 * Returns a printable PDF of the item's AI shot list — one entry per shot
 * with shot name, what it must show (purpose), pass criteria, tips, and
 * captured/needed status.
 *
 * ADR-013 (PDF output), ADR-083 (shot-list generation).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import PDFDocument from "pdfkit";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { getInventoryById } from "@/lib/inventory";
import { getSavedShotList, type ShotListItem } from "@/lib/shot-list";

const BODY_FONT_SIZE = 9;
const DETAIL_FONT_SIZE = 8;
const MIN_SHOT_BLOCK_HEIGHT = 72;

function estimateShotBlockHeight(
  doc: InstanceType<typeof PDFDocument>,
  pageWidth: number,
  shot: ShotListItem
): number {
  doc.font("Helvetica-Bold").fontSize(11);
  let height = doc.heightOfString(`${shot.name}  NEEDED`, { width: pageWidth });
  doc.font("Helvetica").fontSize(DETAIL_FONT_SIZE);
  height += doc.heightOfString(shot.shot_type.toUpperCase(), { width: pageWidth }) + 2;
  doc.font("Helvetica").fontSize(BODY_FONT_SIZE);
  if (shot.purpose) {
    height += doc.heightOfString(`What it must show: ${shot.purpose}`, { width: pageWidth }) + 2;
  }
  if (shot.pass_spec) {
    height += doc.heightOfString(`Pass: ${shot.pass_spec}`, { width: pageWidth }) + 2;
  }
  if (shot.tips) {
    height += doc.heightOfString(`Tip: ${shot.tips}`, { width: pageWidth }) + 2;
  }
  return height + 14;
}

function ensureVerticalSpace(doc: InstanceType<typeof PDFDocument>, minHeight: number): void {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + minHeight > bottom) {
    doc.addPage();
  }
}

function writeWrapped(
  doc: InstanceType<typeof PDFDocument>,
  text: string,
  pageWidth: number,
  options?: { font?: string; size?: number; color?: string }
): void {
  doc
    .font(options?.font ?? "Helvetica")
    .fontSize(options?.size ?? BODY_FONT_SIZE)
    .fillColor(options?.color ?? "#000000")
    .text(text, { width: pageWidth, lineGap: 2 });
}

function buildShotListPdf(
  itemNumber: string,
  description: string,
  shots: ShotListItem[]
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      autoFirstPage: true,
      size: "LETTER",
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: `Photo Shot List — ${itemNumber}`,
        Author: "AiCE",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err) => reject(err));

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // ── Header ──────────────────────────────────────────────────────────────
    doc.fontSize(16).font("Helvetica-Bold").text("Photo Shot List", { width: pageWidth, align: "left" });
    doc.moveDown(0.3);
    doc.fontSize(11).font("Helvetica-Bold").text(itemNumber, { width: pageWidth, align: "left" });
    if (description) {
      doc.fontSize(10).font("Helvetica").fillColor("#444444").text(description, {
        width: pageWidth,
        align: "left",
      });
    }
    doc.fillColor("#000000");

    const generatedAt = new Date().toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    doc.moveDown(0.3);
    doc.fontSize(8).fillColor("#888888").text(`Generated ${generatedAt}`, { align: "left" });
    doc.fillColor("#000000");

    // Summary line
    const total = shots.length;
    const capturedCount = shots.filter((s) => s.captured).length;
    const requiredCount = shots.filter((s) => s.required).length;
    doc.moveDown(0.3);
    doc.fontSize(9).font("Helvetica").fillColor("#555555")
      .text(`${capturedCount} of ${total} shots captured · ${requiredCount} required`, { align: "left" });
    doc.fillColor("#000000");

    // Divider
    doc.moveDown(0.5);
    doc
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.margins.left + pageWidth, doc.y)
      .strokeColor("#cccccc")
      .lineWidth(0.5)
      .stroke();
    doc.strokeColor("#000000").lineWidth(1);
    doc.moveDown(0.5);

    // ── Shots ───────────────────────────────────────────────────────────────
    const required = shots.filter((s) => s.required);
    const recommended = shots.filter((s) => !s.required);

    function renderGroup(title: string, items: ShotListItem[]) {
      if (items.length === 0) return;

      ensureVerticalSpace(doc, 24);
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#666666").text(title.toUpperCase(), {
        width: pageWidth,
      });
      doc.fillColor("#000000");
      doc.moveDown(0.4);

      for (const shot of items) {
        const blockHeight = Math.max(
          MIN_SHOT_BLOCK_HEIGHT,
          estimateShotBlockHeight(doc, pageWidth, shot)
        );
        ensureVerticalSpace(doc, blockHeight);

        const status = shot.captured ? "CAPTURED" : "NEEDED";
        const statusColor = shot.captured ? "#1a7a3c" : "#a0410d";

        doc.font("Helvetica-Bold").fontSize(11).fillColor("#000000").text(`${shot.name}  `, {
          width: pageWidth,
          continued: true,
        });
        doc.font("Helvetica-Bold").fontSize(8).fillColor(statusColor).text(status, {
          width: pageWidth,
        });
        doc.fillColor("#000000");

        writeWrapped(doc, shot.shot_type.toUpperCase(), pageWidth, {
          size: DETAIL_FONT_SIZE,
          color: "#777777",
        });

        if (shot.purpose) {
          writeWrapped(doc, `What it must show: ${shot.purpose}`, pageWidth, { color: "#222222" });
        }
        if (shot.pass_spec) {
          writeWrapped(doc, `Pass: ${shot.pass_spec}`, pageWidth, {
            size: DETAIL_FONT_SIZE,
            color: "#444444",
          });
        }
        if (shot.tips) {
          writeWrapped(doc, `Tip: ${shot.tips}`, pageWidth, {
            size: DETAIL_FONT_SIZE,
            color: "#666666",
          });
        }
        doc.fillColor("#000000");
        doc.moveDown(0.7);
      }
      doc.moveDown(0.3);
    }

    renderGroup("Required shots", required);
    renderGroup("Recommended shots", recommended);

    doc.end();
  });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireEtsyAccessToken(await cookies());

    const id = parsePositiveInt((await context.params).id);
    if (!id) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid inventory id",
        userMessage: "The inventory id must be a positive integer.",
        actions: ["Check the item and retry."],
        canRetry: false,
      });
    }

    const item = getInventoryById(id);
    if (!item) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Inventory item not found",
        userMessage: "The requested inventory item was not found.",
        actions: ["Refresh inventory and select another item."],
        canRetry: false,
      });
    }

    const shotList = getSavedShotList(item);
    if (!shotList || shotList.length === 0) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "No shot list available",
        userMessage: "No shot list has been generated for this item. Generate one first.",
        actions: ["Open the item and click 'Generate shot list', then try again."],
        canRetry: false,
      });
    }

    const row = item as unknown as Record<string, unknown>;
    const itemNumber = String(row.item_number ?? `item-${id}`);
    const description = String(row.description ?? "").slice(0, 120);
    const safeName = itemNumber.replace(/[^A-Za-z0-9_-]/g, "-");

    const pdfBuffer = await buildShotListPdf(itemNumber, description, shotList);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="shot-list-${safeName}.pdf"`,
      },
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to build shot-list PDF",
        userMessage: "We could not generate the shot list PDF.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
