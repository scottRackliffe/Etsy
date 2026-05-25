export type ListingScoreGrade = "green" | "yellow" | "red";

export type ListingScoreBreakdown = {
  title_length: number;
  title_keywords: number;
  description_length: number;
  picture_count: number;
  tags_filled: number;
  condition_code: number;
  condition_notes: number;
  sale_revenue: number;
  item_number: number;
  category_tags: number;
  description_dimensions: number;
  description_materials: number;
};

export type ListingScoreResult = {
  score: number;
  grade: ListingScoreGrade;
  tips: string[];
  breakdown: ListingScoreBreakdown;
};

export type ListingScoreInput = {
  listing_title?: string | null;
  listing_description?: string | null;
  listing_tags?: string | null;
  category_tags?: string | null;
  condition_code?: string | null;
  condition_notes?: string | null;
  has_condition_issue?: number | null;
  sale_revenue?: number | null;
  item_number?: string | null;
  picture_1?: string | null;
  picture_2?: string | null;
  picture_3?: string | null;
  picture_4?: string | null;
  picture_5?: string | null;
  picture_6?: string | null;
  picture_7?: string | null;
  picture_8?: string | null;
  picture_9?: string | null;
  picture_10?: string | null;
};

const DIMENSIONS_RE = /\b\d+(\.\d+)?\s*("|inch|inches|cm|mm|feet|ft)\b/i;
const MATERIALS_RE =
  /\b(ceramic|glass|wood|metal|brass|copper|silver|gold|porcelain|crystal|fabric|cotton|silk|leather|plastic|bakelite|lucite|iron|steel|tin|aluminum|stone|marble)\b/i;

function countPictures(input: ListingScoreInput): number {
  const keys = [
    "picture_1",
    "picture_2",
    "picture_3",
    "picture_4",
    "picture_5",
    "picture_6",
    "picture_7",
    "picture_8",
    "picture_9",
    "picture_10",
  ] as const;
  return keys.filter((key) => {
    const value = input[key];
    return typeof value === "string" && value.trim().length > 0;
  }).length;
}

function countTags(listingTags: string | null | undefined): number {
  if (!listingTags?.trim()) return 0;
  return listingTags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean).length;
}

function scoreTitleLength(title: string): number {
  const len = title.trim().length;
  if (len === 0) return 0;
  if (len >= 60 && len <= 140) return 15;
  return 5;
}

function scoreTitleKeywords(title: string, categoryTags: string | null | undefined): number {
  const normalizedTitle = title.trim().toLowerCase();
  if (!normalizedTitle || !categoryTags?.trim()) return 0;
  const words = categoryTags
    .split(/[,\s]+/)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length >= 3);
  return words.some((word) => normalizedTitle.includes(word)) ? 10 : 0;
}

function scoreDescriptionLength(description: string): number {
  const len = description.trim().length;
  if (len >= 500) return 15;
  if (len >= 200) return 8;
  return 0;
}

function scorePictureCount(count: number): number {
  if (count >= 5) return 15;
  if (count >= 3) return 8;
  return 0;
}

function scoreTagsFilled(count: number): number {
  if (count >= 13) return 10;
  if (count >= 8) return 5;
  return 0;
}

function gradeForScore(score: number): ListingScoreGrade {
  if (score >= 80) return "green";
  if (score >= 60) return "yellow";
  return "red";
}

type TipCandidate = { gain: number; tip: string };

function buildTips(input: ListingScoreInput, breakdown: ListingScoreBreakdown): string[] {
  const title = input.listing_title?.trim() ?? "";
  const description = input.listing_description?.trim() ?? "";
  const pictureCount = countPictures(input);
  const tagCount = countTags(input.listing_tags);
  const candidates: TipCandidate[] = [];

  if (breakdown.title_length < 15) {
    if (!title) {
      candidates.push({ gain: 15, tip: "Add a listing title to improve search visibility." });
    } else if (title.length < 60) {
      candidates.push({
        gain: 15 - breakdown.title_length,
        tip: `Your title is ${title.length} characters — aim for 60+ for better search visibility.`,
      });
    } else if (title.length > 140) {
      candidates.push({
        gain: 10,
        tip: "Your title is over 140 characters — shorten it for better display in search results.",
      });
    }
  }

  if (breakdown.title_keywords < 10 && input.category_tags?.trim()) {
    candidates.push({
      gain: 10,
      tip: "Include a category keyword in your listing title.",
    });
  }

  if (breakdown.description_length < 15) {
    if (!description) {
      candidates.push({ gain: 15, tip: "Add a listing description — aim for 500+ characters." });
    } else if (description.length < 200) {
      candidates.push({
        gain: 15 - breakdown.description_length,
        tip: "Expand your description — aim for at least 200 characters.",
      });
    } else if (description.length < 500) {
      candidates.push({
        gain: 15 - breakdown.description_length,
        tip: "Expand your description — aim for 500+ characters for best results.",
      });
    }
  }

  if (breakdown.picture_count < 15) {
    candidates.push({
      gain: 15 - breakdown.picture_count,
      tip: `Add more photos — you have ${pictureCount} of 10 slots filled.`,
    });
  }

  if (breakdown.tags_filled < 10) {
    candidates.push({
      gain: 10 - breakdown.tags_filled,
      tip: `Add more tags — you have ${tagCount} of 13.`,
    });
  }

  if (breakdown.condition_code < 5) {
    candidates.push({ gain: 5, tip: "Set a condition code for this item." });
  }

  if (input.has_condition_issue === 1 && breakdown.condition_notes < 5) {
    candidates.push({ gain: 5, tip: "Add condition notes explaining the issue." });
  }

  if (breakdown.sale_revenue < 5) {
    candidates.push({ gain: 5, tip: "Set a sale price before listing." });
  }

  if (breakdown.item_number < 5) {
    candidates.push({ gain: 5, tip: "Assign an item number to track this record." });
  }

  if (breakdown.category_tags < 5) {
    candidates.push({ gain: 5, tip: "Add category tags to help buyers find your item." });
  }

  if (breakdown.description_dimensions < 5 && description) {
    candidates.push({ gain: 5, tip: "Include dimensions or measurements in your description." });
  }

  if (breakdown.description_materials < 5 && description) {
    candidates.push({ gain: 5, tip: "Mention materials (e.g. ceramic, glass, wood) in your description." });
  }

  return candidates
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 3)
    .map((entry) => entry.tip);
}

export function computeListingScore(input: ListingScoreInput): ListingScoreResult {
  const title = input.listing_title?.trim() ?? "";
  const description = input.listing_description?.trim() ?? "";
  const pictureCount = countPictures(input);
  const tagCount = countTags(input.listing_tags);

  const breakdown: ListingScoreBreakdown = {
    title_length: scoreTitleLength(title),
    title_keywords: scoreTitleKeywords(title, input.category_tags),
    description_length: scoreDescriptionLength(description),
    picture_count: scorePictureCount(pictureCount),
    tags_filled: scoreTagsFilled(tagCount),
    condition_code: input.condition_code?.trim() ? 5 : 0,
    condition_notes:
      input.has_condition_issue === 1 && input.condition_notes?.trim() ? 5 : 0,
    sale_revenue: input.sale_revenue != null && input.sale_revenue > 0 ? 5 : 0,
    item_number: input.item_number?.trim() ? 5 : 0,
    category_tags: input.category_tags?.trim() ? 5 : 0,
    description_dimensions: description && DIMENSIONS_RE.test(description) ? 5 : 0,
    description_materials: description && MATERIALS_RE.test(description) ? 5 : 0,
  };

  const score = Object.values(breakdown).reduce((sum, points) => sum + points, 0);

  return {
    score,
    grade: gradeForScore(score),
    tips: buildTips(input, breakdown),
    breakdown,
  };
}

export function listingScoreGradeColor(grade: ListingScoreGrade): string {
  switch (grade) {
    case "green":
      return "var(--ui-green)";
    case "yellow":
      return "var(--ui-yellow)";
    case "red":
      return "var(--ui-red)";
  }
}
