/**
 * Listing lifecycle & phases (ADR-081 / WS-G1).
 *
 * `listing_phase` is a derived-but-stored dimension and the single listing
 * dimension (ADR-085), separate from `inventory.status`. It drives one
 * context-aware action button and the data/quality remediation flow. It is
 * recomputed on every relevant mutation (save, picture change, generate,
 * quality eval).
 */
import { createHash } from "node:crypto";
import { getDb } from "@/lib/sqlite";
import {
  getAllPictureReferences,
  getInventoryById,
  validateItemForListingRequest,
  type InventoryRecord,
} from "@/lib/inventory";

export type ListingPhase =
  | "needs_data"
  | "ready_to_generate"
  | "generated"
  | "needs_quality_remediation"
  | "listing_ready";

export const LISTING_PHASES: ReadonlyArray<ListingPhase> = [
  "needs_data",
  "ready_to_generate",
  "generated",
  "needs_quality_remediation",
  "listing_ready",
];

export type ListingButtonAction = "evaluate_data" | "generate" | "evaluate_quality";

export type ListingButton = { label: string; action: ListingButtonAction };

/**
 * Fields whose change should invalidate a generated listing (ADR-081 §5).
 * `sale_revenue` is excluded: price is an AI output, not a generation input (ADR-085 §2).
 */
const HASH_FIELDS: ReadonlyArray<string> = [
  "description",
  "condition_code",
  "condition_notes",
  "materials",
  "item_length",
  "item_width",
  "item_height",
  "item_dimensions_unit",
  "category_tags",
  "store_category",
  "etsy_when_made",
  "etsy_who_made",
  "etsy_taxonomy_id",
];

function nonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Stable hash of the listing-contributing inputs + ordered picture paths.
 * Used to detect whether a generated listing still reflects the item.
 */
export function computeListingSourceHash(item: InventoryRecord): string {
  const row = item as unknown as Record<string, unknown>;
  const fieldPart = HASH_FIELDS.map((key) => {
    const value = row[key];
    return `${key}=${value == null ? "" : String(value).trim()}`;
  });
  const picturePart = getAllPictureReferences(item);
  const payload = JSON.stringify({ fields: fieldPart, pictures: picturePart });
  return createHash("sha256").update(payload).digest("hex");
}

function hasGeneratedListing(item: InventoryRecord): boolean {
  return (
    nonEmpty(item.listing_title) &&
    nonEmpty(item.listing_description) &&
    nonEmpty(item.listing_tags)
  );
}

/** True when the live inputs no longer match the hash stored at generation. */
export function hasListingDrift(item: InventoryRecord): boolean {
  if (!item.listing_source_hash) return true;
  return item.listing_source_hash !== computeListingSourceHash(item);
}

/**
 * Pure phase computation from a row (ADR-081 §1/§5). Preserves an existing
 * quality verdict (needs_quality_remediation / listing_ready) only while the
 * listing is current (no drift); any drift returns to ready_to_generate.
 */
export function computeListingPhase(item: InventoryRecord): ListingPhase {
  if (!validateItemForListingRequest(item).ok) return "needs_data";
  if (!hasGeneratedListing(item)) return "ready_to_generate";
  if (hasListingDrift(item)) return "ready_to_generate";
  if (
    item.listing_phase === "needs_quality_remediation" ||
    item.listing_phase === "listing_ready"
  ) {
    return item.listing_phase;
  }
  return "generated";
}

/** Map the phase to the single context-aware button (ADR-081 §3). */
export function buttonForPhase(phase: ListingPhase): ListingButton {
  switch (phase) {
    case "needs_data":
      return { label: "Evaluate Data", action: "evaluate_data" };
    case "ready_to_generate":
      return { label: "Generate Listing", action: "generate" };
    case "needs_quality_remediation":
    case "generated":
    case "listing_ready":
    default:
      return { label: "Evaluate Listing Quality", action: "evaluate_quality" };
  }
}

/** Recompute and persist `listing_phase` for an item. Safe no-op if missing. */
export function recomputeAndStoreListingPhase(id: number): ListingPhase | null {
  const item = getInventoryById(id);
  if (!item) return null;
  const phase = computeListingPhase(item);
  if (phase !== item.listing_phase) {
    getDb().prepare("UPDATE inventory SET listing_phase = ? WHERE id = ?").run(phase, id);
  }
  return phase;
}

/**
 * Record a successful generation: store the timestamp + source hash and move
 * the item to the `generated` phase (ADR-081 §3/§5). Called after listing
 * content is written.
 */
export function markListingGenerated(id: number): ListingPhase | null {
  const item = getInventoryById(id);
  if (!item) return null;
  const hash = computeListingSourceHash(item);
  getDb()
    .prepare(
      "UPDATE inventory SET listing_generated_at = ?, listing_source_hash = ?, listing_phase = ? WHERE id = ?"
    )
    .run(new Date().toISOString(), hash, "generated", id);
  return "generated";
}

/**
 * Set the phase after a quality evaluation (ADR-081 §4). The caller must have
 * confirmed there is no drift before calling.
 */
export function setQualityPhase(id: number, passed: boolean): ListingPhase {
  const phase: ListingPhase = passed ? "listing_ready" : "needs_quality_remediation";
  getDb().prepare("UPDATE inventory SET listing_phase = ? WHERE id = ?").run(phase, id);
  return phase;
}
