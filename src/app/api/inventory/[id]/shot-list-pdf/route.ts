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
    doc.fontSize(16).font("Helvetica-Bold").text("Photo Shot List", { align: "left" });
    doc.moveDown(0.3);
    doc.fontSize(11).font("Helvetica-Bold").text(itemNumber, { align: "left" });
    if (description) {
      doc.fontSize(10).font("Helvetica").fillColor("#444444").text(description, { align: "left" });
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

      doc.fontSize(9).font("Helvetica-Bold").fillColor("#666666")
        .text(title.toUpperCase(), { characterSpacing: 0.5 });
      doc.fillColor("#000000");
      doc.moveDown(0.4);

      for (const shot of items) {
        // Check remaining page space; add page if < 80pt left
        if (doc.page.height - doc.page.margins.bottom - doc.y < 80) {
          doc.addPage();
        }

        const status = shot.captured ? "CAPTURED" : "NEEDED";
        const statusColor = shot.captured ? "#1a7a3c" : "#a0410d";
        const labelText = `${shot.name}  `;

        // Shot name + status on same line
        doc.font("Helvetica-Bold").fontSize(11).fillColor("#000000").text(labelText, {
          continued: true,
          lineBreak: false,
        });
        doc.font("Helvetica-Bold").fontSize(8).fillColor(statusColor).text(status, {
          continued: false,
        });
        doc.fillColor("#000000");

        // Shot type badge (small)
        doc.fontSize(8).font("Helvetica").fillColor("#777777")
          .text(shot.shot_type.toUpperCase(), { characterSpacing: 0.3 });
        doc.fillColor("#000000");

        if (shot.purpose) {
          doc.font("Helvetica").fontSize(9).fillColor("#222222")
            .text(`What it must show: ${shot.purpose}`);
        }
        if (shot.pass_spec) {
          doc.font("Helvetica").fontSize(8).fillColor("#444444")
            .text(`Pass: ${shot.pass_spec}`);
        }
        if (shot.tips) {
          doc.font("Helvetica").fontSize(8).fillColor("#666666")
            .text(`Tip: ${shot.tips}`);
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
