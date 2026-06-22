# ADR-072: Listing Coach — guided new-listing flow (photos, AI research, compose, video)

## Status

**Superseded by ADR-085 (2026-06-21).**

> **Note (2026-06-21):** The standalone Listing Coach (`/listing-coach` wizard) is **removed**. Its
> entire AI capability — web-search price recommendation, identification + full-field authoring,
> Google Visual Search screenshot paste, evidence/citations/compliance self-check, clipboard photo
> paste, auto video generation, and per-field/global refine — is **absorbed into the lifecycle
> Generate step** on the inventory detail editor (ADR-081 / ADR-085 §3). New items are created with
> the same inline SEMS editor as every other entity (basics + hero photo), then the three
> processors take over. No capability is lost; only the separate wizard is gone. See **ADR-085**.
> This ADR is retained for historical context (and as the source spec for the photo shot taxonomy,
> now owned by ADR-082/083).

Accepted (historical; revised 2026-06-15: 2-phase flow with AI refinement)

## Date

2026-05-24 (revised 2026-06-14, 2026-06-15)

## Context

The primary operator (Trudy) is **not comfortable writing marketing copy** but must produce **high-quality, search-optimized Etsy listings**. She already has a reliable workflow on the Mac:

1. Select item photos in the **Photos** app and **copy** (⌘C).
2. Run **Search with Google** (Google Visual Search / Lens) on the same or best photo for identification and comparable listings/prices.
3. Use that research when pricing and describing items.

The existing listing workshop (ADR-023) offers **Manual**, **Generate in app** (one-shot AI from saved inventory pictures), and **Import AI draft**. Those modes assume the operator can fill structured fields or accept a single AI pass without guided confirmation. They do **not**:

- Optimize for **clipboard paste** from Photos on macOS.
- Incorporate **Google Visual Search results** (screenshot paste) as first-class input.
- Ask **plain-language confirm questions** with AI-suggested answers instead of blank text areas.
- Propose **street-value / list-price range** from visual identification and Google comps, with operator override when unknown.

Marketing quality must follow canonical guidance: [etsy-listing-template-and-requirements.md](../etsy-listing-template-and-requirements.md), [system/tips/How_to_Win_on_Etsy.md](../../system/tips/How_to_Win_on_Etsy.md), [system/tips/Etsy_Photo_Guide.md](../../system/tips/Etsy_Photo_Guide.md), and Etsy Seller Handbook principles (keywords, search, photos) referenced in the operator’s local guides.

**Companion ADRs:** ADR-023 (generation modes), ADR-030/033 (inventory + pictures), ADR-068 (listing quality score), ADR-071 (UI consistency).

## Decision

### Product placement

**Listing Coach** is part of **this application**, launched when the operator **adds a new listing** — not a separate product.

| Entry point                                                                            | Behavior                                                                              |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Inventory** tab → **Add with Listing Coach** (primary CTA for new items)             | Navigates to full-screen coach flow                                                   |
| **Inventory** tab → quick **Add item** (item number only)                              | Unchanged; coach optional later from listing workshop                                 |
| Route                                                                                  | `/listing-coach` (App Router under `(app)` layout; may hide tab chrome — see ADR-024) |

User-facing name: **Listing Coach** (never “ADR-072” in UI).

### Operator constraints (v1)

| Constraint           | Spec                                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Platform             | **macOS** — Photos app copy/paste is the primary photo intake                                                                             |
| Etsy OAuth           | **Not required** for coach analyze/compose/save (same as local inventory APIs per ADR-007 local-mode policy)                              |
| Integrated AI        | **Required** for analyze and compose steps (`ai.api_key` in Config per ADR-034)                                                           |
| Google Visual Search | **Manual external step** — operator runs Search with Google in Photos; **pastes screenshot** into coach. No Google API integration in v1. |
| Live sold comps      | **Not scraped** — price guidance uses AI reading of pasted Google results + vision; not automated Etsy/eBay comp APIs                     |

### Wizard steps — REVISED 2026-06-14 (4-step flow)

The original 8-step wizard has been consolidated into a **4-step flow** to reduce friction. The AI now performs deep web-based research AND composes the listing in a single call, eliminating the need for the operator to do separate Google searches or answer confirm cards.

Each step is one screen. Primary actions use ADR-071 button variants. Back navigation allowed until final save.

**Step 0 — Welcome**

- Copy: explain three things: add photos and basic details, AI researches and writes the listing, review and save.
- Button: **Start**

**Step 1 — Input (photos + basic details)** *(replaces old Steps 1-2)*

- Large focused paste target: “Click here, then press ⌘V to paste photos from Photos.”
- Also: **Choose files…** (file picker backup) and drag-and-drop (ADR-033 limits: JPEG/PNG/WebP/GIF, max 15 MB each, max **20 item photos** + 5 condition photos per session). Etsy allows up to 20 photos per listing — encourage using all slots for maximum search visibility and buyer confidence.
- Thumbnail grid with reorder (first = hero) and remove per image.
- Minimum **1 item photo** to continue.
- Optional subsection: **Condition photos** (same paste/file/drag behavior; up to 5).
- Optional subsection: **Video** — upload a short video (MP4/MOV, max 100 MB, 5–15 seconds). Shown in Etsy listing gallery alongside photos. Label: "Add a short video (optional)."

**Photo classification (AI auto-classify):** After photos are uploaded, the AI in Step 3 (analyze) auto-classifies each photo into a shot type from the Photo Guide's 10-Shot Recipe. In the review step, each photo thumbnail shows a small classification dropdown. The first option is **"OK"** (accept AI classification), followed by the full list of shot types. The operator can override any classification with a single tap. See §Photo classification below.

**Step 2 — Google Visual Search (optional but encouraged)**

- Instructions (plain language): In Photos, right-click the best photo → **Search with Google**. Copy or screenshot the results, then paste here (⌘V).
- Separate paste zone labeled **Google results** (screenshots only; 0–3 images).
- Buttons: **Continue** | **Skip — I didn’t use Google**

**Step 3 — AI photo review**

- Client calls `POST /api/listing-coach/analyze`.
- Server sends **all pasted item + condition photos** and **Google screenshot(s)** to integrated AI with marketing/photo guidance docs.
- UI shows:
  - **Photo classifications** — each uploaded photo displayed as a thumbnail with an AI-assigned shot-type label and a compact dropdown to override. First dropdown option: **“OK”** (accept AI classification). Remaining options: full shot type enum (see §Photo classification below). Photos auto-reorder into canonical Photo Guide sequence (hero, angle, detail, backstamp, scale, imperfection, underside, grouping, lifestyle, measurement, extra). Operator can drag-reorder after confirming classifications.
  - **Photo checklist** — which recommended shot types appear present/missing, derived from the classifications above. E.g. “Missing: backstamp, scale.”
  - **Plain-language issues** — e.g. “Background is busy; consider a retake” (advisory only; does not block).
  - **Suggested identification** — maker, pattern, item type, era (if inferable).
  - **Suggested era** — `suggested_when_made` (Etsy enum value, e.g. `1970s`); inferred from labels, markings, style, Google results.
  - **Suggested category** — `suggested_taxonomy_id` and `suggested_taxonomy_path` (Etsy numeric ID + human-readable path).
  - **Suggested materials** — `suggested_materials` (array of material strings, e.g. `["ceramic", "glaze"]`).
  - **Suggested dimensions** — `suggested_dimensions` (if scale reference photo present; advisory only).
  - **Suggested list-price range** — `suggested_list_price`, optional `suggested_price_low` / `suggested_price_high`, `price_confidence` (`high` \| `medium` \| `low`), `price_rationale` (short text citing Google screenshot when present).
- Buttons: **Looks right** | **Fix identification** (inline edit one line) | **Continue**

**Step 4 — Confirm price**

- Show AI suggestion when `price_confidence` is not `low`.
- When `low` or operator skipped Google: copy “We couldn’t price this confidently — what would you usually list it for?”
- Controls:
  - **Use suggested price** (single value or midpoint of range)
  - **I know the price** — number input → maps to `sale_revenue`
  - **Skip for now** — `sale_revenue` null; listing still composed; outstanding may flag later
- Optional (v1 notes field only): **Accept-offer range** stored in `listing_pricing_shipping_notes` text (e.g. “Accept offers $72–$78”) when operator provides it.

**Step 4b — Era, category, and materials (Etsy-required)**

These fields are **required by Etsy's API** to create and activate a listing. The AI suggests values from photo analysis and Google results; the operator confirms or overrides.

- **When was it made?** — Dropdown pre-filled with AI `suggested_when_made`. Full Etsy `when_made` enum: `made_to_order`, `2020_2026`, `2010_2019`, `2004_2009`, `2000_2003`, `1990s`, `1980s`, `1970s`, `1960s`, `1950s`, `1940s`, `1930s`, `1920s`, `1910s`, `1900s`, `1800s`, `1700s`, `before_1700`. Required for vintage items. Maps to `etsy_when_made` column (ADR-017).
- **Category** — Search/browse selector pre-filled with AI `suggested_taxonomy_path`. Operator can search Etsy categories by keyword. Must resolve to a numeric `etsy_taxonomy_id`. Maps to `etsy_taxonomy_id` column (ADR-017). Also sets `listing_category_path` for display.
- **Materials** — Tag-style multi-value input pre-filled with AI `suggested_materials` (e.g. "ceramic", "glaze", "porcelain"). Optional but strongly recommended — Etsy uses materials as a search filter. Maps to `materials` JSON array column (ADR-017).
- **Dimensions & weight** (optional) — If AI detects a scale reference photo, suggest dimensions. Otherwise show empty fields. Fields: length/width/height (in or cm) + weight (oz or lb). Maps to `item_weight`, `item_length`, `item_width`, `item_height` columns.
- Buttons: **Continue** (era and category required; materials/dimensions optional with "skip" affordance)

**Step 5 — Quick confirms (no blank essays)**

- Up to **6 confirm cards**, each with AI **suggested answer** pre-filled:
  1. What is this item? (may pre-fill from step 3)
  2. What's included / quantity?
  3. Condition and any flaws to mention?
  4. Who buys this? (collector, gift, decor style)
  5. What material(s) is this made of? (pre-filled from step 4b materials if provided; allows refinement)
  6. Anything special we should highlight? (optional skip)
- Each card: suggested text + **Yes, use this** | **Edit** (short textarea only if edit).
- Operator never sees internal field names (`listing_title_strategy`, etc.).

**Step 6 — Compose listing (AI generation)**

Step 6 sends ALL non-empty pictures (picture_1..10 + condition_picture_1..5) plus the structured data from steps 1–5 to the AI provider. The AI response populates listing_title, listing_description, listing_tags, and the listing_* strategy fields. If the AI call fails, the user can retry or switch to manual entry. The listing_draft_state transitions from `draft` to `generated` on success.

- Client calls `POST /api/listing-coach/compose` with confirm answers + analyze session payload reference (client-held) + images (re-sent or session id — see API).
- AI returns final Etsy-facing content **and** hidden template fields (see Response contract).
- UI shows **read-only preview** styled per ADR-071:
  - Title
  - Description (formatted)
  - 13 tags as chips
  - Suggested category path (if any)
  - Listing quality score (ADR-068) with top 3 improvement hints
- Buttons: **Save to inventory** | **Back to edit answers** | **Start over**

**Step 7 — Save**

- Prompt for **item number** (required) and optional short **internal description** (defaults from identification).
- Client calls `POST /api/listing-coach/complete`:
  - Creates inventory row (`status`: `Draft` or `In stock` per operator choice; default `In stock`).
  - Uploads all session images to `picture_1…` / `condition_picture_1…` via ADR-026 storage.
  - Writes listing fields, template sections, `sale_revenue`, `listing_draft_state`: `generated`, `listing_draft_source`: `integrated_ai`.
- Success: toast + navigate to **Inventory** with `?itemId=<id>&openWorkshop=1` (listing workshop expanded).
- Operator may **Approve draft** and publish later (ADR-023 lifecycle unchanged).
- **Publishing gate:** Publishing is only enabled when listing_draft_state = `approved`. The user must review and approve the generated content (via the listing workshop approve action) before publishing to Etsy becomes available.

### Hidden template mapping (server-side)

The compose step **must** populate these inventory columns from confirm answers + AI (operator does not edit directly in coach):

| Column                           | Source                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| `listing_title_strategy`         | AI from confirms + guidance                                                                |
| `listing_product_story`          | AI from confirms                                                                           |
| `listing_condition_clarity`      | AI from confirms + condition photos                                                        |
| `listing_attributes`             | AI from confirms + Google/vision                                                           |
| `listing_pricing_shipping_notes` | Price step + optional accept-offer note                                                    |
| `listing_quality_checklist`      | AI self-check against Photo Guide + Keywords rules                                         |
| `listing_title`                  | AI final                                                                                   |
| `listing_description`            | AI final                                                                                   |
| `listing_tags`                   | AI final (exactly up to 13, Keywords 101 rules)                                            |
| `listing_category_path`          | AI optional                                                                                |
| `etsy_when_made`                 | Step 4b era confirmation (Etsy enum, e.g. `1970s`)                                         |
| `etsy_taxonomy_id`               | Step 4b category confirmation (Etsy numeric ID)                                            |
| `materials`                      | Step 4b materials confirmation (JSON array)                                                |
| `item_weight`                    | Step 4b dimensions (optional)                                                              |
| `item_weight_unit`               | Step 4b dimensions (optional; default `oz`)                                                |
| `item_length`                    | Step 4b dimensions (optional)                                                              |
| `item_width`                     | Step 4b dimensions (optional)                                                              |
| `item_height`                    | Step 4b dimensions (optional)                                                              |
| `item_dimensions_unit`           | Step 4b dimensions (optional; default `in`)                                                |
| `video_path`                     | Step 1 video upload (optional)                                                             |
| `picture_classifications`        | Step 3 AI auto-classify + operator overrides (JSON array; see §Photo classification)       |
| `sale_revenue`                   | Price step                                                                                 |
| `condition_code`                 | Suggested in analyze; operator confirm in step 5; may default `Good` if unset with warning |
| `description`                    | Item number companion short description                                                    |

### Photo classification

The AI auto-classifies each uploaded item photo into a shot type from the Photo Guide's 10-Shot Recipe. This enables systematic, repeatable photo ordering across all listings.

#### Shot type enum (canonical values)

| Value           | Label (UI)        | Photo Guide slot | Purpose                                      |
| --------------- | ----------------- | ---------------- | --------------------------------------------- |
| `hero`          | Hero              | 1                | Full item, straight on, clean and bright      |
| `angle`         | Angle             | 2                | 45-degree view showing depth                  |
| `detail`        | Detail            | 3                | Close-up of pattern, texture, edges           |
| `backstamp`     | Backstamp/Marking | 4                | Maker's mark, label, stamp (vintage essential) |
| `scale`         | Scale             | 5                | Item with ruler, hand, or familiar object     |
| `imperfection`  | Imperfection      | 6                | Crazing, chips, scratches, wear               |
| `underside`     | Underside         | 7                | Bottom view, structure, authenticity           |
| `grouping`      | Grouping          | 8                | All pieces in a set arranged together          |
| `lifestyle`     | Lifestyle         | 9                | In-context staging (table, shelf, etc.)        |
| `measurement`   | Measurement       | 10               | Ruler or tape directly against item            |
| `extra`         | Extra             | 11+              | Additional views not fitting above categories  |

#### How it works

1. **Upload (Step 1):** Operator uploads photos in any order. No classification yet.
2. **Analyze (Step 3):** AI examines each photo and returns a `photo_classifications` array mapping each photo index to a shot type. The AI prompt includes the Photo Guide shot type definitions.
3. **Review UI (Step 3):** Each photo thumbnail displays:
   - The AI-assigned shot type as a small label badge (e.g. "Hero", "Detail")
   - A compact dropdown below or on the badge. The dropdown options are:
     1. **OK** (accept AI classification) — shown first, pre-selected
     2. Hero
     3. Angle
     4. Detail
     5. Backstamp/Marking
     6. Scale
     7. Imperfection
     8. Underside
     9. Grouping
     10. Lifestyle
     11. Measurement
     12. Extra
   - If the operator changes the dropdown, the label updates immediately.
4. **Auto-reorder:** After all classifications are confirmed (or left as "OK"), photos are reordered into canonical Photo Guide sequence: hero first, then angle, detail, backstamp, scale, imperfection, underside, grouping, lifestyle, measurement, extra. Within the same type, original upload order is preserved. Operator can still drag-reorder after auto-sort.
5. **Persistence (Complete):** The final classifications are stored as a JSON array in `inventory.picture_classifications`. Format: `[{"slot":1,"type":"hero"},{"slot":2,"type":"angle"},...]`. This allows the inventory detail panel and future re-listings to display and maintain consistent ordering.

#### Photo checklist (derived)

The present/missing shot checklist in Step 3 is derived from the classifications:
- **Present:** shot types that have at least one classified photo
- **Missing:** shot types from the recommended set (`hero`, `detail`, `backstamp`, `scale`, `imperfection`) that have no photo. Advisory only, does not block.

#### Condition photos

Condition photos (`condition_picture_1..5`) are **not** classified with this system. They are always categorized as condition documentation and listed separately in the UI.

#### Inventory detail panel (ADR-030)

When editing an existing item's photos in the inventory detail panel, each photo thumbnail shows its stored classification as a read-only badge. The dropdown is available for reclassification. Changing a classification triggers a reorder suggestion (operator confirms or dismisses). New photos added outside the coach default to `extra` unless the operator assigns a type.

### AI guidance inputs (mandatory on every analyze/compose call)

Server loads the same guidance bundle as integrated generation (ADR-023):

- `documents/etsy-listing-template-and-requirements.md`
- `system/tips/How_to_Win_on_Etsy.md`
- `system/tips/Etsy_Photo_Guide.md`

Prompt must instruct the model to:

- Treat **Google screenshot images** as comparable listings and prices when present.
- Never invent maker/pattern not supported by photos or Google results.
- State low confidence explicitly for price and identification.
- Follow Etsy compliance (accurate condition, no misleading claims).

### API surface (ADR-018 §29)

All routes: **App auth** (`requireEtsyAccessToken`; local mode allowed without Etsy token per auth-session). **Integrated AI required** — 503 with actionable message if AI not configured.

**§29. Listing Coach (ADR-072)**

| Method | Path                          | Purpose                                                                                           |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------- |
| POST   | `/api/listing-coach/analyze`  | Photo + optional Google images → review, identification, price suggestion, confirm question seeds |
| POST   | `/api/listing-coach/compose`  | Confirm answers + images → full listing + template fields                                         |
| POST   | `/api/listing-coach/complete` | Create inventory, store pictures, persist all fields                                              |

**Request — analyze**

- `Content-Type: multipart/form-data`
- Fields:
  - `item_photos[]` — 1–20 files (required ≥1)
  - `condition_photos[]` — 0–5 files (optional)
  - `google_photos[]` — 0–3 files (optional)
  - `video` — 0–1 video file (MP4/MOV, max 100 MB, optional)
- Validation: ADR-026 image rules per file; video validated for format and size.

**Response — analyze (200)**

```json
{
  "ok": true,
  "photo_review": {
    "classifications": [
      { "photo_index": 0, "type": "hero", "confidence": "high" },
      { "photo_index": 1, "type": "detail", "confidence": "high" },
      { "photo_index": 2, "type": "angle", "confidence": "medium" },
      { "photo_index": 3, "type": "backstamp", "confidence": "low" }
    ],
    "suggested_order": [0, 2, 1, 3],
    "present_shots": ["hero", "angle", "detail", "backstamp"],
    "missing_shots": ["scale", "imperfection"],
    "advisories": ["Consider a plain background for the hero photo."]
  },
  "suggested_identification": "Vintage Fiesta ware pitcher, Homer Laughlin, red glaze",
  "suggested_condition_code": "Excellent",
  "price": {
    "suggested_list_price": 65,
    "suggested_price_low": 55,
    "suggested_price_high": 75,
    "confidence": "medium",
    "rationale": "Google results show similar red Fiesta pitchers listed $58–72."
  },
  "suggested_when_made": "1970s",
  "suggested_taxonomy_id": 12345,
  "suggested_taxonomy_path": "Home & Living > Kitchen & Dining > Serveware > Pitchers",
  "suggested_materials": ["ceramic", "glaze"],
  "suggested_dimensions": {
    "length": null, "width": null, "height": 9.5,
    "unit": "in", "note": "Estimated from scale photo"
  },
  "confirm_cards": [
    { "id": "what_is_it", "question": "What is this item?", "suggested_answer": "..." },
    { "id": "included", "question": "What's included?", "suggested_answer": "..." },
    {
      "id": "condition",
      "question": "What condition issues should buyers know?",
      "suggested_answer": "..."
    },
    { "id": "buyer", "question": "Who is this for?", "suggested_answer": "..." },
    { "id": "materials", "question": "What material(s) is this made of?", "suggested_answer": "Ceramic with glazed finish" },
    {
      "id": "special",
      "question": "Anything special to highlight?",
      "suggested_answer": "",
      "optional": true
    }
  ]
}
```

**Request — compose**

- `multipart/form-data` or JSON + separate image re-upload (implementation choice; **images must be included on every compose call** — do not generate without full visual context per etsy-listing-template §3).
- Body fields:
  - Same photo fields as analyze
  - `confirm_answers`: JSON array `{ id, answer }` (required ids: `what_is_it`, `included`, `condition`, `buyer`; `materials` and `special` optional)
  - `price`: `{ sale_revenue?: number | null, accept_offer_note?: string }`
  - `identification_override?: string`
  - `when_made`: string (Etsy enum, from step 4b confirmation)
  - `taxonomy_id`: number (Etsy numeric ID, from step 4b confirmation)
  - `materials`: string[] (from step 4b confirmation)
  - `dimensions`: `{ length?, width?, height?, unit?, weight?, weight_unit? }` (optional, from step 4b)

**Response — compose (200)**

```json
{
  "ok": true,
  "listing_title": "...",
  "listing_description": "...",
  "listing_tags": "tag1, tag2, ...",
  "listing_category_path": "Home & Living > ...",
  "listing_title_strategy": "...",
  "listing_product_story": "...",
  "listing_condition_clarity": "...",
  "listing_attributes": "...",
  "listing_pricing_shipping_notes": "...",
  "listing_quality_checklist": "...",
  "quality_score": { "score": 82, "hints": ["Add scale photo", "Tag 13/13"] }
}
```

**Request — complete**

```json
{
  "item_number": "TCT-2026-042",
  "description": "Red Fiesta pitcher",
  "status": "In stock",
  "condition_code": "Excellent",
  "sale_revenue": 65,
  "etsy_when_made": "1970s",
  "etsy_taxonomy_id": 12345,
  "materials": ["ceramic", "glaze"],
  "item_weight": 32,
  "item_weight_unit": "oz",
  "item_length": 6,
  "item_width": 6,
  "item_height": 9.5,
  "item_dimensions_unit": "in",
  "picture_classifications": [
    {"slot": 1, "type": "hero"},
    {"slot": 2, "type": "angle"},
    {"slot": 3, "type": "detail"},
    {"slot": 4, "type": "backstamp"}
  ],
  "compose": {
    /* full compose response fields */
  }
}
```

Plus `multipart` photo fields (same as analyze) **or** server-side temp storage from analyze/compose session (post-v1 optimization; v1 may re-upload on complete).

**Response — complete (201)**

```json
{
  "ok": true,
  "item_id": 123,
  "item_number": "TCT-2026-042",
  "picture_count": 4
}
```

Errors: standard envelope; 400 validation; 503 `AI_NOT_CONFIGURED`; 429 AI rate limit.

### UI / frontend (ADR-024)

- Page: `src/app/(app)/listing-coach/page.tsx`
- Components under `src/components/listing-coach/`:
  - `PhotoPasteZone` — clipboard paste handler (`paste` event → `clipboardData.items` image/\*)
  - `GoogleResultsPasteZone`
  - `ConfirmCard`
  - `ListingPreview`
- Inventory page: primary button **Add with Listing Coach** → `/listing-coach`
- Clipboard paste: document-level or zone-focused; support multiple sequential pastes until slot limits.

### Relationship to ADR-023 modes

| ADR-023 mode             | Relationship                                                                     |
| ------------------------ | -------------------------------------------------------------------------------- |
| Manual                   | Still available in listing workshop after coach save                             |
| Integrated AI (one-shot) | Still available on existing items; coach is **recommended** for **new** listings |
| Portable import          | Unchanged                                                                        |

Listing Coach is a **fourth operator-facing path** specialized for new listings; it uses **integrated AI** internally and sets `listing_draft_source = integrated_ai`.

### Activity log (ADR-037)

Log on complete:

- `action`: `listing.coach_complete`
- `entity_type`: `inventory`
- `entity_id`: new item id
- `detail_json`: `{ picture_count, video_included, price_confidence, google_photos_count, when_made, taxonomy_id, materials_count }`

### Outstanding (ADR-020)

No new outstanding type. Existing rules apply after save (e.g. missing `sale_revenue` if skipped, draft not approved). Items saved without `etsy_when_made` or `etsy_taxonomy_id` will appear on outstanding as "Missing era/category for Etsy publish" (ADR-020 Type 9).

### Validation (ADR-021)

**Analyze (`POST /api/listing-coach/analyze`)**

| Rule                                              | Error                              |
| ------------------------------------------------- | ---------------------------------- |
| ≥1 `item_photos[]`                                | 400 `fields.item_photos`           |
| ≤20 item photos, ≤5 condition, ≤3 google          | 400 `BATCH_TOO_LARGE` or field max |
| Each file passes ADR-026 (type, size, dimensions) | 400 per file                       |
| AI configured                                     | 503 `AI_NOT_CONFIGURED`            |

**Compose (`POST /api/listing-coach/compose`)**

| Rule                                                                                                                              | Error                                                 |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Same photo rules as analyze                                                                                                       | 400                                                   |
| `confirm_answers` non-empty array; required card ids present (`what_is_it`, `included`, `condition`, `buyer`); `materials` and `special` optional | 400 `fields.confirm_answers`                          |
| Each answer ≤ 500 chars                                                                                                           | 400 field length                                      |
| `sale_revenue` if provided: number > 0                                                                                            | 400 `fields.sale_revenue`                             |
| `when_made` if provided: must be valid Etsy enum (see ADR-017 §1a)                                                               | 400 `fields.when_made`                                |
| `taxonomy_id` if provided: positive integer                                                                                       | 400 `fields.taxonomy_id`                              |
| `materials` if provided: array of strings, each ≤ 45 chars, alphanumeric+spaces only                                             | 400 `fields.materials`                                |
| AI returns valid title, description, ≥1 tag                                                                                       | 500 `LISTING_COMPOSE_FAILED` (retry once client-side) |

**Complete (`POST /api/listing-coach/complete`)**

| Rule                                                                                      | Error               |
| ----------------------------------------------------------------------------------------- | ------------------- |
| `item_number` non-empty, unique (ADR-021 inventory create)                                | 400 / 409 duplicate |
| `compose` object includes `listing_title`, `listing_description`, `listing_tags`          | 400                 |
| `condition_code` one of ADR-002 enum if set                                               | 400                 |
| `etsy_when_made` if provided: valid Etsy enum (ADR-017 §1a)                              | 400                 |
| `etsy_taxonomy_id` if provided: positive integer                                         | 400                 |
| `materials` if provided: array of valid material strings                                  | 400                 |
| `item_weight` if provided: number > 0; `item_weight_unit` must accompany                 | 400                 |
| dimension fields if provided: numbers > 0; `item_dimensions_unit` must accompany         | 400                 |
| `status` one of inventory status enum; default `In stock`                                 | 400                 |
| Photos re-uploaded (v1) same as analyze minimum                                           | 400                 |
| On success: `listing_draft_state` = `generated`, `listing_draft_source` = `integrated_ai` | —                   |

Post-save listing content must pass same ADR-021 / ADR-068 checks as integrated one-shot generation before **Approve** (operator step).

### Error codes (API envelope)

| Code                     | HTTP | When                              | User message (example)                                  |
| ------------------------ | ---- | --------------------------------- | ------------------------------------------------------- |
| `AI_NOT_CONFIGURED`      | 503  | No `ai.api_key`                   | "Listing Coach needs AI set up in Config first."        |
| `LISTING_ANALYZE_FAILED` | 500  | AI/vision error on analyze        | "We couldn't review your photos. Try again."            |
| `LISTING_COMPOSE_FAILED` | 500  | AI/parse error on compose         | "We couldn't write the listing. Try again."             |
| `VALIDATION_ERROR`       | 400  | Missing photos, item number, etc. | Field-level `fields` object                             |
| `DUPLICATE_ITEM_NUMBER`  | 409  | `item_number` exists              | "That item number is already in use."                   |
| `BATCH_TOO_LARGE`        | 400  | Too many images in one request    | "Too many photos (max 20 item, 5 condition, 3 Google)." |

Actions array must include: link to Config for 503; retry for 500; fix field for 400.

### AI prompt contract

Two calls — **analyze** (vision + guidance) and **compose** (vision + guidance + confirms). Both use integrated AI (ADR-023) with `temperature` ≤ 0.3.

**Analyze — system intent**

- Role: Etsy vintage listing coach for Trudy's Classic Treasures.
- Inputs: all item + condition images; optional Google screenshot images labeled `GOOGLE_VISUAL_SEARCH_RESULTS`.
- Load guidance bundle (template, How_to_Win, Photo_Guide).
- Output: **strict JSON only** matching analyze response schema (§ API surface).
- Rules:
  - Photo classification: for each item photo, assign a shot type from the canonical enum (`hero`, `angle`, `detail`, `backstamp`, `scale`, `imperfection`, `underside`, `grouping`, `lifestyle`, `measurement`, `extra`) with a confidence level (`high`, `medium`, `low`). Return as `photo_review.classifications[]`. Also return `suggested_order` — photo indices sorted in canonical Photo Guide sequence.
  - Photo checklist: derive present/missing shot types from classifications. Do not block flow on missing shots — advisories only.
  - Identification: conservative; cite Google screenshot when used.
  - Price: prefer Google screenshot comps; else vision-only estimate with `confidence: low`.
  - Confirm cards: write suggested answers Trudy can accept with one tap (plain English, ≤2 sentences each).

**Compose — system intent**

- Same images + guidance + `confirm_answers` + final `sale_revenue` / accept-offer note.
- Output: **strict JSON** matching compose response schema.
- Rules:
  - Title: searchable, readable, Etsy length limits; important words first (How to Win Ch.2).
  - Tags: exactly up to 13, comma-separated in `listing_tags`; Keywords 101 (no category duplication, multi-word phrases, buyer intent).
  - Description: structure from How to Win Ch.6 (what it is, included, condition, why special, size/care if known, shipping note placeholder).
  - Template fields (`listing_*_strategy`, etc.): populated for audit/edit in workshop; not shown in coach UI.
  - `quality_score`: compute via same rubric as ADR-068 server-side after parse; return top hints in response.
  - Never claim mint condition if condition photos or confirms mention flaws.

**Token budget:** use Config `ai.token_budget`; analyze may use up to 2× default when >5 images (implementer may raise cap to 4000 for coach only).

### UI copy (user-facing — ADR-071 tone)

| Step           | Heading                          | Body / hint                                                                                                                                      |
| -------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0 Welcome      | Listing Coach                    | Paste your photos, add Google results if you have them, confirm a few answers — we'll write the listing. You don't need to write marketing copy. |
| 1 Photos       | Item photos                      | Click here, then press ⌘V to paste from Photos. First photo becomes the main image.                                                              |
| 1 Photos (alt) |                                  | Or drag photos here, or choose files.                                                                                                            |
| 2 Google       | Google search results (optional) | In Photos, right-click your best photo → Search with Google. Screenshot the results and paste here (⌘V).                                         |
| 2 Google skip  |                                  | Skip — I didn't use Google                                                                                                                       |
| 3 Review       | What we found                    | Plain list: photo tips, identification, suggested price.                                                                                         |
| 3 Review CTA   | Looks right                      | Continue                                                                                                                                         |
| 4 Price        | Suggested price                  | Show `$low – $high` or single value + rationale. Buttons: **Use this price** · **I know the price** · **Skip for now**                           |
| 4b Era/Cat     | Era, category & details          | When was it made? What category? What materials? Dimensions/weight? AI pre-fills; you confirm.                                                   |
| 5 Confirms     | Quick checks                     | One card at a time or stacked; **Yes, use this** · **Edit**                                                                                      |
| 6 Preview      | Your listing                     | Read-only title, description, tags, quality score. **Save to inventory** · **Back** · **Start over**                                             |
| 7 Save         | Item number                      | Enter your item number (e.g. TCT-2026-042). Optional short description. **Save**                                                                 |
| Error AI       | AI not set up                    | Go to Config → AI settings, add your key, and test connection.                                                                                   |
| Success        | Saved                            | Opening your new item in Inventory. Review and approve when ready.                                                                               |

Button variants: primary = accent; secondary = neutral; destructive = Start over only (ConfirmDialog ADR-032).

### Focus mode layout (ADR-024 / ADR-071)

On `/listing-coach`:

- Show **AppHeader** (Etsy status, local-mode banner) but **hide TabBar** to reduce distraction (implement via layout segment or page flag).
- Max content width ~720px centered; step indicator (1–7) optional dots, not required v1.
- `PhotoPasteZone` min-height 200px; dashed border `var(--ui-border)`; focus ring on keyboard focus for a11y (ADR-045).
- Paste handler: listen on zone `onPaste` and when zone focused; also global paste when step=1 and no text input focused.

### Clipboard paste behavior (ADR-033 alignment)

- Accept `image/png`, `image/jpeg`, `image/webp`, `image/gif` from clipboard.
- Multiple sequential pastes append to grid until slot limits.
- macOS Photos copy may paste as PNG or JPEG — both accepted.
- Google screenshot paste uses same handler in separate zone (does not count toward item photo slots; sent as `google_photos[]` only).

## Consequences

### Positive

- Matches Trudy’s real Mac workflow (Photos copy, Google Visual Search).
- Minimal writing — confirm and edit short suggestions only.
- Marketing docs enforced in every AI call.
- Single app, direct save to inventory — no import/export for normal path.
- Price guidance respects Google comps when provided.

### Negative

- Requires integrated AI configuration (not usable fully offline).
- Re-uploading images on analyze/compose/complete may be slow on v1 (acceptable for local app).
- Google step is manual; operator must remember to paste screenshot.
- AI price estimates without Google remain approximate; operator override is essential.

## Notes

- User-facing walkthrough: [system/tips/Listing_Coach_Guide.md](../../system/tips/Listing_Coach_Guide.md).
- Implementation checklist: [listing-authoring-task-cards.md](../listing-authoring-task-cards.md) §4.
- **post-v1:** Server-side coach session cache to avoid image re-upload; optional deep link from Photos share extension; automated comp lookup only if compliant API available.
- **Impacted ADRs:** 018 (§29), 023, 024, 030, 033, 037, 068, 070, 071; [ui-design.md](../ui-design.md) §5.3; [etsy-listing-template-and-requirements.md](../etsy-listing-template-and-requirements.md) §7.
- **Implementation scope (phases, hold context, acceptance test):** [LISTING_COACH_SCOPE.md](../LISTING_COACH_SCOPE.md).

---

## Revision: 2026-06-14 — 4-step flow, AI accuracy, auto-video

### Summary of changes

The original 8-step wizard has been consolidated into a **4-step flow**:

| New step | Old steps replaced | What happens |
|---|---|---|
| Step 1: Input | Steps 1-2 | Photos + basic details + collapsible research in one screen |
| Step 2: Research | Steps 3-6 | Combined `researchAndCompose` AI call with web search, evidence tags, citations |
| Step 3: Review | Step 6 preview | Read-only listing preview with quality score |
| Step 4: Save | Step 7 | Save to inventory + auto-generate video |

### AI accuracy measures

Four measures baked into the system prompt and output schema:

1. **Evidence tagging** — `photo`, `web_search`, `operator_input`, or `unverified` on every factual field
2. **Confidence gating** — `high`, `medium`, or `low` on every factual field; low = "Needs verification"
3. **Web search citations** — `citations[]` array with claim, source, and URL
4. **Etsy compliance self-check** — `compliance_check` object verifying condition disclosure, no misleading claims, correct categorization, keyword accuracy

### Automatic video generation

After save, the system generates an Etsy-compliant slideshow video from uploaded photos:

- Uses `ffmpeg-static` (bundled binary) via Node `child_process`
- 1080x1080 square MP4, H.264, 8 seconds, no audio
- Photos sequenced by AI classification: hero, detail, backstamp/markings, defects
- Ken Burns zoom/pan effect with crossfade transitions
- Stored at `uploads/inventory/<item_id>/video/listing-video.mp4`
- API: `POST /api/listing-coach/video`

### New types added to `listing-coach.ts`

- `EvidenceSource`: `"photo" | "web_search" | "operator_input" | "unverified"`
- `FieldEvidence`: `{ value, evidence, confidence, source_detail? }`
- `Citation`: `{ claim, source, url? }`
- `ComplianceCheck`: `{ condition_accurately_disclosed, no_misleading_claims, vintage_categorization_correct, keywords_match_item, issues[] }`

### New files

- `src/lib/video-generator.ts` — ffmpeg-based video generation
- `src/app/api/listing-coach/video/route.ts` — video generation API endpoint

### Modified files

- `src/lib/listing-coach.ts` — added `researchAndCompose()`, accuracy types, comprehensive prompt
- `src/lib/listing-coach-multipart.ts` — added `datePurchased`, `purchasePrice`, `conditionCode`, `conditionNotes`, `description`, `storeCategory` fields
- `src/app/api/listing-coach/analyze/route.ts` — now calls `researchAndCompose` instead of `analyzeListingCoach`
- `src/components/listing-coach/types.ts` — added `ResearchResponse`, `FieldEvidence`, `Citation`, `ComplianceCheck`, `EvidenceBadge` types; updated `CoachStep` to 4-step enum
- `src/app/(app)/listing-coach/page.tsx` — complete rewrite to 4-step flow with evidence UI and auto-video

---

## Revision: 2026-06-15 — Two-phase flow with AI refinement

### Summary of changes

The 4-step flow has been further consolidated into a **2-phase flow** based on operator feedback. The core insight: there are two distinct operations — (1) logging the purchase, and (2) the AI taking over to produce and refine the listing.

| New phase | Old steps replaced | What happens |
|---|---|---|
| Phase 1: Log the Purchase | Step 1 (Input) | Photos + purchase details (price, date, condition, vendor, store category) |
| Phase 2: Unified Form | Steps 2-4 (Research + Review + Save) | Single editable form showing ALL fields (internal + Etsy) with AI refinement |

### Phase 1 input fields

Phase 1 collects all purchase-related data upfront so the AI has full context:

- Photos (item + condition) with **drag-and-drop reordering** (grab and move; Hero badge on first photo; x button to remove)
- Item description, date purchased, purchase price
- Condition code + condition notes
- Store category (with add-new)
- **Size & weight** — weight (oz/lb/g/kg) + L/W/H dimensions (in/cm)
- **Where I bought this** — vendor name, vendor shipping cost, reference #, purchase notes
- Optional: Google Visual Search screenshots or research text

### `CoachStep` enum change

```
Old: "welcome" | "input" | "research" | "review" | "save"
New: "welcome" | "input" | "form"
```

### Unified editable form (Phase 2)

After the AI research completes, ALL fields populate a single scrollable editable form organized in 8 sections:

1. **Identity & Financials** — item number, description, identification (with evidence badge), status, quantity, sale price (AI-recommended), purchase cost, shipping cost inbound, dates, category tags
2. **Condition** — condition code, condition notes (AI-enhanced to Etsy best practices)
3. **Etsy Listing** — listing title (with character count), description, tags (with chip preview), category path, taxonomy ID, era, materials, is supply
4. **Weight & Dimensions** — weight + unit, L/W/H + unit
5. **Listing Workshop** — all 6 internal strategy fields (title strategy, product story, condition clarity, attributes, pricing notes, quality checklist)
6. **Where I Bought This** — vendor name, vendor shipping, reference #, purchase notes; creates a `purchases` record on save
7. **Internal Notes** — private notes (not sent to Etsy)
8. **Photos & Quality** — photo classifications, quality score, citations, compliance issues

Listing content fields (title, description, tags, and all workshop fields) are now directly editable in the form instead of being read-only in a separate review step.

### AI refinement (new capability)

Two modes for iterative improvement without re-running the full research:

**Per-field "Fix" button:**
- Small "Fix" button next to every AI-generated field
- Click opens an inline text input: "What should the AI change?"
- Calls `POST /api/listing-coach/refine` with `mode: "field"`, field name, current value, and listing context
- AI returns corrected value for just that field

**Global "Fix it" box:**
- Textarea at the bottom of the form: "Tell the AI what's missing or needs improvement"
- Calls `POST /api/listing-coach/refine` with `mode: "global"` and full field context
- AI returns only the fields it changed; merged into form state
- Operator can iterate as many times as needed before saving

### New API endpoint: `POST /api/listing-coach/refine`

```
Request:
{
  mode: "field" | "global",
  field_name?: string,        // for field mode
  current_value?: string,     // for field mode
  instruction: string,        // what the AI should change
  context: {                  // current listing state
    identification, listing_title, listing_description, listing_tags,
    listing_category_path, listing_condition_clarity, listing_product_story,
    listing_attributes, listing_pricing_shipping_notes, listing_title_strategy,
    listing_quality_checklist, condition_code, condition_notes, materials, sale_price
  }
}

Response:
{
  ok: true,
  fields: { "<field_name>": "<new_value>", ... }
}
```

Auth: App (session cookie). No web search needed — uses listing context only. Lightweight AI call (~4000 token budget, 60s timeout).

### All inventory detail fields now saved from coach

The complete route now saves every field from the inventory detail panel:

| Category | Fields added in this revision |
|---|---|
| Financials | `quantity`, `shipping_cost` (inbound) |
| Categories | `category_tags` |
| Internal | `notes` (internal notes) |
| Etsy | `is_supply` |
| Vendor | Creates `purchases` record with `vendor_name`, `shipping_price`, `reference_number`, `notes` |

### Vendor purchase editing

The inventory detail panel (`InventoryDetailPanel.tsx`) now supports editing existing vendor purchases via an Edit button and modal that calls `PATCH /api/purchases/:id`.

### New files

- `src/app/api/listing-coach/refine/route.ts` — AI refinement endpoint

### Modified files

- `src/lib/listing-coach.ts` — added `refineListing()` function with per-field and global modes, `RefineListingInput`/`RefineListingResult` types
- `src/lib/listing-coach-complete.ts` — added `quantity`, `shippingCostInbound`, `categoryTags`, `internalNotes`, `isSupply`, vendor purchase fields; creates `purchases` record
- `src/app/api/listing-coach/complete/route.ts` — parses all new fields from form data
- `src/components/listing-coach/types.ts` — `CoachStep` reduced to `"welcome" | "input" | "form"`
- `src/components/inventory/InventoryDetailPanel.tsx` — added vendor purchase edit capability
- `src/components/listing-coach/PhotoPasteZone.tsx` — replaced arrow-button reordering with native drag-and-drop; added Hero badge, position numbers, and x-to-remove
- `src/app/(app)/listing-coach/page.tsx` — complete rewrite to 2-phase flow with unified editable form and AI refinement; Phase 1 includes size/weight and vendor fields
