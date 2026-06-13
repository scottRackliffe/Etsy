import crypto from "node:crypto";
import { getDb } from "@/lib/sqlite";
import type { InventoryRecord } from "@/lib/inventory";
import { getAllPictureReferences } from "@/lib/inventory";

export const LISTING_HANDOFF_SCHEMA_VERSION = "2026-02-16.v1";

export type ListingExportPackage = {
  schema_version: string;
  export_id: string;
  item_id: number;
  item_number: string | null;
  item_context: {
    description: string | null;
    condition_code: string | null;
    condition_notes: string | null;
    category_tags: string | null;
    sale_revenue: number | null;
  };
  picture_references: string[];
  required_output_schema: {
    listing_title: "string";
    listing_description: "string";
    listing_tags: "string|array";
    listing_category_path: "string|optional";
  };
  quality_instructions: string[];
  manifest_sha256: string;
};

function normalizeOutput(payload: {
  listing_title: unknown;
  listing_description: unknown;
  listing_tags: unknown;
  listing_category_path?: unknown;
}) {
  const title = typeof payload.listing_title === "string" ? payload.listing_title.trim() : "";
  const description =
    typeof payload.listing_description === "string" ? payload.listing_description.trim() : "";

  const tagsArray = Array.isArray(payload.listing_tags)
    ? payload.listing_tags.map((t) => String(t))
    : typeof payload.listing_tags === "string"
      ? payload.listing_tags.split(/[,\n]/g)
      : [];
  const tags = tagsArray
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .filter((tag, idx, all) => all.findIndex((a) => a.toLowerCase() === tag.toLowerCase()) === idx)
    .slice(0, 13)
    .join(", ");

  const categoryPath =
    typeof payload.listing_category_path === "string" &&
    payload.listing_category_path.trim().length > 0
      ? payload.listing_category_path.trim()
      : null;

  return { title, description, tags, categoryPath };
}

export function buildListingExportPackage(item: InventoryRecord): ListingExportPackage {
  const exportId = crypto.randomUUID();
  const pictureRefs = getAllPictureReferences(item);
  const packageWithoutHash = {
    schema_version: LISTING_HANDOFF_SCHEMA_VERSION,
    export_id: exportId,
    item_id: item.id,
    item_number: item.item_number,
    item_context: {
      description: item.description,
      condition_code: item.condition_code,
      condition_notes: item.condition_notes,
      category_tags: item.category_tags,
      sale_revenue: item.sale_revenue,
    },
    picture_references: pictureRefs,
    required_output_schema: {
      listing_title: "string",
      listing_description: "string",
      listing_tags: "string|array",
      listing_category_path: "string|optional",
    } as const,
    quality_instructions: [
      "Write a truthful, high-conversion Etsy listing with no misleading claims.",
      "Use clear searchable title terms and concise benefit-focused wording.",
      "Be explicit about condition details and defects when present.",
      "Return only fields required by required_output_schema.",
    ],
  };
  const manifestSha = crypto
    .createHash("sha256")
    .update(JSON.stringify(packageWithoutHash))
    .digest("hex");

  const pkg: ListingExportPackage = {
    ...packageWithoutHash,
    manifest_sha256: manifestSha,
  };
  getDb()
    .prepare(
      `
      INSERT INTO listing_exports(export_id, inventory_id, payload_json, created_at)
      VALUES(@export_id, @inventory_id, @payload_json, @created_at)
    `
    )
    .run({
      export_id: pkg.export_id,
      inventory_id: item.id,
      payload_json: JSON.stringify(pkg),
      created_at: new Date().toISOString(),
    });
  return pkg;
}

export function validateAndNormalizeListingImport(
  itemId: number,
  payload: unknown
): {
  exportId: string | null;
  sourceLabel: string;
  listingTitle: string;
  listingDescription: string;
  listingTags: string;
  listingCategoryPath: string | null;
} {
  const data = (payload ?? {}) as Record<string, unknown>;
  const schemaVersion = typeof data.schema_version === "string" ? data.schema_version : "";
  const importItemId = data.item_id != null ? Number(data.item_id) : null;
  if (schemaVersion && schemaVersion !== LISTING_HANDOFF_SCHEMA_VERSION) {
    throw new Error("Import schema_version does not match supported version");
  }
  if (importItemId != null && importItemId !== itemId) {
    throw new Error("Import item_id does not match selected inventory item");
  }

  const normalized = normalizeOutput({
    listing_title: data.listing_title,
    listing_description: data.listing_description,
    listing_tags: data.listing_tags,
    listing_category_path: data.listing_category_path,
  });
  if (!normalized.title) {
    throw new Error("Import payload missing listing_title");
  }
  if (!normalized.description) {
    throw new Error("Import payload missing listing_description");
  }
  if (!normalized.tags) {
    throw new Error("Import payload missing listing_tags");
  }

  return {
    exportId:
      typeof data.export_id === "string" && data.export_id.trim().length > 0
        ? data.export_id
        : null,
    sourceLabel:
      typeof data.source_label === "string" && data.source_label.trim().length > 0
        ? data.source_label.trim()
        : "portable-import",
    listingTitle: normalized.title,
    listingDescription: normalized.description,
    listingTags: normalized.tags,
    listingCategoryPath: normalized.categoryPath,
  };
}

export function recordListingImport(params: {
  inventoryId: number;
  exportId: string | null;
  payload: unknown;
  sourceLabel: string;
}) {
  getDb()
    .prepare(
      `
      INSERT INTO listing_imports(inventory_id, export_id, payload_json, source_label, created_at)
      VALUES(@inventory_id, @export_id, @payload_json, @source_label, @created_at)
    `
    )
    .run({
      inventory_id: params.inventoryId,
      export_id: params.exportId,
      payload_json: JSON.stringify(params.payload),
      source_label: params.sourceLabel,
      created_at: new Date().toISOString(),
    });
}
