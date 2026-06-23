# Etsy listing template and requirements (first pass)

This document defines the structure of an Etsy listing for use when generating listing content (including AI) and when enforcing "can't list until complete." It is the input for AI to generate listing text; the AI returns **structured data** that maps to item/listing fields for direct import into the inventory record.

**References:** design-decisions-implementation.md §9; ADR-002 (inventory); etsy-compliance.md; [system/tips/How_to_Win_on_Etsy.md](../system/tips/How_to_Win_on_Etsy.md); [system/tips/Etsy_Photo_Guide.md](../system/tips/Etsy_Photo_Guide.md) (scannable tips in knowledge base).

---

## 1. Listing structure (template)

An Etsy listing consists of:

| Part                | Etsy / app field                    | Required for List on Etsy | Source (inventory or derived)                                                    |
| ------------------- | ----------------------------------- | ------------------------- | -------------------------------------------------------------------------------- |
| **Title**           | listing title                       | Yes                       | inventory.listing_title (AI or manual)                                           |
| **Category**        | taxonomy_id + category path         | Yes (Etsy)                | inventory.etsy_taxonomy_id (numeric) + inventory.listing_category_path (display) |
| **Attributes**      | Etsy attributes (e.g. color, size)  | Per Etsy category         | From template or AI; map to Etsy attribute IDs                                   |
| **Tags**            | tags (up to 13)                     | Yes (Etsy)                | inventory.listing_tags (comma-separated or array)                                |
| **Description**     | listing description                 | Yes                       | inventory.listing_description (AI or manual)                                     |
| **Price**           | price                               | Yes                       | inventory.sale_revenue or listing price                                          |
| **Photos**          | main + up to 19 more                | Yes (at least 1)          | inventory.picture_1 … picture_20 (paths or URLs)                                |
| **Video**           | listing video                       | No (recommended)          | inventory.video_path (MP4/MOV, 5–15 sec)                                         |
| **Who made**        | who_made                            | Yes (Etsy API)            | inventory.etsy_who_made or global default `etsy.publish.default_who_made`        |
| **When made**       | when_made                           | Yes (Etsy API)            | inventory.etsy_when_made (per-item, required for vintage)                        |
| **Materials**       | materials[]                         | No (recommended)          | inventory.materials (JSON array of strings)                                      |
| **Dimensions**      | item_length/width/height + unit     | No (recommended)          | inventory.item_length/width/height + item_dimensions_unit                        |
| **Weight**          | item_weight + unit                  | No (recommended)          | inventory.item_weight + item_weight_unit                                         |
| **Shipping**        | shipping_profile_id                 | Yes for physical          | inventory.etsy_shipping_profile_id or global `etsy.publish.shipping_profile_id`  |
| **Return policy**   | return_policy_id                    | Yes for active listings   | inventory.etsy_return_policy_id or global `etsy.publish.return_policy_id`        |
| **Is supply**       | is_supply                           | No (default false)        | inventory.is_supply (0 = finished product, 1 = craft supply)                     |

**Can't list until complete:** An item **cannot** be listed (List on Etsy / Publish) until **all** Etsy-required fields and **all** required AI-generated content (at least listing_title, listing_description, listing_tags) are present and saved on the inventory record. The app enforces this; any missing required field appears in validation/outstanding (ADR-020, ADR-021).

---

## 2. Requirements (Etsy + best practices)

- **Etsy API required fields for `createDraftListing`:** `title`, `description`, `price`, `quantity`, `who_made`, `when_made`, `taxonomy_id`. For activation: `shipping_profile_id`, `return_policy_id`, at least one image, `readiness_state_id`.
- **Etsy-required for quality:** Title, category, description, at least one photo, price, shipping (for physical items). Tags (up to 13). Per etsy-compliance and Etsy API listing requirements.
- **`who_made` enum:** `i_did`, `someone_else`, `collective`. For vintage resale, always `someone_else`.
- **`when_made` enum (full list):** `made_to_order`, `2020_2026`, `2010_2019`, `2004_2009`, `2000_2003`, `1990s`, `1980s`, `1970s`, `1960s`, `1950s`, `1940s`, `1930s`, `1920s`, `1910s`, `1900s`, `1800s`, `1700s`, `before_1700`. For vintage items (20+ years old as of 2026), use `2004_2009` or earlier.
- **Suggested (How to Win, Photo Guide):** Clear, search-friendly title (front-load first 40 characters); strong first line of description; quality photos (use all 20 slots, min 2000px, lighting, background, multiple angles); video (5–15 sec); condition and dimensions in description or attributes; tags that match search intent; fill ALL category attributes. See Trudy docs for wording and photo guidelines.
- **Suggested (materials, dimensions, weight):** Etsy uses materials as a search filter — always fill. Include exact measurements in inches. Weight required for calculated shipping. Store in per-item fields (ADR-017).
- **Mapping:** Which inventory/app fields feed each part is in the table above. Per-item fields override global settings at publish time (ADR-017 §1c). See also: listing_title, listing_description, listing_tags, etsy_when_made, etsy_taxonomy_id, materials, item_weight, item_length/width/height columns (ADR-017).

---

## 3. Inputs to AI when generating listing content

**Requirement:** When the app calls the AI to generate listing content (title, description, tags, etc.), the AI **must** receive **all pictures associated with the item** so it knows what it is writing about. The AI must have full visual context to produce accurate, non-misleading copy (etsy-compliance: original photos, accurate description).

**Pictures to send to the AI (every one that exists for the item):**

- **Main listing photos:** **inventory.picture_1** through **inventory.picture_20** — include every non-empty path or URL. Etsy allows up to 20 photos per listing. These are the hero, angle, detail, backstamp, scale, grouping, lifestyle, measurement shots, etc. (see Photo Guide).
- **Condition photos:** **inventory.condition_picture_1** through **inventory.condition_picture_5** — include every non-empty path or URL. These show imperfections, damage, and condition so the AI can describe condition accurately in the description.

**Additional context the app should send:** item_number, description, condition_code, condition_notes, category_tags, and any other inventory fields that help the AI (e.g. sale_revenue for price context). The **template/requirements** (this document and Trudy docs) define the rules the AI must follow; the **pictures** are the primary input so the AI describes the actual item, not a generic placeholder.

**Implementation:** The app must pass all of the above images (as URLs, base64, or paths the AI service can read) in the same request as the text context and template. Do not generate listing content without providing all item pictures.

---

## 4. AI response shape (structured, importable)

The data returned from the AI must be **structured** (e.g. JSON) so each element maps to a field on the item/listing record. The app imports the AI response **directly** into the inventory record (no manual paste). Suggested shape:

```json
{
  "listing_title": "string, max Etsy length",
  "listing_description": "string, full description",
  "listing_tags": "comma-separated or array of up to 13 tags",
  "listing_category_path": "optional; Etsy category path or id"
}
```

The template/requirements doc (this document and the Trudy docs) define the **prompt and constraints** for the AI (tone, length, Etsy rules). The response shape above is the **contract** for direct import: field names match inventory columns (ADR-017). The response contract is fixed; field names match inventory columns. Extensions (e.g. additional keys) require a document/ADR update.

---

## 5. Where this is used

- **List on Etsy flow:** Before calling Etsy create/update listing API, the app checks that listing_title, listing_description, listing_tags (and any other required fields) are non-empty on the inventory row. If not, block listing and show what’s missing (user terms; outstanding item).
- **AI generation:** User triggers "Generate listing content" (or equivalent). The app **sends all item pictures** (picture_1…picture_20 and condition_picture_1…condition_picture_5 — every non-empty one) to the AI so it knows what it is writing about (§3). The app also sends item context (description, condition_code, condition_notes, etc.) and this template/requirements doc. The AI returns the structured response (§4); the app writes to inventory.listing_title, listing_description, listing_tags (and optionally listing_category_path). **Do not generate listing content without providing all associated pictures.**
- **Reports / outstanding:** Items "In stock" but missing required listing content appear on outstanding (ADR-020); validation (ADR-021) prevents listing until complete.

---

## 6. Operator procedure (required)

Before requesting listing generation:

1. Confirm item data completeness:
   - item number
   - description
   - condition code
   - sale revenue (>0)
   - at least one picture
2. Run listing readiness check for the item.
3. If readiness is false, complete missing fields and re-check.
4. When readiness is true, request listing generation.
5. Review generated content for accuracy and policy compliance before any publish/list action.

### Failure handling

- If listing request is blocked by validation:
  - follow field-level error guidance,
  - fix missing item data,
  - retry readiness and generation.
- If AI request fails:
  - retry once,
  - verify image paths and AI configuration,
  - retry **Generate Listing**, or fall back to manual listing entry if needed.

---

## 7. Listing lifecycle (ADR-085)

For **every** item the listing flow is the single lifecycle on the inventory detail (the standalone
"Listing Coach" and "Listing Workshop" were removed by ADR-085). The seller **starts small** and
works the listing up to **world-class** quality so it earns the search traffic to sell quickly and
at the right price:

1. **Add the item** with the inline editor (ADR-079) — basics + a **hero photo**.
2. **Generate Listing** — AI does the research-and-compose work: comparable-sales **price
   recommendation**, identification, and **all** listing fields (title, description, tags, category,
   strategy fields), plus suggested era/taxonomy/materials/dimensions. All non-empty photos are
   sent. (Photo paste ⌘V and optional Google Visual Search screenshots feed this step.)
3. **Evaluate Listing Quality** — the ADR-082 rubric scores the listing and returns a remediation
   list; fix the highest-impact items and re-evaluate, driving the score toward ~100.
4. **Publish to Etsy** — unlocks once the listing passes (score ≥ 85) and the Etsy field checks are
   satisfied.

**Does not replace** §3 picture requirements: all item and condition photos are sent to the AI on
Generate and Evaluate. **Does not require** Etsy OAuth for Generate/Evaluate. **Requires** integrated
AI configuration.

Full spec: **ADR-085** (lifecycle), **ADR-081** (phases), **ADR-082** (quality rubric).

---

_End of etsy-listing-template-and-requirements.md (first pass)._
