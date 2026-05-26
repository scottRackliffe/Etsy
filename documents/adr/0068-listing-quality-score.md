# ADR-068: Listing quality score and SEO hints

## Status

Accepted

## Date

2026-05-24

## Context

There is no feedback on whether a listing has strong SEO, good photos, or complete content. The listing authoring workflow (ADR-023) creates content but does not evaluate its quality. A scoring system gives the user clear guidance on how to improve listings before publishing.

## Decision

### Quality score

A score from 0 to 100, computed from a weighted checklist of listing best practices. The score is calculated on the fly from the inventory record — no stored column.

### Scoring rubric

| Criterion                        | Condition                                                       | Points |
| -------------------------------- | --------------------------------------------------------------- | ------ | ------ | ----- | ----- | ------ | -------- | ---- | --------- | ------- | ------ | ------ | ---- | ------- | ------- | -------- | ------ | ---- | ----- | --- | -------- | ----- | ------------ | --- |
| Title length                     | 60–140 characters                                               | +15    |
| Title length (partial)           | < 60 or > 140 characters but non-empty                          | +5     |
| Title contains category keywords | `listing_title` contains at least one word from `category_tags` | +10    |
| Description length               | ≥ 500 characters                                                | +15    |
| Description length (partial)     | 200–499 characters                                              | +8     |
| Description length (minimal)     | < 200 characters                                                | +0     |
| Picture count                    | ≥ 5 non-null pictures (`picture_1` through `picture_10`)        | +15    |
| Picture count (partial)          | 3–4 pictures                                                    | +8     |
| Picture count (minimal)          | < 3 pictures                                                    | +0     |
| Tags filled                      | All 13 tags in `listing_tags` (comma-separated)                 | +10    |
| Tags filled (partial)            | 8–12 tags                                                       | +5     |
| Tags filled (minimal)            | < 8 tags (including < 5)                                        | +0     |
| Condition code set               | `condition_code` is non-null                                    | +5     |
| Condition notes present          | `condition_notes` is non-empty when `has_condition_issue = 1`   | +5     |
| Sale revenue set                 | `sale_revenue` is non-null and > 0                              | +5     |
| Item number set                  | `item_number` is non-null and non-empty                         | +5     |
| Category tags set                | `category_tags` is non-null and non-empty                       | +5     |
| Description mentions dimensions  | `listing_description` matches pattern `/\b\d+(\.\d+)?\s\*("     | inch   | inches | cm    | mm    | feet   | ft)\b/i` | +5   |
| Description mentions materials   | `listing_description` matches pattern `/\b(ceramic              | glass  | wood   | metal | brass | copper | silver   | gold | porcelain | crystal | fabric | cotton | silk | leather | plastic | bakelite | lucite | iron | steel | tin | aluminum | stone | marble)\b/i` | +5  |

**Maximum possible score: 100.**

Tag count is determined by splitting `listing_tags` on commas and counting non-empty trimmed entries.

### API endpoint

`GET /api/inventory/[id]/listing-score`

Response:

```json
{
  "score": 78,
  "grade": "yellow",
  "tips": [
    "Add more photos — you have 3 of 10 slots filled.",
    "Your title is 45 characters — aim for 60+ for better search visibility.",
    "Add measurements or dimensions to your description."
  ],
  "breakdown": {
    "title_length": 5,
    "title_keywords": 10,
    "description_length": 15,
    "picture_count": 8,
    "tags_filled": 10,
    "condition_code": 5,
    "condition_notes": 5,
    "sale_revenue": 5,
    "item_number": 5,
    "category_tags": 5,
    "description_dimensions": 0,
    "description_materials": 5
  }
}
```

### Grade thresholds

| Score | Grade    | Color              |
| ----- | -------- | ------------------ |
| ≥ 80  | `green`  | `var(--ui-green)`  |
| 60–79 | `yellow` | `var(--ui-yellow)` |
| < 60  | `red`    | `var(--ui-red)`    |

### Hints

- Up to 3 actionable tips are returned, ordered by potential point gain (highest first).
- Each tip is a human-readable string the UI displays as-is.
- Examples:
  - "Add more photos (you have 3 of 10)."
  - "Your title is too short — aim for 60+ characters."
  - "Add category tags to help buyers find your item."
  - "Include dimensions or measurements in your description."
  - "Add more tags — you have 6 of 13."

### UI display

#### Inventory detail / listing workshop

- A circular score badge shows the numeric score with grade color as border and ~25% tint (`color-mix`); the number is centered inside.
- Below the circle, a **Quality** caption (uppercase, muted) labels the score.
- Tips appear beside or below the badge under the heading **Tips to improve your listing**, as a bulleted list (up to 3 tips).
- The score block is the first element inside the expanded listing workshop panel (ADR-030).

#### Inventory DataTable (optional column)

- An optional "Quality" column displays the score as a colored number.
- This column is sortable (ascending/descending).
- For performance, the list endpoint can include a `listing_score` field computed inline or the frontend can batch-request scores.

## Consequences

- **Positive:** Actionable feedback loop for listing quality; encourages complete, SEO-friendly listings; no schema changes; scoring rubric is transparent and deterministic.
- **Negative:** Regex-based detection of dimensions/materials is approximate; rubric may need tuning over time; per-item API call for score (mitigated by computing inline for list views).

## Notes

- Cross-ref: ADR-023 (listing content generation modes), ADR-002 (inventory data model fields), ADR-029 (sortable columns in DataTable), ADR-030 (inventory detail two-panel layout).
- The scoring logic should be extracted into a shared utility (`src/lib/listing-score.ts`) so it can be used both server-side (API) and potentially client-side for instant feedback during editing.
- The rubric point values are intentionally designed so that a listing with a good title, description, 5+ photos, and all tags filled scores ≥ 80 (green) without needing every optional criterion.
