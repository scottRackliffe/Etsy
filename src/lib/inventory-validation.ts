const INVENTORY_STATUSES = new Set(["Draft", "In stock", "Listed", "Sold", "Reserved", "Retired"]);

const STATUS_ALIASES: Record<string, string> = {
  draft: "Draft",
  "in stock": "In stock",
  instock: "In stock",
  listed: "Listed",
  sold: "Sold",
  reserved: "Reserved",
  retired: "Retired",
  archived: "Retired",
};

export class InventoryValidationError extends Error {
  readonly fields: Record<string, string[]>;

  constructor(fields: Record<string, string[]>) {
    super("Inventory validation failed");
    this.name = "InventoryValidationError";
    this.fields = fields;
  }
}

export function prepareInventoryPayload(
  input: Record<string, unknown>,
  options: { forCreate?: boolean } = {}
): Record<string, unknown> {
  const payload = { ...input };
  const fields: Record<string, string[]> = {};

  if (payload.status !== undefined && payload.status !== null) {
    if (typeof payload.status !== "string") {
      fields.status = ["Must be a string"];
    } else {
      const key = payload.status.trim().toLowerCase();
      const normalized = STATUS_ALIASES[key] ?? payload.status.trim();
      if (!INVENTORY_STATUSES.has(normalized)) {
        fields.status = [`Must be one of: ${[...INVENTORY_STATUSES].join(", ")}`];
      } else {
        payload.status = normalized;
      }
    }
  } else if (options.forCreate) {
    payload.status = "Draft";
  }

  if (Object.keys(fields).length > 0) {
    throw new InventoryValidationError(fields);
  }

  return payload;
}

export const INVENTORY_EXCLUDED_STATUSES = ["Sold", "Retired"] as const;
