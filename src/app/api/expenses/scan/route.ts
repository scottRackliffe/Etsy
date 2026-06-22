import { NextResponse } from "next/server";
import OpenAI from "openai";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { getAiConfig } from "@/lib/ai-config";
import { logApiCall } from "@/lib/api-usage";
import { logActivity } from "@/lib/activity-log";

const SYSTEM_PROMPT = `You are an OCR assistant for business expense invoices and receipts. You will receive a photo of an invoice, bill, subscription confirmation, or expense receipt.

Extract the following information and return ONLY valid JSON:

{
  "vendor_name": "Business or service provider name",
  "expense_date": "YYYY-MM-DD — the invoice/bill date, or null if not readable",
  "amount": 0.00,
  "category": "Best-fit category from: Inventory / COGS, Shipping & Postage, Packaging Materials, Platform Fees, Payment Processing Fees, Advertising & Marketing, Photography / Equipment, Software & Subscriptions, Office Supplies, Professional Services, Rent / Home Office, Utilities, Internet, Phone, Insurance, Education & Training, Travel & Lodging, Meals & Entertainment, Vehicle / Mileage, Equipment Repairs, Licenses & Permits, Miscellaneous",
  "subcategory": "More specific description or null",
  "invoice_number": "Invoice/reference number or null",
  "payment_method": "Credit Card, PayPal, Bank Transfer, Cash, Check, or null",
  "tax_deductible": true,
  "is_recurring": false,
  "recurring_frequency": "monthly, quarterly, annual, or null",
  "notes": "Any other relevant info or null"
}

Rules:
- amount should be a number (no dollar sign). Use the total amount due.
- For vendor_name, use the company name from the invoice header.
- For expense_date, parse any date format into YYYY-MM-DD. Use null if not found.
- For category, pick the BEST match from the list above.
- If the image is not an invoice or expense receipt, return: { "error": "This does not appear to be an invoice or expense receipt." }
- Never guess or fabricate data. Use null for anything you cannot read clearly.
- If this looks like a subscription or recurring charge, set is_recurring to true and recurring_frequency appropriately.`;

const IMAGE_MIMES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif",
};

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("invoice_photo");

    if (!file || !(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "invoice_photo is required", userMessage: "Please upload an invoice or receipt photo.", actions: [] } },
        { status: 400 }
      );
    }

    const config = getAiConfig();
    if (!config) {
      return NextResponse.json(
        { ok: false, error: { code: "AI_NOT_CONFIGURED", message: "AI not configured", userMessage: "AI needs to be configured in Settings before scanning invoices.", actions: ["Go to Settings and set up AI."] } },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name?.split(".").pop()?.toLowerCase() ?? "jpg";
    const mime = IMAGE_MIMES[ext] ?? "image/jpeg";
    const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;

    const openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl ?? undefined,
      timeout: Math.max(config.timeoutMs, 30000),
    });

    const response = await openai.responses.create({
      model: config.model,
      max_output_tokens: 4000,
      temperature: 0.1,
      input: [
        { role: "system", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
        {
          role: "user",
          content: [
            { type: "input_text", text: "Please read this invoice or expense receipt and extract all information." },
            { type: "input_image", image_url: dataUrl, detail: "high" as const },
          ],
        },
      ],
    });

    logApiCall("openai", "responses.create/expense-ocr", 200);

    const outputText = response.output_text?.trim();
    if (!outputText) {
      return NextResponse.json(
        { ok: false, error: { code: "OCR_FAILED", message: "AI returned empty output", userMessage: "Could not read the invoice. Try a clearer photo.", actions: ["Take a clearer photo and try again."] } },
        { status: 422 }
      );
    }

    const cleaned = outputText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned);

    if (parsed.error) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_AN_INVOICE", message: parsed.error, userMessage: parsed.error, actions: ["Upload a photo of an invoice or receipt."] } },
        { status: 422 }
      );
    }

    logActivity({ action: "expense.scanned", entityType: "expense" });
    return NextResponse.json({
      ok: true,
      ocr: {
        vendor_name: parsed.vendor_name ?? "",
        expense_date: parsed.expense_date ?? null,
        amount: typeof parsed.amount === "number" ? parsed.amount : null,
        category: parsed.category ?? null,
        subcategory: parsed.subcategory ?? null,
        invoice_number: parsed.invoice_number ?? null,
        payment_method: parsed.payment_method ?? null,
        tax_deductible: parsed.tax_deductible !== false,
        is_recurring: parsed.is_recurring === true,
        recurring_frequency: parsed.recurring_frequency ?? null,
        notes: parsed.notes ?? null,
      },
    });
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      logApiCall("openai", "responses.create/expense-ocr", error.status ?? 500);
    }
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to OCR invoice",
        userMessage: "Could not read the invoice. Try a clearer photo.",
        actions: ["Take a clearer photo and try again."],
        canRetry: true,
      })
    );
  }
}
