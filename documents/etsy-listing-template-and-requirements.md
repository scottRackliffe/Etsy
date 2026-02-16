# Etsy listing template and requirements (first pass)

This document defines the structure of an Etsy listing for use when generating listing content (including AI) and when enforcing "can't list until complete." It is the input for AI to generate listing text; the AI returns **structured data** that maps to item/listing fields for direct import into the inventory record.

**References:** design-decisions-implementation.md §9; ADR-002 (inventory); etsy-compliance.md; TrudysClassicTreasures/book/How_to_Win_on_Etsy.md; TrudysClassicTreasures/book/Etsy_Photo_Guide.md.

---

## 1. Listing structure (template)

An Etsy listing consists of:

| Part | Etsy / app field | Required for List on Etsy | Source (inventory or derived) |
|------|-------------------|----------------------------|--------------------------------|
| **Title** | listing title | Yes | inventory.listing_title (AI or manual) |
| **Category** | category path | Yes (Etsy) | inventory.listing_category_path or selection from Etsy taxonomy |
| **Attributes** | Etsy attributes (e.g. color, size) | Per Etsy category | From template or AI; map to Etsy attribute IDs |
| **Tags** | tags (up to 13) | Yes (Etsy) | inventory.listing_tags (comma-separated or array) |
| **Description** | listing description | Yes | inventory.listing_description (AI or manual) |
| **Price** | price | Yes | inventory.sale_revenue or listing price |
| **Photos** | main + up to 9 more | Yes (at least 1) | inventory.picture_1 … picture_10 (paths or URLs) |
| **Shipping** | profile or override | Yes for physical | Shipping profile or item-level; from Config or item |

**Can't list until complete:** An item **cannot** be listed (List on Etsy / Publish) until **all** Etsy-required fields and **all** required AI-generated content (at least listing_title, listing_description, listing_tags) are present and saved on the inventory record. The app enforces this; any missing required field appears in validation/outstanding (ADR-020, ADR-021).

---

## 2. Requirements (Etsy + best practices)

- **Etsy-required:** Title, category, description, at least one photo, price, shipping (for physical items). Tags (up to 13). Per etsy-compliance and Etsy API listing requirements.
- **Suggested (How to Win, Photo Guide):** Clear, search-friendly title; strong first line of description; quality photos (lighting, background, multiple angles); condition and dimensions in description or attributes; tags that match search intent. See Trudy docs for wording and photo guidelines.
- **Mapping:** Which inventory/app fields feed each part is in the table above. New inventory columns: listing_title, listing_description, listing_tags (ADR-017). Optional: listing_category_path. Price and photos already exist on inventory.

---

## 3. Inputs to AI when generating listing content

**Requirement:** When the app calls the AI to generate listing content (title, description, tags, etc.), the AI **must** receive **all pictures associated with the item** so it knows what it is writing about. The AI must have full visual context to produce accurate, non-misleading copy (etsy-compliance: original photos, accurate description).

**Pictures to send to the AI (every one that exists for the item):**

- **Main listing photos:** **inventory.picture_1** through **inventory.picture_10** — include every non-empty path or URL. These are the hero, angle, detail, backstamp, scale, grouping, lifestyle, measurement shots, etc. (see Photo Guide).
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

The template/requirements doc (this document and the Trudy docs) define the **prompt and constraints** for the AI (tone, length, Etsy rules). The response shape above is the **contract** for direct import: field names match inventory columns (ADR-017). Implementations may extend with more keys (e.g. attributes) when needed.

---

## 5. Where this is used

- **List on Etsy flow:** Before calling Etsy create/update listing API, the app checks that listing_title, listing_description, listing_tags (and any other required fields) are non-empty on the inventory row. If not, block listing and show what’s missing (user terms; outstanding item).
- **AI generation:** User triggers "Generate listing content" (or equivalent). The app **sends all item pictures** (picture_1…picture_10 and condition_picture_1…condition_picture_5 — every non-empty one) to the AI so it knows what it is writing about (§3). The app also sends item context (description, condition_code, condition_notes, etc.) and this template/requirements doc. The AI returns the structured response (§4); the app writes to inventory.listing_title, listing_description, listing_tags (and optionally listing_category_path). **Do not generate listing content without providing all associated pictures.**
- **Reports / outstanding:** Items "In stock" but missing required listing content appear on outstanding (ADR-020); validation (ADR-021) prevents listing until complete.

---

*End of etsy-listing-template-and-requirements.md (first pass).*
