/**
 * Listing remediation engine (ADR-081 lifecycle, ADR-082 rubric, ADR-085).
 *
 * A "repair pass" scores the listing with the deterministic ADR-082 rubric,
 * then fixes every NON-PICTURE shortcoming it can:
 *   • listing text (title/description/tags) + price via a single global AI refine
 *   • structured attributes (era, category/taxonomy, materials, dimensions,
 *     who-made) via deterministic defaults + one focused AI attribute call
 * and re-scores. Because attribute fields are ADR-081 hash inputs, the pass
 * re-baselines `listing_source_hash` after applying them so the item does NOT
 * fall back to `ready_to_generate` (no drift bounce).
 *
 * `runRemediation` supports a single pass or an auto-loop ("repair until done"):
 * it keeps running passes until the gate passes, only picture/user items remain,
 * or a pass stops improving (capped at MAX_AUTO_PASSES).
 *
 * The photo AI sub-score (§8b) is computed ONCE per run and reused across passes
 * (photos don't change during a text/attribute repair), so the cycle score is
 * consistent with the Evaluate Quality button — never the depressed provisional.
 */
import { getDb } from "@/lib/sqlite";
import { getAiConfig } from "@/lib/ai-config";
import { getMinQualityScore, getSetting } from "@/lib/settings-store";
import { getInventoryById, type InventoryRecord } from "@/lib/inventory";
import {
  computeListingPhase,
  computeListingSourceHash,
  setQualityPhase,
} from "@/lib/listing-phase";
import {
  evaluateListingQuality,
  PHOTO_AI_PENDING_REF,
  type PhotoQualitySubresult,
  type QualityRemediationItem,
} from "@/lib/listing-rubric";
import { evaluatePhotoQuality } from "@/lib/listing-photo-vision";
import {
  refineListing,
  suggestListingAttributes,
  type AttributeSuggestion,
  type CoachPhotoFile,
} from "@/lib/listing-ai";
import { loadPhotosFromPaths } from "@/lib/listing-ai-multipart";
import { getTaxonomyNode, searchTaxonomyNodes } from "@/lib/etsy-taxonomy";
import { logActivity } from "@/lib/activity-log";
import { ApiRouteError } from "@/lib/api-error";

const MAX_AUTO_PASSES = 5;

/** Refs the AI can fix by rewriting listing text / price (one global refine). */
const AI_TEXT_REFS = new Set([
  "listing_title",
  "listing_description",
  "listing_tags",
  "sale_revenue",
]);

/** Refs the repair can fix by setting structured attributes (hash inputs). */
const ATTRIBUTE_REFS = new Set([
  "etsy_who_made",
  "etsy_when_made",
  "etsy_taxonomy_id",
  "materials",
  "dimensions",
  "shipping",
]);

/** Refine output field → inventory column (listing OUTPUT fields + price only). */
const TEXT_APPLY_COLUMN_MAP: Record<string, string> = {
  listing_title: "listing_title",
  listing_description: "listing_description",
  listing_tags: "listing_tags",
  listing_category_path: "listing_category_path",
  listing_title_strategy: "listing_title_strategy",
  listing_product_story: "listing_product_story",
  listing_condition_clarity: "listing_condition_clarity",
  listing_attributes: "listing_attributes",
  listing_pricing_shipping_notes: "listing_pricing_shipping_notes",
  listing_quality_checklist: "listing_quality_checklist",
  sale_price: "sale_revenue",
};

/** True for photo/picture remediation refs — never auto-fixable (excluded). */
export function isPictureRef(ref: string): boolean {
  return (
    ref === PHOTO_AI_PENDING_REF ||
    ref === "pictures" ||
    ref === "condition_pictures" ||
    /^picture_\d+$/.test(ref)
  );
}

/** True when the repair can fix this ref (text or attribute). */
export function isRepairableRef(ref: string): boolean {
  return AI_TEXT_REFS.has(ref) || ATTRIBUTE_REFS.has(ref);
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function materialsPresent(v: unknown): boolean {
  const m = str(v).toLowerCase();
  return m.length > 0 && m !== "other" && m !== "[]";
}

/**
 * Deterministically guarantee the rubric's "no repeated words" tag rule: drop
 * any word (≥3 chars) that already appeared in an earlier tag, keeping tag count
 * as high as possible (usually preserving all 13). Used as a safety net when the
 * AI cannot produce fully word-disjoint tags. Returns "" if input has no tags.
 */
export function dedupeTagWords(tagsStr: string): string {
  const used = new Set<string>();
  const out: string[] = [];
  for (const raw of tagsStr.split(",").map((t) => t.trim()).filter(Boolean)) {
    const kept: string[] = [];
    for (const w of raw.split(/\s+/)) {
      const k = w.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (k.length >= 3) {
        if (used.has(k)) continue; // drop the repeated word
        used.add(k);
      }
      kept.push(w);
    }
    let tag = kept.join(" ").trim();
    if (tag.length > 20) tag = tag.slice(0, 20).trim();
    if (tag) out.push(tag);
  }
  const seen = new Set<string>();
  return out
    .filter((t) => {
      const l = t.toLowerCase();
      if (seen.has(l)) return false;
      seen.add(l);
      return true;
    })
    .slice(0, 13)
    .join(", ");
}

// ---------------------------------------------------------------------------
// Public result shapes
// ---------------------------------------------------------------------------

export type RepairPassResult = {
  no_ai_action: boolean;
  previous_score: number;
  new_score: number;
  delta: number;
  passed: boolean;
  listing_phase: string;
  applied_fields: string[];
  remediation: QualityRemediationItem[];
  /** Non-picture, repairable items still open after this pass. */
  ai_fixable_remaining: QualityRemediationItem[];
  /** Picture/photo items (user must reshoot). */
  picture_items: QualityRemediationItem[];
  /** Non-picture, non-repairable items (e.g. condition notes — user decides). */
  user_items: QualityRemediationItem[];
  progressed: boolean;
};

export type RemediationRunResult = {
  ok: true;
  mode: "single" | "auto";
  tier: "standard" | "premium";
  model_used: string | null;
  premium_configured: boolean;
  photo_ai_evaluated: boolean;
  passes: RepairPassResult[];
  // Convenience fields mirroring the final pass (back-compat with the panel).
  previous_score: number;
  new_score: number;
  delta: number;
  passed: boolean;
  listing_phase: string;
  no_ai_action: boolean;
  applied_fields: string[];
  remediation: QualityRemediationItem[];
  user_action_items: QualityRemediationItem[];
  picture_items: QualityRemediationItem[];
  message?: string;
};

type ScoreOpts = {
  minScore: number;
  itemId: number;
  photoQuality?: PhotoQualitySubresult;
  defaultWhoMade?: string | null;
  defaultWhenMade?: string | null;
};

type AttrNeeds = {
  needWhoMade: boolean;
  needWhenMade: boolean;
  needTaxonomy: boolean;
  needMaterials: boolean;
  needDimensions: boolean;
  anyAi: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectMainPhotoPaths(item: InventoryRecord): string[] {
  const row = item as unknown as Record<string, unknown>;
  const paths: string[] = [];
  for (let slot = 1; slot <= 20; slot += 1) {
    const ref = row[`picture_${slot}`];
    if (typeof ref === "string" && ref.trim()) paths.push(ref.trim());
  }
  return paths;
}

function deriveAttrNeeds(remediation: QualityRemediationItem[]): AttrNeeds {
  const refs = new Set(remediation.filter((r) => r.ref !== PHOTO_AI_PENDING_REF).map((r) => r.ref));
  const needWhenMade = refs.has("etsy_when_made");
  const needTaxonomy = refs.has("etsy_taxonomy_id");
  const needMaterials = refs.has("materials");
  const needDimensions = refs.has("dimensions") || refs.has("shipping");
  return {
    needWhoMade: refs.has("etsy_who_made"),
    needWhenMade,
    needTaxonomy,
    needMaterials,
    needDimensions,
    anyAi: needWhenMade || needTaxonomy || needMaterials || needDimensions,
  };
}

function resolveTaxonomyId(attr: AttributeSuggestion): number | null {
  if (attr.taxonomy_id && getTaxonomyNode(attr.taxonomy_id)) {
    return attr.taxonomy_id;
  }
  const path = attr.taxonomy_path?.trim();
  if (!path) return null;
  const leaf = path.split(">").map((s) => s.trim()).filter(Boolean).pop() ?? path;
  const candidates = searchTaxonomyNodes(leaf);
  if (candidates.length === 0) return null;
  // Prefer a node whose full_path ends with the suggested leaf; else the deepest match.
  const exact = candidates.find(
    (c) => (c.full_path ?? c.name).toLowerCase().endsWith(leaf.toLowerCase())
  );
  if (exact) return exact.id;
  return candidates.sort((a, b) => (b.level ?? 0) - (a.level ?? 0))[0].id;
}

/**
 * Explicit, deterministically-verifiable requirements for the flaky rubric checks,
 * so a single global refine reliably converges (the rubric verifies these exactly).
 */
function hardRequirementsFor(item: QualityRemediationItem): string[] {
  const reqs: string[] = [];
  const s = item.shortcoming.toLowerCase();
  if (item.ref === "listing_description") {
    if (/shipping|section/.test(s)) {
      reqs.push(
        "The description MUST include at least one sentence about shipping and packaging (it must literally contain the word \"ship\" or \"packaging\")."
      );
      reqs.push(
        "It should also cover: an opening hook, measurements, materials, era/maker, and condition."
      );
    }
    if (/short/.test(s)) reqs.push("The description must be at least 250 words.");
    if (/one block|scannab/.test(s)) {
      reqs.push("Use short paragraphs or bullet points (include line breaks) for scannability.");
    }
  }
  if (item.ref === "listing_tags") {
    if (/repeat/.test(s)) {
      reqs.push(
        "Provide up to 13 comma-separated tags (each ≤20 characters). CRITICAL: no single word of 3+ letters may appear in more than one tag — if one tag is \"red taper decor\", then NO other tag may contain \"red\", \"taper\", or \"decor\" (including \"vintage\", \"candle\", \"decor\"). Use fully distinct vocabulary; prefer fewer tags over repeating any word."
      );
    }
    if (/single word/.test(s)) {
      reqs.push("Most tags must be 2-3 word long-tail phrases, not single words.");
    }
    if (/\/13|tags used/.test(s)) reqs.push("Provide the full 13 tags.");
  }
  if (item.ref === "listing_title") {
    if (/descriptor/.test(s)) {
      reqs.push(
        "The first ~70 characters of the title must include 2-3 objective descriptors (color, material, and era/age)."
      );
    }
    if (/noun/.test(s)) reqs.push("Start the title with the item type (a noun), not an article or adjective.");
    if (/concise|readable/.test(s)) {
      reqs.push("Keep the title ≤15 words, ≤140 characters, no ALL-CAPS words, and ≤2 commas.");
    }
    if (/subjective|gifting|price/.test(s)) {
      reqs.push("Remove subjective words, gifting phrases, and any price/shipping wording from the title.");
    }
  }
  return reqs;
}

function buildTextInstruction(textItems: QualityRemediationItem[]): string {
  const hard = textItems.flatMap(hardRequirementsFor);
  return [
    "Improve the listing so it passes an automated quality rubric. Fix EACH issue below precisely.",
    "Each rewritten field MUST actually satisfy the stated requirement — this is verified automatically, so do not leave any listed requirement unmet.",
    "Change only what is needed; keep everything factual and in the seller's first-person voice.",
    "",
    "Issues found:",
    ...textItems.map((r) => `- [${r.ref}] ${r.shortcoming} → ${r.mitigation}`),
    ...(hard.length > 0
      ? ["", "Hard requirements (must all be met):", ...hard.map((h) => `- ${h}`)]
      : []),
  ].join("\n");
}

function buildRefineContext(row: Record<string, unknown>) {
  const salePrice =
    typeof row.sale_revenue === "number"
      ? row.sale_revenue
      : typeof row.sale_revenue === "string" && row.sale_revenue.trim()
        ? Number(row.sale_revenue) || null
        : null;
  return {
    identification: str(row.description),
    listing_title: str(row.listing_title),
    listing_description: str(row.listing_description),
    listing_tags: str(row.listing_tags),
    listing_category_path: str(row.listing_category_path) || null,
    listing_condition_clarity: str(row.listing_condition_clarity),
    listing_product_story: str(row.listing_product_story),
    listing_attributes: str(row.listing_attributes),
    listing_pricing_shipping_notes: str(row.listing_pricing_shipping_notes),
    listing_title_strategy: str(row.listing_title_strategy),
    listing_quality_checklist: str(row.listing_quality_checklist),
    condition_code: str(row.condition_code),
    condition_notes: str(row.condition_notes),
    materials: str(row.materials),
    sale_price: salePrice,
  };
}

// ---------------------------------------------------------------------------
// One repair pass
// ---------------------------------------------------------------------------

async function runOneRepairPass(
  id: number,
  ctx: ScoreOpts & { model?: string; attrSuggestion: AttributeSuggestion | null }
): Promise<RepairPassResult> {
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
  const row = item as unknown as Record<string, unknown>;

  const before = evaluateListingQuality(item, ctx);
  const beforeScore = before.score;
  const actionable = before.quality_remediation.filter((r) => r.ref !== PHOTO_AI_PENDING_REF);
  const textItems = actionable.filter((r) => AI_TEXT_REFS.has(r.ref));
  const attrItems = actionable.filter((r) => ATTRIBUTE_REFS.has(r.ref));

  const buildRemaining = (rem: QualityRemediationItem[]) => {
    const act = rem.filter((r) => r.ref !== PHOTO_AI_PENDING_REF);
    return {
      ai_fixable_remaining: act.filter((r) => isRepairableRef(r.ref)),
      picture_items: act.filter((r) => isPictureRef(r.ref)),
      user_items: act.filter((r) => !isRepairableRef(r.ref) && !isPictureRef(r.ref)),
    };
  };

  // Nothing this pass can fix — hand back (only pictures / user items remain).
  if (textItems.length === 0 && attrItems.length === 0) {
    const remaining = buildRemaining(before.quality_remediation);
    return {
      no_ai_action: true,
      previous_score: beforeScore,
      new_score: beforeScore,
      delta: 0,
      passed: before.passed,
      listing_phase: item.listing_phase ?? "needs_quality_remediation",
      applied_fields: [],
      remediation: before.quality_remediation,
      ...remaining,
      progressed: false,
    };
  }

  const sets: string[] = [];
  const values: Record<string, unknown> = { id };
  const applied: string[] = [];

  // --- Attribute fixes (ADR-081 hash inputs; hash re-baselined below) ---
  const attrRefs = new Set(attrItems.map((r) => r.ref));

  if (attrRefs.has("etsy_who_made") && !str(row.etsy_who_made)) {
    // Vintage resale default (ADR-017 §1b).
    sets.push("etsy_who_made = @etsy_who_made");
    values.etsy_who_made = "someone_else";
    applied.push("etsy_who_made");
  }

  const attr = ctx.attrSuggestion;
  if (attr) {
    if (attrRefs.has("etsy_when_made") && attr.when_made && !str(row.etsy_when_made)) {
      sets.push("etsy_when_made = @etsy_when_made");
      values.etsy_when_made = attr.when_made;
      applied.push("etsy_when_made");
    }
    if (attrRefs.has("etsy_taxonomy_id") && !num(row.etsy_taxonomy_id)) {
      const taxId = resolveTaxonomyId(attr);
      if (taxId) {
        sets.push("etsy_taxonomy_id = @etsy_taxonomy_id");
        values.etsy_taxonomy_id = taxId;
        applied.push("etsy_taxonomy_id");
      }
    }
    if (attrRefs.has("materials") && attr.materials?.length && !materialsPresent(row.materials)) {
      sets.push("materials = @materials");
      values.materials = JSON.stringify(attr.materials);
      applied.push("materials");
    }
    if ((attrRefs.has("dimensions") || attrRefs.has("shipping")) && attr.dimensions) {
      const d = attr.dimensions;
      if (d.length != null && !num(row.item_length)) {
        sets.push("item_length = @item_length");
        values.item_length = d.length;
        applied.push("item_length");
      }
      if (d.width != null && !num(row.item_width)) {
        sets.push("item_width = @item_width");
        values.item_width = d.width;
        applied.push("item_width");
      }
      if (d.height != null && !num(row.item_height)) {
        sets.push("item_height = @item_height");
        values.item_height = d.height;
        applied.push("item_height");
      }
      if (d.dimensions_unit && !str(row.item_dimensions_unit)) {
        sets.push("item_dimensions_unit = @item_dimensions_unit");
        values.item_dimensions_unit = d.dimensions_unit;
        applied.push("item_dimensions_unit");
      }
      if (d.weight != null && !num(row.item_weight)) {
        sets.push("item_weight = @item_weight");
        values.item_weight = d.weight;
        applied.push("item_weight");
      }
      if (d.weight_unit && !str(row.item_weight_unit)) {
        sets.push("item_weight_unit = @item_weight_unit");
        values.item_weight_unit = d.weight_unit;
        applied.push("item_weight_unit");
      }
    }
  }

  // --- Text fixes (listing OUTPUT fields + price) via one global refine ---
  const wantsTagFix = textItems.some(
    (r) => r.ref === "listing_tags" && /repeat/i.test(r.shortcoming)
  );
  if (textItems.length > 0) {
    const refined = await refineListing({
      mode: "global",
      instruction: buildTextInstruction(textItems),
      model: ctx.model,
      context: buildRefineContext(row),
    });
    for (const [field, value] of Object.entries(refined.fields)) {
      const column = TEXT_APPLY_COLUMN_MAP[field];
      if (!column || typeof value !== "string" || !value.trim()) continue;
      if (column === "sale_revenue") {
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0) continue;
        sets.push("sale_revenue = @sale_revenue");
        values.sale_revenue = n;
      } else if (column === "listing_tags") {
        // Deterministically enforce the word-disjoint rule the rubric requires.
        values.listing_tags = wantsTagFix ? dedupeTagWords(value) : value;
        sets.push("listing_tags = @listing_tags");
      } else {
        sets.push(`${column} = @${column}`);
        values[column] = value;
      }
      applied.push(column);
    }
    // If the AI didn't return tags but the repeat flag is set, de-dup the current tags.
    if (wantsTagFix && !applied.includes("listing_tags")) {
      const fixed = dedupeTagWords(str(row.listing_tags));
      if (fixed && fixed !== str(row.listing_tags)) {
        sets.push("listing_tags = @listing_tags");
        values.listing_tags = fixed;
        applied.push("listing_tags");
      }
    }
  }

  if (sets.length > 0) {
    sets.push("updated_at = @updated_at");
    values.updated_at = new Date().toISOString();
    getDb().prepare(`UPDATE inventory SET ${sets.join(", ")} WHERE id = @id`).run(values);
  }

  // Re-baseline the source hash so attribute (hash-field) changes we just made do
  // not register as drift — the item stays in the quality flow (ADR-081 §5).
  const updated = getInventoryById(id) ?? item;
  const newHash = computeListingSourceHash(updated);
  getDb().prepare("UPDATE inventory SET listing_source_hash = ? WHERE id = ?").run(newHash, id);

  // Re-score with the SAME photo sub-score (photos unchanged during a text/attr fix).
  const rescoreItem = getInventoryById(id) ?? updated;
  const after = evaluateListingQuality(rescoreItem, ctx);
  const afterActionable = after.quality_remediation.filter((r) => r.ref !== PHOTO_AI_PENDING_REF);
  const ready = after.passed && afterActionable.length === 0;
  const listingPhase = setQualityPhase(id, ready);
  getDb()
    .prepare("UPDATE inventory SET listing_quality_json = ? WHERE id = ?")
    .run(JSON.stringify({ ...after, listing_source_hash: newHash }), id);

  const delta = Number((after.score - beforeScore).toFixed(2));
  const remaining = buildRemaining(after.quality_remediation);
  return {
    no_ai_action: false,
    previous_score: beforeScore,
    new_score: after.score,
    delta,
    passed: after.passed,
    listing_phase: listingPhase,
    applied_fields: applied,
    remediation: after.quality_remediation,
    ...remaining,
    progressed: delta > 0.001,
  };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export async function runRemediation(
  id: number,
  opts: { tier: "standard" | "premium"; mode: "single" | "auto" }
): Promise<RemediationRunResult> {
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

  // Same gate as Evaluate Quality: only a current, generated listing.
  const phase = computeListingPhase(item);
  if (phase === "needs_data" || phase === "ready_to_generate") {
    throw new ApiRouteError({
      status: 409,
      code: "PUBLISH_NOT_READY",
      message: "Remediation blocked: listing not current",
      userMessage:
        phase === "needs_data"
          ? "Complete the required item data and generate a listing before running repair."
          : "This item's data changed since the listing was generated. Generate the listing again first.",
      actions: ["Generate (or regenerate) the listing, then run repair."],
      canRetry: false,
    });
  }

  const minScore = getMinQualityScore();
  const defaultWhoMade = getSetting("etsy.publish.default_who_made");
  const defaultWhenMade = getSetting("etsy.publish.default_when_made");

  // Resolve model tier. "Advance AI" uses ai.premium_model when configured.
  const config = getAiConfig();
  const premiumModel = (getSetting("ai.premium_model") ?? "").trim();
  const premiumConfigured = premiumModel.length > 0;
  const model = opts.tier === "premium" && premiumConfigured ? premiumModel : undefined;
  const modelUsed = model ?? config?.model ?? null;

  // Photo AI sub-score — computed ONCE, reused across passes.
  const photoQuality = (await evaluatePhotoQuality(item, id)) ?? undefined;

  const scoreOpts: ScoreOpts = {
    minScore,
    itemId: id,
    photoQuality,
    defaultWhoMade,
    defaultWhenMade,
  };

  // Decide whether we need an AI attribute suggestion (era/taxonomy/materials/dims).
  const initial = evaluateListingQuality(item, scoreOpts);
  const needs = deriveAttrNeeds(initial.quality_remediation);
  let attrSuggestion: AttributeSuggestion | null = null;
  if (needs.anyAi) {
    try {
      const photoPaths = collectMainPhotoPaths(item).slice(0, 4);
      const photos: CoachPhotoFile[] = await loadPhotosFromPaths(photoPaths);
      attrSuggestion = await suggestListingAttributes({
        itemPhotos: photos,
        identification: str((item as unknown as Record<string, unknown>).description),
        description: item.description ?? undefined,
        conditionCode: item.condition_code ?? undefined,
        storeCategory: item.category_tags ?? undefined,
        needWhenMade: needs.needWhenMade,
        needTaxonomy: needs.needTaxonomy,
        needMaterials: needs.needMaterials,
        needDimensions: needs.needDimensions,
        model,
      });
    } catch {
      attrSuggestion = null; // degrade: attributes stay as user items
    }
  }

  const passCtx = { ...scoreOpts, model, attrSuggestion };
  const passes: RepairPassResult[] = [];

  const maxPasses = opts.mode === "auto" ? MAX_AUTO_PASSES : 1;
  for (let i = 0; i < maxPasses; i += 1) {
    const pass = await runOneRepairPass(id, passCtx);
    passes.push(pass);
    if (opts.mode === "single") break;
    if (pass.passed) break;
    if (pass.no_ai_action) break;
    if (pass.ai_fixable_remaining.length === 0) break; // only pictures/user items left
    if (!pass.progressed) break;
  }

  const final = passes[passes.length - 1];

  logActivity({
    action: "listing.remediation_cycle",
    entityType: "inventory",
    entityId: id,
    entityLabel: item.item_number || item.description || `Item ${id}`,
    detail: {
      mode: opts.mode,
      tier: opts.tier,
      model: modelUsed,
      passes: passes.length,
      previous_score: passes[0]?.previous_score ?? final.previous_score,
      new_score: final.new_score,
      photo_ai_evaluated: !!photoQuality,
      applied: passes.flatMap((p) => p.applied_fields),
    },
    source: "user",
  });

  const firstPrev = passes[0]?.previous_score ?? final.previous_score;
  return {
    ok: true,
    mode: opts.mode,
    tier: opts.tier,
    model_used: modelUsed,
    premium_configured: premiumConfigured,
    photo_ai_evaluated: !!photoQuality,
    passes,
    previous_score: firstPrev,
    new_score: final.new_score,
    delta: Number((final.new_score - firstPrev).toFixed(2)),
    passed: final.passed,
    listing_phase: final.listing_phase,
    no_ai_action: final.no_ai_action && passes.length === 1,
    applied_fields: passes.flatMap((p) => p.applied_fields),
    remediation: final.remediation,
    user_action_items: [...final.ai_fixable_remaining, ...final.user_items],
    picture_items: final.picture_items,
    message: final.no_ai_action && passes.length === 1
      ? "Nothing left for the AI to fix. The remaining items need new photos or your input."
      : undefined,
  };
}
