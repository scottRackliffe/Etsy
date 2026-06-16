import { NextResponse } from "next/server";
import OpenAI from "openai";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { getAiConfig } from "@/lib/ai-config";
import { logApiCall } from "@/lib/api-usage";

const SYSTEM_PROMPT = `You are an OCR assistant. You will receive a photo of a purchase receipt from a retail store, thrift shop, estate sale, or online order.

Extract the following information and return ONLY valid JSON:

{
  "vendor_name": "Store or seller name",
  "purchase_date": "YYYY-MM-DD or null if not readable",
  "reference_number": "Receipt/transaction number or null",
  "items": [
    { "description": "Item description as printed", "cost": 1.99 }
  ],
  "subtotal": null,
  "tax": null,
  "total": null,
  "notes": "Any other relevant info (payment method, return policy, etc.) or null"
}

Rules:
- Extract EVERY line item you can read, even if partially obscured.
- Cost should be a number (no dollar sign). Use null if unreadable.
- For vendor_name, use the store name at the top of the receipt.
- For purchase_date, parse any date format into YYYY-MM-DD. Use null if not found.
- For item descriptions, transcribe exactly what the receipt says — do not interpret or rename.
- If the image is not a receipt, return: { "error": "This does not appear to be a receipt." }
- Never guess or fabricate data. Use null for anything you cannot read clearly.`;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("receipt_photo");

    if (!file || !(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "receipt_photo is required", userMessage: "Please upload a receipt photo.", actions: [] } },
        { status: 400 }
      );
    }

    const config = getAiConfig();
    if (!config) {
      return NextResponse.json(
        { ok: false, error: { code: "AI_NOT_CONFIGURED", message: "AI not configured", userMessage: "AI needs to be configured in Config before scanning receipts.", actions: ["Go to Config and set up AI."] } },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name?.split(".").pop()?.toLowerCase() ?? "jpg";
    const mimeMap: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif" };
    const mime = mimeMap[ext] ?? "image/jpeg";
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
            { type: "input_text", text: "Please read this receipt and extract all information." },
            { type: "input_image", image_url: dataUrl, detail: "high" as const },
          ],
        },
      ],
    });

    logApiCall("openai", "responses.create/receipt-ocr", 200);

    const outputText = response.output_text?.trim();
    if (!outputText) {
      return NextResponse.json(
        { ok: false, error: { code: "OCR_FAILED", message: "AI returned empty output", userMessage: "Could not read the receipt. Try a clearer photo.", actions: ["Take a clearer photo and try again."] } },
        { status: 422 }
      );
    }

    const cleaned = outputText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned);

    if (parsed.error) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_A_RECEIPT", message: parsed.error, userMessage: parsed.error, actions: ["Upload a photo of a receipt."] } },
        { status: 422 }
      );
    }

    return NextResponse.json({
      ok: true,
      ocr: {
        vendor_name: parsed.vendor_name ?? "",
        purchase_date: parsed.purchase_date ?? null,
        reference_number: parsed.reference_number ?? null,
        items: Array.isArray(parsed.items) ? parsed.items : [],
        subtotal: parsed.subtotal ?? null,
        tax: parsed.tax ?? null,
        total: parsed.total ?? null,
        notes: parsed.notes ?? null,
      },
    });
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      logApiCall("openai", "responses.create/receipt-ocr", error.status ?? 500);
    }
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to OCR receipt",
        userMessage: "Could not read the receipt. Try a clearer photo.",
        actions: ["Take a clearer photo and try again."],
        canRetry: true,
      })
    );
  }
}
