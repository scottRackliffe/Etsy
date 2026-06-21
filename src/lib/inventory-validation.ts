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

  if (payload.has_condition_issue !== undefined) {
    const flagged = payload.has_condition_issue === true || payload.has_condition_issue === 1;
    if (flagged) {
      const notes = typeof payload.condition_notes === "string" ? payload.condition_notes.trim() : "";
      if (!notes) {
        fields.condition_notes = ["Condition notes are required when a condition issue is flagged."];
      }
    }
  }

  if (Object.keys(fields).length > 0) {
    throw new InventoryValidationError(fields);
  }

  return payload;
}

export const INVENTORY_EXCLUDED_STATUSES = ["Sold", "Retired"] as const;

const VALID_WHEN_MADE = new Set([
  "made_to_order", "2020_2026", "2010_2019", "2004_2009", "2000_2003",
  "1990s", "1980s", "1970s", "1960s", "1950s", "1940s", "1930s",
  "1920s", "1910s", "1900s", "1800s", "1700s", "before_1700",
]);

const VALID_WEIGHT_UNITS = new Set(["oz", "lb", "g", "kg"]);
const VALID_DIMENSION_UNITS = new Set(["in", "ft", "mm", "cm", "m"]);

type InventoryLike = {
  etsy_when_made?: string | null;
  etsy_taxonomy_id?: number | null;
  etsy_return_policy_id?: number | null;
  etsy_shipping_profile_id?: number | null;
  materials?: string | null;
  item_weight?: number | null;
  item_weight_unit?: string | null;
  item_length?: number | null;
  item_width?: number | null;
  item_height?: number | null;
  item_dimensions_unit?: string | null;
};

export function validatePublishReadiness(
  item: InventoryLike,
  settings: Record<string, string>
): { ready: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!item.etsy_when_made) {
    errors.push("Era (when made) is required before publishing to Etsy.");
  } else if (!VALID_WHEN_MADE.has(item.etsy_when_made)) {
    errors.push(`"${item.etsy_when_made}" is not a valid era value.`);
  }

  if (item.etsy_taxonomy_id == null) {
    errors.push("Category ID (taxonomy) is required before publishing to Etsy.");
  } else if (!Number.isInteger(item.etsy_taxonomy_id) || item.etsy_taxonomy_id <= 0) {
    errors.push("Category ID must be a positive integer.");
  }

  const returnPolicyId = item.etsy_return_policy_id ?? (Number(settings["etsy.publish.return_policy_id"]) || null);
  if (returnPolicyId == null) {
    errors.push("A return policy is required. Set one on this item or configure a default in Settings → Etsy Publish Defaults.");
  }

  const shippingProfileId = item.etsy_shipping_profile_id ?? (Number(settings["etsy.publish.shipping_profile_id"]) || null);
  if (shippingProfileId == null) {
    warnings.push("No shipping profile set. A default or per-item shipping profile is recommended.");
  }

  if (item.materials != null && typeof item.materials === "string" && item.materials.trim()) {
    try {
      const parsed: unknown = JSON.parse(item.materials);
      if (!Array.isArray(parsed)) {
        errors.push("Materials must be a JSON array of strings.");
      } else {
        for (let i = 0; i < parsed.length; i++) {
          if (typeof parsed[i] !== "string") {
            errors.push(`Materials[${i}] must be a string.`);
          } else if ((parsed[i] as string).length > 45) {
            errors.push(`Materials[${i}] exceeds 45 characters ("${(parsed[i] as string).slice(0, 20)}…").`);
          }
        }
      }
    } catch {
      errors.push("Materials is not valid JSON. Expected an array like [\"ceramic\",\"glaze\"].");
    }
  }

  if (item.item_weight != null) {
    if (typeof item.item_weight !== "number" || item.item_weight <= 0) {
      errors.push("Item weight must be a positive number.");
    }
    if (!item.item_weight_unit || !VALID_WEIGHT_UNITS.has(item.item_weight_unit)) {
      errors.push(`Weight unit is required when weight is set. Must be one of: ${[...VALID_WEIGHT_UNITS].join(", ")}.`);
    }
  }

  const hasDimension = item.item_length != null || item.item_width != null || item.item_height != null;
  if (hasDimension) {
    if (!item.item_dimensions_unit || !VALID_DIMENSION_UNITS.has(item.item_dimensions_unit)) {
      errors.push(`Dimensions unit is required when any dimension is set. Must be one of: ${[...VALID_DIMENSION_UNITS].join(", ")}.`);
    }
    for (const [field, label] of [
      ["item_length", "Length"], ["item_width", "Width"], ["item_height", "Height"],
    ] as const) {
      const val = item[field];
      if (val != null && (typeof val !== "number" || val <= 0)) {
        errors.push(`${label} must be a positive number.`);
      }
    }
  }

  return { ready: errors.length === 0, errors, warnings };
}
