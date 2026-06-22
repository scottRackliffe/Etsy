/**
 * Listing quality rubric — deterministic engine (ADR-082 / WS-G2).
 *
 * Implements the weighted 0–100 rubric using deterministic checks for every
 * category. Photos §8a (coverage, 16 pts) is deterministic here; Photos §8b
 * (per-photo AI quality, 24 pts) is injected via `opts.photoQuality` (WS-G3);
 * when absent a provisional sub-score is awarded and flagged as pending.
 */
import type { InventoryRecord } from "@/lib/inventory";
import { parseShotTypeSet } from "@/lib/picture-classifications";

export type QualityCategory = { name: string; earned: number; possible: number };

export type QualityRemediationItem = {
  category: string;
  ref: string;
  shortcoming: string;
  mitigation: string;
  weight: number;
  resolution_link: string;
};

export type PhotoQualitySubresult = {
  earned: number; // 0..24
  remediation: QualityRemediationItem[];
  photo_ai_evaluated: boolean;
};

export type ListingQualityResult = {
  score: number;
  passed: boolean;
  target: number;
  categories: QualityCategory[];
  quality_remediation: QualityRemediationItem[];
  photo_ai_evaluated: boolean;
  evaluated_at: string;
  /**
   * Snapshot of the item's listing_source_hash at evaluation time (ADR-081).
   * Stored so computeRubricFastScore can detect drift without re-running the
   * server-side SHA-256 hash in the browser. Absent on older cached results
   * (treated as non-drifted for backward compat).
   */
  listing_source_hash?: string | null;
};

const QUALITY_TARGET = 98;
export const PHOTO_AI_PENDING_REF = "photos_ai_pending";

const SUBJECTIVE_WORDS = [
  "beautiful",
  "gorgeous",
  "stunning",
  "perfect",
  "lovely",
  "amazing",
  "wonderful",
  "exquisite",
  "rare",
];
const GIFTING_PHRASES = ["gift for", "gift idea", "perfect gift", "great gift", "for her", "for him"];
const PRICE_SHIP_WORDS = ["free shipping", "sale", "discount", "cheap", "% off", "$"];
const COLORS = [
  "red", "orange", "yellow", "green", "blue", "purple", "pink", "black", "white", "gray",
  "grey", "brown", "gold", "silver", "teal", "turquoise", "cream", "ivory", "beige", "amber",
];
const MATERIALS = [
  "glass", "ceramic", "porcelain", "wood", "metal", "brass", "copper", "silver", "gold",
  "leather", "cotton", "wool", "silk", "linen", "plastic", "bakelite", "crystal", "stoneware",
  "earthenware", "pewter", "bronze", "iron", "steel", "tin",
];
const ERA_RE = /\b(1[6-9]\d0s?|20[0-2]0s?|[1-9]0s|\d{4})\b/i;
const MEASURE_RE = /\d\s?(mm|cm|in|inch|inches|"|ft|foot|feet|g|kg|oz|lb)\b/i;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function words(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}
function containsAny(haystack: string, needles: string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((n) => lower.includes(n));
}

const MAIN_PICTURE_KEYS = Array.from({ length: 20 }, (_, i) => `picture_${i + 1}`);
const CONDITION_PICTURE_KEYS = Array.from({ length: 5 }, (_, i) => `condition_picture_${i + 1}`);

function countMainPictures(row: Record<string, unknown>): number {
  return MAIN_PICTURE_KEYS.filter((k) => str(row[k]).length > 0).length;
}
function countConditionPictures(row: Record<string, unknown>): number {
  return CONDITION_PICTURE_KEYS.filter((k) => str(row[k]).length > 0).length;
}

function parseShotTypes(row: Record<string, unknown>): Set<string> {
  return parseShotTypeSet(str(row.picture_classifications));
}

type CategoryEval = { earned: number; possible: number; remediation: QualityRemediationItem[] };

function makeLink(itemId: number, anchor: string): string {
  return `/inventory?itemId=${itemId}#${anchor}`;
}

function evalTitle(row: Record<string, unknown>, itemId: number): CategoryEval {
  const rem: QualityRemediationItem[] = [];
  const title = str(row.listing_title);
  const link = makeLink(itemId, "field-listing_title");
  let earned = 0;
  const ws = words(title);
  const lower = title.toLowerCase();

  // Noun-first (3)
  const firstWord = (ws[0] ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const articles = new Set(["a", "an", "the", "vintage", "antique"]);
  if (title && !SUBJECTIVE_WORDS.includes(firstWord) && !articles.has(firstWord)) {
    earned += 3;
  } else if (title) {
    rem.push({
      category: "title",
      ref: "listing_title",
      shortcoming: "Title does not lead with the item type (noun).",
      mitigation: 'Start with the item noun (e.g. "Teapot, …"), not an article or adjective.',
      weight: 3,
      resolution_link: link,
    });
  }

  // Key descriptors up front (4) within first ~70 chars
  const head = lower.slice(0, 70);
  let descriptors = 0;
  if (ERA_RE.test(head)) descriptors++;
  if (COLORS.some((c) => head.includes(c))) descriptors++;
  if (MATERIALS.some((m) => head.includes(m))) descriptors++;
  const descPts = Math.min(descriptors, 2) * 2; // 0,2,4
  earned += descPts;
  if (descPts < 4) {
    rem.push({
      category: "title",
      ref: "listing_title",
      shortcoming: "Few objective descriptors in the first ~70 characters of the title.",
      mitigation: "Put 2–3 key descriptors (color, material, era/age, maker) near the front.",
      weight: 4 - descPts,
      resolution_link: link,
    });
  }

  // Concise & readable (3)
  const commaCount = (title.match(/,/g) ?? []).length;
  const hasAllCaps = ws.some((w) => w.length >= 4 && w === w.toUpperCase() && /[A-Z]/.test(w));
  if (title && ws.length <= 15 && title.length <= 140 && !hasAllCaps && commaCount <= 2) {
    earned += 3;
  } else if (title) {
    rem.push({
      category: "title",
      ref: "listing_title",
      shortcoming: "Title is not concise/readable (too long, ALL-CAPS, or comma-heavy).",
      mitigation: "Keep it ≤15 words, ≤140 chars, no ALL-CAPS, and ≤2 commas.",
      weight: 3,
      resolution_link: link,
    });
  }

  // No banned content (3)
  const banned =
    SUBJECTIVE_WORDS.some((w) => lower.includes(w)) ||
    containsAny(lower, GIFTING_PHRASES) ||
    containsAny(lower, PRICE_SHIP_WORDS);
  if (title && !banned) {
    earned += 3;
  } else if (title) {
    rem.push({
      category: "title",
      ref: "listing_title",
      shortcoming: "Title uses subjective, gifting, or price/shipping wording.",
      mitigation: 'Remove words like "beautiful", "gift for her", or sale/price mentions.',
      weight: 3,
      resolution_link: link,
    });
  }

  // No repeated words (2)
  const seen = new Set<string>();
  let repeated = false;
  for (const w of ws) {
    const k = w.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (k.length >= 3) {
      if (seen.has(k)) repeated = true;
      seen.add(k);
    }
  }
  if (title && !repeated) {
    earned += 2;
  } else if (title) {
    rem.push({
      category: "title",
      ref: "listing_title",
      shortcoming: "Title repeats words.",
      mitigation: "Remove repeated words; avoid comma-separated keyword soup.",
      weight: 2,
      resolution_link: link,
    });
  }

  if (!title) {
    rem.push({
      category: "title",
      ref: "listing_title",
      shortcoming: "No listing title.",
      mitigation: "Write a concise, noun-first title.",
      weight: 15,
      resolution_link: link,
    });
  }

  return { earned, possible: 15, remediation: rem };
}

function evalDescription(row: Record<string, unknown>, itemId: number): CategoryEval {
  const rem: QualityRemediationItem[] = [];
  const desc = str(row.listing_description);
  const link = makeLink(itemId, "field-listing_description");
  const lower = desc.toLowerCase();
  const wc = words(desc).length;
  let earned = 0;

  // Opening hook (4)
  const head = lower.slice(0, 160);
  const generic = /^(thanks for visiting|welcome to my shop|hello|hi there)/.test(head.trim());
  if (desc.length >= 120 && !generic) earned += 4;
  else if (desc) {
    rem.push({
      category: "description",
      ref: "listing_description",
      shortcoming: "Weak or generic opening (first ~160 chars).",
      mitigation: "Open with what the item is + main keyword + a reason to buy.",
      weight: 4,
      resolution_link: link,
    });
  }

  // Required sections (5)
  const dimsSet = num(row.item_length) || num(row.item_width) || num(row.item_height);
  const sections: Array<[boolean, string]> = [
    [/measure|dimension|\bsize\b|\binch|\bcm\b|"/.test(lower) || !!dimsSet, "measurements"],
    [/material|made of|made from/.test(lower) || !!str(row.materials), "materials"],
    [ERA_RE.test(lower) || !!str(row.etsy_when_made), "era/maker"],
    [/condition|wear|flaw|chip|crack|patina/.test(lower) || !!str(row.condition_notes), "condition"],
    [/ship|handling|packag/.test(lower), "shipping note"],
  ];
  const found = sections.filter(([ok]) => ok).length;
  earned += found;
  if (found < 5) {
    rem.push({
      category: "description",
      ref: "listing_description",
      shortcoming: `Missing recommended sections (${sections
        .filter(([ok]) => !ok)
        .map(([, n]) => n)
        .join(", ")}).`,
      mitigation: "Cover overview, measurements, materials, era/maker, condition, and shipping.",
      weight: 5 - found,
      resolution_link: link,
    });
  }

  // Length/detail (2)
  if (wc >= 250) earned += 2;
  else if (wc >= 150) earned += 1;
  if (wc < 250) {
    rem.push({
      category: "description",
      ref: "listing_description",
      shortcoming: "Description is short.",
      mitigation: "Aim for ~250–400 words (≥150 minimum).",
      weight: wc >= 150 ? 1 : 2,
      resolution_link: link,
    });
  }

  // Scannability (2)
  const hasBreaks = /\n/.test(desc) || /[•\-*]\s/.test(desc);
  if (hasBreaks) earned += 2;
  else if (desc) {
    rem.push({
      category: "description",
      ref: "listing_description",
      shortcoming: "Description is one block of text.",
      mitigation: "Use short paragraphs or bullet points for scannability.",
      weight: 2,
      resolution_link: link,
    });
  }

  // Natural keyword usage (2)
  const tagsCsv = str(row.listing_tags).toLowerCase();
  const dumpsTags = tagsCsv.length > 0 && lower.includes(tagsCsv);
  if (wc >= 150 && !dumpsTags) earned += 2;
  else if (wc >= 80 && !dumpsTags) earned += 1;
  if (dumpsTags) {
    rem.push({
      category: "description",
      ref: "listing_description",
      shortcoming: "Tags appear dumped into the description.",
      mitigation: "Use keywords naturally in sentences; don't paste the tag list.",
      weight: 2,
      resolution_link: link,
    });
  }

  if (!desc) {
    rem.push({
      category: "description",
      ref: "listing_description",
      shortcoming: "No listing description.",
      mitigation: "Write a detailed, scannable description.",
      weight: 15,
      resolution_link: link,
    });
  }

  return { earned, possible: 15, remediation: rem };
}

function evalTags(row: Record<string, unknown>, itemId: number): CategoryEval {
  const rem: QualityRemediationItem[] = [];
  const link = makeLink(itemId, "field-listing_tags");
  const tags = str(row.listing_tags)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  let earned = 0;

  // Count (4)
  const countPts = Math.round((4 * Math.min(tags.length, 13)) / 13);
  earned += countPts;
  if (tags.length < 13) {
    rem.push({
      category: "tags",
      ref: "listing_tags",
      shortcoming: `Only ${tags.length}/13 tags used.`,
      mitigation: "Use all 13 tags (each ≤20 characters).",
      weight: 4 - countPts,
      resolution_link: link,
    });
  }

  // Long-tail multi-word (3)
  const multi = tags.filter((t) => t.split(/\s+/).length >= 2).length;
  if (tags.length > 0 && multi / tags.length > 0.5) earned += 3;
  else if (multi > 0) earned += 1;
  if (!(tags.length > 0 && multi / tags.length > 0.5)) {
    rem.push({
      category: "tags",
      ref: "listing_tags",
      shortcoming: "Most tags are single words.",
      mitigation: "Prefer 2–3 word long-tail phrases buyers search for.",
      weight: 3,
      resolution_link: link,
    });
  }

  // No redundancy (2)
  const tagWords = new Set<string>();
  let dup = false;
  for (const t of tags) {
    for (const w of t.toLowerCase().split(/\s+/)) {
      if (w.length >= 3) {
        if (tagWords.has(w)) dup = true;
        tagWords.add(w);
      }
    }
  }
  if (tags.length > 0 && !dup) earned += 2;
  else if (dup) {
    rem.push({
      category: "tags",
      ref: "listing_tags",
      shortcoming: "Tags repeat the same words.",
      mitigation: "Vary tags; don't duplicate words, category, or materials. Add era variants.",
      weight: 2,
      resolution_link: link,
    });
  }

  // Relevance / length (1)
  const allValid = tags.length > 0 && tags.every((t) => t.length <= 20);
  if (allValid) earned += 1;
  else if (tags.some((t) => t.length > 20)) {
    rem.push({
      category: "tags",
      ref: "listing_tags",
      shortcoming: "Some tags exceed 20 characters.",
      mitigation: "Keep each tag ≤20 characters.",
      weight: 1,
      resolution_link: link,
    });
  }

  return { earned, possible: 10, remediation: rem };
}

function evalCategoryAttributes(row: Record<string, unknown>, itemId: number): CategoryEval {
  const rem: QualityRemediationItem[] = [];
  const link = makeLink(itemId, "field-category");
  let earned = 0;

  // Specific taxonomy (3)
  if (num(row.etsy_taxonomy_id)) earned += 3;
  else
    rem.push({
      category: "category",
      ref: "etsy_taxonomy_id",
      shortcoming: "No specific Etsy category selected.",
      mitigation: "Pick the most-specific applicable Etsy taxonomy category.",
      weight: 3,
      resolution_link: link,
    });

  // Vintage attributes (3): when_made (2) + who_made (1)
  if (str(row.etsy_when_made)) earned += 2;
  else
    rem.push({
      category: "category",
      ref: "etsy_when_made",
      shortcoming: "Era (when made) not set.",
      mitigation: "Set the era/age attribute (required for vintage).",
      weight: 2,
      resolution_link: makeLink(itemId, "field-etsy_when_made"),
    });
  if (str(row.etsy_who_made)) earned += 1;
  else
    rem.push({
      category: "category",
      ref: "etsy_who_made",
      shortcoming: "Who-made attribute not set.",
      mitigation: "Set who made the item.",
      weight: 1,
      resolution_link: makeLink(itemId, "field-etsy_who_made"),
    });

  // Attributes complete (4): materials not "other" (2) + dimensions (1) + category tags (1)
  const materials = str(row.materials).toLowerCase();
  if (materials && materials !== "other") earned += 2;
  else
    rem.push({
      category: "category",
      ref: "materials",
      shortcoming: 'Materials missing or set to "other".',
      mitigation: "Select specific materials from the official list.",
      weight: 2,
      resolution_link: makeLink(itemId, "field-materials"),
    });
  if (num(row.item_length) || num(row.item_width) || num(row.item_height)) earned += 1;
  else
    rem.push({
      category: "category",
      ref: "dimensions",
      shortcoming: "Item dimensions not set.",
      mitigation: "Add measurements (length/width/height).",
      weight: 1,
      resolution_link: makeLink(itemId, "field-dimensions"),
    });
  if (str(row.category_tags)) earned += 1;

  return { earned, possible: 10, remediation: rem };
}

function evalCondition(row: Record<string, unknown>, itemId: number): CategoryEval {
  const rem: QualityRemediationItem[] = [];
  const link = makeLink(itemId, "field-condition_code");
  let earned = 0;

  if (str(row.condition_code)) earned += 1;
  else
    rem.push({
      category: "condition",
      ref: "condition_code",
      shortcoming: "Condition not set.",
      mitigation: "Set the condition code.",
      weight: 1,
      resolution_link: link,
    });

  const hasIssue = Number(row.has_condition_issue) === 1;
  const notes = str(row.condition_notes);
  if (!hasIssue) {
    earned += 3; // nothing to disclose
  } else if (notes && MEASURE_RE.test(notes)) {
    earned += 3;
  } else if (notes) {
    earned += 1;
    rem.push({
      category: "condition",
      ref: "condition_notes",
      shortcoming: "Condition notes lack measurable, objective detail.",
      mitigation: 'Describe each flaw with type + size + location (e.g. "2 mm chip on rim").',
      weight: 2,
      resolution_link: makeLink(itemId, "field-condition_notes"),
    });
  } else {
    rem.push({
      category: "condition",
      ref: "condition_notes",
      shortcoming: "Condition issue noted but not described.",
      mitigation: "Describe each flaw with measurable detail.",
      weight: 3,
      resolution_link: makeLink(itemId, "field-condition_notes"),
    });
  }

  if (!hasIssue || countConditionPictures(row) >= 1) earned += 1;
  else
    rem.push({
      category: "condition",
      ref: "condition_pictures",
      shortcoming: "No photo of the noted condition issue.",
      mitigation: "Add a clear condition photo (with scale) for each flaw.",
      weight: 1,
      resolution_link: makeLink(itemId, "pictures"),
    });

  return { earned, possible: 5, remediation: rem };
}

function evalPricingShipping(row: Record<string, unknown>, itemId: number): CategoryEval {
  const rem: QualityRemediationItem[] = [];
  const link = makeLink(itemId, "field-sale_revenue");
  let earned = 0;

  const price = num(row.sale_revenue) ?? 0;
  const cost = (num(row.purchase_cost) ?? 0) + (num(row.shipping_cost) ?? 0);
  if (price > 0) earned += 1;
  if (price > 0 && price >= cost) earned += 1;
  if (!(price > 0)) {
    rem.push({
      category: "pricing",
      ref: "sale_revenue",
      shortcoming: "No price set.",
      mitigation: "Set a sale price greater than 0.",
      weight: 2,
      resolution_link: link,
    });
  } else if (price < cost) {
    rem.push({
      category: "pricing",
      ref: "sale_revenue",
      shortcoming: "Price is below cost basis (negative margin).",
      mitigation: "Review pricing to cover cost basis.",
      weight: 1,
      resolution_link: link,
    });
  }

  const dimsSet = num(row.item_length) && num(row.item_width) && num(row.item_height);
  if (num(row.etsy_shipping_profile_id) || dimsSet) earned += 2;
  else if (num(row.item_weight)) earned += 1;
  if (!(num(row.etsy_shipping_profile_id) || dimsSet)) {
    rem.push({
      category: "pricing",
      ref: "shipping",
      shortcoming: "Shipping/package details incomplete.",
      mitigation: "Set a shipping profile or package weight + dimensions.",
      weight: 2,
      resolution_link: makeLink(itemId, "field-dimensions"),
    });
  }

  if (num(row.etsy_shipping_profile_id)) earned += 1;

  return { earned, possible: 5, remediation: rem };
}

/** Photos §8a coverage (16). Deterministic from classifications + counts. */
function evalPhotoCoverage(row: Record<string, unknown>, itemId: number): CategoryEval {
  const rem: QualityRemediationItem[] = [];
  const link = makeLink(itemId, "pictures");
  const shots = parseShotTypes(row);
  const mainCount = countMainPictures(row);
  let earned = 0;

  // Hero (4) — classification or assume picture_1 is hero
  if (shots.has("hero") || mainCount >= 1) earned += 4;
  else
    rem.push({
      category: "photos",
      ref: "picture_1",
      shortcoming: "No hero photo.",
      mitigation: "Add a clear, front-on hero shot of the whole item.",
      weight: 4,
      resolution_link: link,
    });

  // ≥2 alternate angles incl back/underside (3)
  const angleCount = (shots.has("angle") ? 1 : 0) + (shots.has("underside") ? 1 : 0);
  if (shots.has("underside") || angleCount >= 2) earned += 3;
  else if (angleCount >= 1) earned += 1;
  if (!(shots.has("underside") || angleCount >= 2)) {
    rem.push({
      category: "photos",
      ref: "pictures",
      shortcoming: "Missing alternate angles (including back/underside).",
      mitigation: "Add ≥2 angle shots including the back or underside.",
      weight: 3,
      resolution_link: link,
    });
  }

  // Detail (2)
  if (shots.has("detail")) earned += 2;
  else
    rem.push({
      category: "photos",
      ref: "pictures",
      shortcoming: "No detail / close-up photo.",
      mitigation: "Add a close-up of key details or texture.",
      weight: 2,
      resolution_link: link,
    });

  // Scale / lifestyle (2)
  if (shots.has("scale") || shots.has("lifestyle")) earned += 2;
  else
    rem.push({
      category: "photos",
      ref: "pictures",
      shortcoming: "No scale or in-context photo.",
      mitigation: "Add a scale/in-context shot so buyers judge size.",
      weight: 2,
      resolution_link: link,
    });

  // Measurement (2)
  if (shots.has("measurement")) earned += 2;
  else
    rem.push({
      category: "photos",
      ref: "pictures",
      shortcoming: "No measurement photo.",
      mitigation: "Add a measurement photo (with a ruler).",
      weight: 2,
      resolution_link: link,
    });

  // Backstamp (1) — required if marked; awarded if present
  if (shots.has("backstamp")) earned += 1;
  else
    rem.push({
      category: "photos",
      ref: "pictures",
      shortcoming: "No maker's-mark / backstamp photo.",
      mitigation: "If the item has any mark/signature/label, photograph it.",
      weight: 1,
      resolution_link: link,
    });

  // Imperfection (1) — required if condition issue noted
  const hasIssue = Number(row.has_condition_issue) === 1;
  if (!hasIssue || shots.has("imperfection") || countConditionPictures(row) >= 1) earned += 1;
  else
    rem.push({
      category: "photos",
      ref: "pictures",
      shortcoming: "Condition issue noted but no imperfection photo.",
      mitigation: "Show each flaw with a scale reference.",
      weight: 1,
      resolution_link: link,
    });

  // Count ≥5 (1)
  if (mainCount >= 5) earned += 1;
  else
    rem.push({
      category: "photos",
      ref: "pictures",
      shortcoming: `Only ${mainCount} photo(s).`,
      mitigation: "Use at least 5 photos (up to 10 ideal).",
      weight: 1,
      resolution_link: link,
    });

  return { earned, possible: 16, remediation: rem };
}

/** Provisional §8b sub-score when AI vision is not available (WS-G2). */
function provisionalPhotoQuality(row: Record<string, unknown>, itemId: number): PhotoQualitySubresult {
  const mainCount = countMainPictures(row);
  // Up to ~60% of the 24 points based on coverage, pending real AI review.
  const earned = mainCount === 0 ? 0 : Math.round((14 * Math.min(mainCount, 5)) / 5);
  return {
    earned,
    photo_ai_evaluated: false,
    remediation: [
      {
        category: "photos",
        ref: PHOTO_AI_PENDING_REF,
        shortcoming: "Per-photo AI quality review pending.",
        mitigation: "Per-photo AI evaluation (focus, lighting, background, framing) lands in WS-G3.",
        weight: 0,
        resolution_link: makeLink(itemId, "pictures"),
      },
    ],
  };
}

export function evaluateListingQuality(
  item: InventoryRecord,
  opts: { minScore: number; itemId: number; photoQuality?: PhotoQualitySubresult }
): ListingQualityResult {
  const row = item as unknown as Record<string, unknown>;
  const { minScore, itemId } = opts;

  const title = evalTitle(row, itemId);
  const description = evalDescription(row, itemId);
  const tags = evalTags(row, itemId);
  const categoryAttrs = evalCategoryAttributes(row, itemId);
  const condition = evalCondition(row, itemId);
  const pricing = evalPricingShipping(row, itemId);
  const coverage = evalPhotoCoverage(row, itemId);
  const photoQuality = opts.photoQuality ?? provisionalPhotoQuality(row, itemId);

  const photosEarned = coverage.earned + Math.max(0, Math.min(24, photoQuality.earned));
  const categories: QualityCategory[] = [
    { name: "photos", earned: photosEarned, possible: 40 },
    { name: "title", earned: title.earned, possible: 15 },
    { name: "description", earned: description.earned, possible: 15 },
    { name: "tags", earned: tags.earned, possible: 10 },
    { name: "category", earned: categoryAttrs.earned, possible: 10 },
    { name: "condition", earned: condition.earned, possible: 5 },
    { name: "pricing", earned: pricing.earned, possible: 5 },
  ];

  const score = Math.max(
    0,
    Math.min(100, categories.reduce((sum, c) => sum + c.earned, 0))
  );

  const quality_remediation = [
    ...coverage.remediation,
    ...photoQuality.remediation,
    ...title.remediation,
    ...description.remediation,
    ...tags.remediation,
    ...categoryAttrs.remediation,
    ...condition.remediation,
    ...pricing.remediation,
  ].sort((a, b) => b.weight - a.weight);

  return {
    score,
    passed: score >= minScore,
    target: QUALITY_TARGET,
    categories,
    quality_remediation,
    photo_ai_evaluated: photoQuality.photo_ai_evaluated,
    evaluated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Fast-path entry point — single source of truth for all list/widget surfaces
// (ADR-082, WS-L4).
// ---------------------------------------------------------------------------

export interface RubricFastScore {
  /** Integer 0–100; always present (never null/NaN). */
  score: number;
  /** "cached_full" when listing_quality_json holds a valid rubric result; "fast_path" otherwise. */
  source: "cached_full" | "fast_path";
  /** "evaluated" when the cached result includes AI photo evaluation; "provisional" otherwise. */
  photo_subscore: "evaluated" | "provisional";
}

/** Minimal shape required by computeRubricFastScore — any inventory row satisfies this. */
export type InventoryRowLike = Pick<InventoryRecord, "id"> & {
  listing_quality_json?: string | null;
  /** Used for drift detection: if the item's current hash differs from the hash
   *  stored in listing_quality_json, the cached score is stale and the fast path
   *  is used instead. */
  listing_source_hash?: string | null;
  [key: string]: unknown;
};

/**
 * Single resolution rule for every fast surface (list column, sort, Outstanding,
 * dashboard widget, aging report, threshold comparisons):
 *  1. If item.listing_quality_json holds a cached full rubric result AND the item
 *     has not drifted since evaluation → use that score (source:"cached_full").
 *     Drift is detected by comparing item.listing_source_hash against the hash
 *     snapshot stored in the cached JSON at evaluation time (ADR-081). Older
 *     cached results that predate this field are treated as non-drifted.
 *  2. Otherwise (no cache, parse error, or drift detected) → compute deterministic
 *     fast score (text/counts/presence/taxonomy/price + §8b provisional photo
 *     sub-score) and return source:"fast_path".
 *
 * Total (never throws): items with missing/null inputs score those components as
 * absent/lowest and still return a valid integer score.
 */
export function computeRubricFastScore(item: InventoryRowLike): RubricFastScore {
  // 1 — cached full rubric result?
  const qualJson = item.listing_quality_json;
  if (qualJson && typeof qualJson === "string") {
    try {
      const cached = JSON.parse(qualJson) as Partial<ListingQualityResult>;
      if (typeof cached.score === "number" && Number.isFinite(cached.score)) {
        // Drift check: if the cache snapshot includes a source hash, compare it
        // against the item's current hash. A mismatch means the listing inputs
        // changed after evaluation — the cached score is stale, use fast path.
        // Absence of listing_source_hash in the cache (older records) is treated
        // as non-drifted for backward compatibility.
        const cachedHash = cached.listing_source_hash;
        const itemHash = item.listing_source_hash;
        if (cachedHash != null && itemHash != null && cachedHash !== itemHash) {
          // Drift detected → fall through to fast path
        } else {
          return {
            score: Math.max(0, Math.min(100, Math.round(cached.score))),
            source: "cached_full",
            photo_subscore: cached.photo_ai_evaluated ? "evaluated" : "provisional",
          };
        }
      }
    } catch {
      // fall through to fast path
    }
  }

  // 2 — deterministic fast path (no AI; provisional photo sub-score)
  try {
    const result = evaluateListingQuality(item as unknown as InventoryRecord, {
      minScore: 85,
      itemId: item.id,
    });
    return {
      score: Math.max(0, Math.min(100, Math.round(result.score))),
      source: "fast_path",
      photo_subscore: "provisional",
    };
  } catch {
    return { score: 0, source: "fast_path", photo_subscore: "provisional" };
  }
}

/**
 * Score → CSS color token.  Replaces the retired listingScoreGradeColor.
 */
export function rubricScoreColor(score: number): string {
  if (score >= 90) return "var(--ui-green)";
  if (score >= 70) return "var(--ui-yellow)";
  return "var(--ui-red)";
}
