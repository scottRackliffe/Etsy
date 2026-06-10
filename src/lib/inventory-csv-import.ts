import { InventoryValidationError, prepareInventoryPayload } from "@/lib/inventory-validation";
import { createInventory } from "@/lib/records";
import { getDb } from "@/lib/sqlite";
import { logActivity } from "@/lib/activity-log";
import { logger } from "@/lib/logging";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const PREVIEW_ROW_LIMIT = 10;

const SUPPORTED_COLUMNS = new Set([
  "item_number",
  "description",
  "purchase_cost",
  "shipping_cost",
  "sale_revenue",
  "date_purchased",
  "date_listed",
  "status",
  "condition_code",
  "category_tags",
  "notes",
]);

const CONDITION_CODES = new Set(["Mint/Near Mint", "Excellent", "Very Good", "Good", "Fair/As-Is"]);

export type CsvRowError = { field: string; message: string };

export type CsvPreviewRow = {
  row: number;
  valid: boolean;
  data: Record<string, unknown>;
  errors: CsvRowError[];
};

export type CsvPreviewResult = {
  columns: string[];
  rows: CsvPreviewRow[];
  total_rows: number;
  valid_count: number;
  error_count: number;
};

export type CsvImportResult = {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; field: string; message: string }>;
};

function normalizeColumnName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "_");
}

export function parseCsvRows(text: string): string[][] {
  let input = text;
  if (input.charCodeAt(0) === 0xfeff) input = input.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const c = input[i];
    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      continue;
    } else if (c === "\n") {
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  }

  return rows;
}

function loadExistingItemNumbers(): Set<string> {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT item_number FROM inventory WHERE item_number IS NOT NULL AND item_number != ''"
    )
    .all() as Array<{ item_number: string }>;
  return new Set(rows.map((r) => r.item_number.trim().toLowerCase()));
}

function parseDecimal(value: string, field: string, errors: CsvRowError[]): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0) {
    errors.push({ field, message: `${field} must be a non-negative number` });
    return undefined;
  }
  return num;
}

function parseDate(value: string, field: string, errors: CsvRowError[]): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    errors.push({ field, message: `${field} must be YYYY-MM-DD` });
    return undefined;
  }
  return trimmed;
}

function rowToPayload(cells: string[], columnIndex: Map<string, number>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [col, idx] of columnIndex.entries()) {
    if (idx >= cells.length) continue;
    const value = cells[idx]?.trim() ?? "";
    if (value) out[col] = value;
  }
  return out;
}

function validateRow(
  rowNumber: number,
  raw: Record<string, string>,
  seenInFile: Set<string>,
  existingNumbers: Set<string>
): CsvPreviewRow {
  const errors: CsvRowError[] = [];
  const data: Record<string, unknown> = {};

  const itemNumber = raw.item_number?.trim() ?? "";
  if (!itemNumber) {
    errors.push({ field: "item_number", message: "Item number is required" });
  } else {
    const key = itemNumber.toLowerCase();
    if (seenInFile.has(key)) {
      errors.push({ field: "item_number", message: "Duplicate item number within file" });
    } else if (existingNumbers.has(key)) {
      errors.push({ field: "item_number", message: "Item number already exists" });
    } else {
      data.item_number = itemNumber;
    }
  }

  const description = raw.description?.trim() ?? "";
  if (!description) {
    errors.push({ field: "description", message: "Description is required" });
  } else {
    data.description = description;
  }

  const purchaseCost = parseDecimal(raw.purchase_cost ?? "", "purchase_cost", errors);
  if (purchaseCost != null) data.purchase_cost = purchaseCost;
  const shippingCost = parseDecimal(raw.shipping_cost ?? "", "shipping_cost", errors);
  if (shippingCost != null) data.shipping_cost = shippingCost;
  const saleRevenue = parseDecimal(raw.sale_revenue ?? "", "sale_revenue", errors);
  if (saleRevenue != null) data.sale_revenue = saleRevenue;

  const datePurchased = parseDate(raw.date_purchased ?? "", "date_purchased", errors);
  if (datePurchased) data.date_purchased = datePurchased;
  const dateListed = parseDate(raw.date_listed ?? "", "date_listed", errors);
  if (dateListed) data.date_listed = dateListed;

  if (raw.status?.trim()) data.status = raw.status.trim();
  if (raw.condition_code?.trim()) {
    const code = raw.condition_code.trim();
    if (!CONDITION_CODES.has(code)) {
      errors.push({
        field: "condition_code",
        message: `Invalid condition code '${code}'`,
      });
    } else {
      data.condition_code = code;
    }
  }

  if (raw.category_tags?.trim()) data.category_tags = raw.category_tags.trim();
  if (raw.notes?.trim()) data.notes = raw.notes.trim();

  try {
    const prepared = prepareInventoryPayload(data, { forCreate: true });
    Object.assign(data, prepared);
  } catch (err) {
    if (err instanceof InventoryValidationError) {
      for (const [field, messages] of Object.entries(err.fields)) {
        for (const message of messages) errors.push({ field, message });
      }
    }
  }

  if (errors.length === 0 && typeof data.item_number === "string") {
    seenInFile.add(data.item_number.toLowerCase());
  }

  return { row: rowNumber, valid: errors.length === 0, data, errors };
}

function buildColumnIndex(headerRow: string[]): Map<string, number> {
  const index = new Map<string, number>();
  headerRow.forEach((cell, idx) => {
    const normalized = normalizeColumnName(cell);
    if (SUPPORTED_COLUMNS.has(normalized)) index.set(normalized, idx);
    else if (normalized) {
      logger.warn("inventory csv unknown column ignored", { column: cell });
    }
  });
  return index;
}

function parseInventoryCsvBuffer(buffer: Buffer): {
  columns: string[];
  previewRows: CsvPreviewRow[];
  total_rows: number;
  validCount: number;
  errorCount: number;
  parseError?: string;
} {
  if (buffer.byteLength > MAX_FILE_BYTES) {
    return {
      columns: [],
      previewRows: [],
      total_rows: 0,
      validCount: 0,
      errorCount: 0,
      parseError: "File exceeds 5 MB limit",
    };
  }

  const text = buffer.toString("utf8");
  const parsed = parseCsvRows(text);
  if (parsed.length === 0) {
    return {
      columns: [],
      previewRows: [],
      total_rows: 0,
      validCount: 0,
      errorCount: 0,
      parseError: "CSV file is empty or has no header row",
    };
  }

  const header = parsed[0] ?? [];
  const columnIndex = buildColumnIndex(header);
  if (!columnIndex.has("item_number")) {
    return {
      columns: [...columnIndex.keys()],
      previewRows: [],
      total_rows: 0,
      validCount: 0,
      errorCount: 0,
      parseError: "CSV must include an item_number column",
    };
  }

  if (!columnIndex.has("description")) {
    return {
      columns: [...columnIndex.keys()],
      previewRows: [],
      total_rows: 0,
      validCount: 0,
      errorCount: 0,
      parseError: "CSV must include a description column",
    };
  }

  const existingNumbers = loadExistingItemNumbers();
  const seenInFile = new Set<string>();
  const dataRows = parsed.slice(1);
  const previewRows: CsvPreviewRow[] = [];
  let validCount = 0;
  let errorCount = 0;

  dataRows.forEach((cells, idx) => {
    const rowNumber = idx + 1;
    const raw = rowToPayload(cells, columnIndex);
    const validated = validateRow(rowNumber, raw, seenInFile, existingNumbers);
    if (previewRows.length < PREVIEW_ROW_LIMIT) previewRows.push(validated);
    if (validated.valid) validCount += 1;
    else errorCount += 1;
  });

  return {
    columns: [...columnIndex.keys()],
    previewRows,
    total_rows: dataRows.length,
    validCount,
    errorCount,
  };
}

export function previewInventoryCsv(buffer: Buffer): CsvPreviewResult | { error: string } {
  const parsed = parseInventoryCsvBuffer(buffer);
  if (parsed.parseError) return { error: parsed.parseError };
  return {
    columns: parsed.columns,
    rows: parsed.previewRows,
    total_rows: parsed.total_rows,
    valid_count: parsed.validCount,
    error_count: parsed.errorCount,
  };
}

export function importInventoryCsv(
  buffer: Buffer,
  filename?: string
): CsvImportResult | { error: string } {
  const parsed = parseInventoryCsvBuffer(buffer);
  if (parsed.parseError) return { error: parsed.parseError };

  const errors: Array<{ row: number; field: string; message: string }> = [];
  let imported = 0;

  const existingNumbers = loadExistingItemNumbers();
  const seenInFile = new Set<string>();
  const text = buffer.toString("utf8");
  const rows = parseCsvRows(text).slice(1);
  const columnIndex = buildColumnIndex(parseCsvRows(text)[0] ?? []);

  rows.forEach((cells, idx) => {
    const rowNumber = idx + 1;
    const raw = rowToPayload(cells, columnIndex);
    const validated = validateRow(rowNumber, raw, seenInFile, existingNumbers);
    if (!validated.valid) {
      for (const err of validated.errors) {
        errors.push({ row: rowNumber, field: err.field, message: err.message });
      }
      return;
    }
    try {
      createInventory(validated.data);
      imported += 1;
      if (typeof validated.data.item_number === "string") {
        existingNumbers.add(validated.data.item_number.toLowerCase());
      }
    } catch (err) {
      errors.push({
        row: rowNumber,
        field: "item_number",
        message: err instanceof Error ? err.message : "Could not create item",
      });
    }
  });

  if (imported > 0) {
    logActivity({
      action: "inventory.bulk_imported",
      entityType: "inventory",
      entityLabel: filename ?? "inventory.csv",
      detail: { count: imported, skipped: errors.length, filename: filename ?? "inventory.csv" },
      source: "user",
    });
  }

  return { imported, skipped: errors.length, errors };
}

export { MAX_FILE_BYTES };
