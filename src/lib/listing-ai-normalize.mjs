/** @typedef {{ present_shots: string[]; missing_shots: string[]; advisories: string[] }} PhotoReview */
/** @typedef {{ suggested_list_price: number | null; suggested_price_low: number | null; suggested_price_high: number | null; confidence: 'high' | 'medium' | 'low'; rationale: string }} PriceSuggestion */
/** @typedef {{ id: string; question: string; suggested_answer: string; optional?: boolean }} ConfirmCard */

const CONDITION_CODES = new Set([
  "Mint/Near Mint",
  "Excellent",
  "Very Good",
  "Good",
  "Fair/As-Is",
]);

const PHOTO_SHOT_TYPES = new Set([
  "hero",
  "angle",
  "detail",
  "backstamp",
  "scale",
  "imperfection",
  "imperfections",
  "underside",
  "grouping",
  "group",
  "lifestyle",
  "measurement",
  "extra",
]);

export function cleanJsonResponse(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

export function normalizeTags(rawTags) {
  const parsed = Array.isArray(rawTags)
    ? rawTags
    : typeof rawTags === "string"
      ? rawTags.split(/[,\n]/g)
      : [];

  const tags = parsed
    .map((tag) => String(tag).trim())
    .filter((tag) => tag.length > 0)
    .filter(
      (tag, index, all) => all.findIndex((t) => t.toLowerCase() === tag.toLowerCase()) === index
    )
    .slice(0, 13);

  if (tags.length === 0) {
    throw new Error("AI returned empty listing tags");
  }

  return tags.join(", ");
}

export function normalizeConditionCode(raw) {
  if (typeof raw !== "string") return "Good";
  const trimmed = raw.trim();
  if (CONDITION_CODES.has(trimmed)) return trimmed;
  return "Good";
}

/** @param {unknown} raw @returns {PhotoReview} */
export function normalizePhotoReview(raw) {
  const obj = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const present = Array.isArray(obj.present_shots)
    ? obj.present_shots.map(String).filter((s) => PHOTO_SHOT_TYPES.has(s))
    : [];
  const missing = Array.isArray(obj.missing_shots)
    ? obj.missing_shots.map(String).filter((s) => PHOTO_SHOT_TYPES.has(s))
    : [];
  const advisories = Array.isArray(obj.advisories)
    ? obj.advisories.map(String).filter(Boolean)
    : [];
  return { present_shots: present, missing_shots: missing, advisories };
}

/** @param {unknown} raw @returns {PriceSuggestion} */
export function normalizePrice(raw) {
  const obj = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const confidenceRaw = typeof obj.confidence === "string" ? obj.confidence.toLowerCase() : "low";
  const confidence = confidenceRaw === "high" || confidenceRaw === "medium" ? confidenceRaw : "low";
  const toNum = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  return {
    suggested_list_price: toNum(obj.suggested_list_price),
    suggested_price_low: toNum(obj.suggested_price_low),
    suggested_price_high: toNum(obj.suggested_price_high),
    confidence,
    rationale: typeof obj.rationale === "string" ? obj.rationale.trim() : "",
  };
}

/** @param {unknown} raw @returns {ConfirmCard[]} */
export function normalizeConfirmCards(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {ConfirmCard[]} */
  const cards = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = /** @type {Record<string, unknown>} */ (entry);
    const id = typeof obj.id === "string" ? obj.id.trim() : "";
    const question = typeof obj.question === "string" ? obj.question.trim() : "";
    if (!id || !question) continue;
    cards.push({
      id,
      question,
      suggested_answer: typeof obj.suggested_answer === "string" ? obj.suggested_answer.trim() : "",
      optional: obj.optional === true,
    });
  }
  return cards.slice(0, 5);
}
