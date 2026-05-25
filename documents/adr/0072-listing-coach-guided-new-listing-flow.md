# ADR-072: Listing Coach — guided new-listing flow (photos, Google Visual Search, AI compose)

## Status

Accepted

## Date

2026-05-24

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

| Entry point | Behavior |
| ----------- | -------- |
| **Inventory** tab → **Add new listing with Listing Coach** (primary CTA for new items) | Navigates to full-screen coach flow |
| **Inventory** tab → quick **Add item** (item number only) | Unchanged; coach optional later from listing workshop |
| Route | `/listing-coach` (App Router under `(app)` layout; may hide tab chrome — see ADR-024) |

User-facing name: **Listing Coach** (never “ADR-072” in UI).

### Operator constraints (v1)

| Constraint | Spec |
| ---------- | ---- |
| Platform | **macOS** — Photos app copy/paste is the primary photo intake |
| Etsy OAuth | **Not required** for coach analyze/compose/save (same as local inventory APIs per ADR-007 local-mode policy) |
| Integrated AI | **Required** for analyze and compose steps (`ai.api_key` in Config per ADR-034) |
| Google Visual Search | **Manual external step** — operator runs Search with Google in Photos; **pastes screenshot** into coach. No Google API integration in v1. |
| Live sold comps | **Not scraped** — price guidance uses AI reading of pasted Google results + vision; not automated Etsy/eBay comp APIs |

### Wizard steps (exact order)

Each step is one screen. Primary actions use ADR-071 button variants. Back navigation allowed until final save.

**Step 0 — Welcome**

- Copy: explain three things: paste photos, optional Google screenshot, confirm a few answers — app writes the listing.
- Button: **Start**

**Step 1 — Item photos (paste zone)**

- Large focused paste target: “Click here, then press ⌘V to paste photos from Photos.”
- Also: **Choose files…** (file picker backup) and drag-and-drop (ADR-033 limits: JPEG/PNG/WebP/GIF, max 15 MB each, max 10 item photos + 5 condition photos in v1 coach session).
- Thumbnail grid with reorder (first = hero) and remove per image.
- Minimum **1 item photo** to continue.
- Optional subsection: **Condition photos** (same paste/file/drag behavior; up to 5).

**Step 2 — Google Visual Search (optional but encouraged)**

- Instructions (plain language): In Photos, right-click the best photo → **Search with Google**. Copy or screenshot the results, then paste here (⌘V).
- Separate paste zone labeled **Google results** (screenshots only; 0–3 images).
- Buttons: **Continue** | **Skip — I didn’t use Google**

**Step 3 — AI photo review**

- Client calls `POST /api/listing-coach/analyze`.
- Server sends **all pasted item + condition photos** and **Google screenshot(s)** to integrated AI with marketing/photo guidance docs.
- UI shows:
  - **Photo checklist** — which recommended shots appear present/missing (group, detail, backstamp, scale, imperfections) per Photo Guide.
  - **Plain-language issues** — e.g. “Background is busy; consider a retake” (advisory only; does not block).
  - **Suggested identification** — maker, pattern, item type, era (if inferable).
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

**Step 5 — Quick confirms (no blank essays)**

- Up to **5 confirm cards**, each with AI **suggested answer** pre-filled:
  1. What is this item? (may pre-fill from step 3)
  2. What's included / quantity?
  3. Condition and any flaws to mention?
  4. Who buys this? (collector, gift, decor style)
  5. Anything special we should highlight? (optional skip)
- Each card: suggested text + **Yes, use this** | **Edit** (short textarea only if edit).
- Operator never sees internal field names (`listing_title_strategy`, etc.).

**Step 6 — Compose listing**

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
- Success: toast + navigate to **Inventory** with `?itemId=<id>` and listing workshop open.
- Operator may **Approve draft** and publish later (ADR-023 lifecycle unchanged).

### Hidden template mapping (server-side)

The compose step **must** populate these inventory columns from confirm answers + AI (operator does not edit directly in coach):

| Column | Source |
| ------ | ------ |
| `listing_title_strategy` | AI from confirms + guidance |
| `listing_product_story` | AI from confirms |
| `listing_condition_clarity` | AI from confirms + condition photos |
| `listing_attributes` | AI from confirms + Google/vision |
| `listing_pricing_shipping_notes` | Price step + optional accept-offer note |
| `listing_quality_checklist` | AI self-check against Photo Guide + Keywords rules |
| `listing_title` | AI final |
| `listing_description` | AI final |
| `listing_tags` | AI final (exactly up to 13, Keywords 101 rules) |
| `listing_category_path` | AI optional |
| `sale_revenue` | Price step |
| `condition_code` | Suggested in analyze; operator confirm in step 5; may default `Good` if unset with warning |
| `description` | Item number companion short description |

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

| Method | Path | Purpose |
| ------ | ---- | ------- |
| POST | `/api/listing-coach/analyze` | Photo + optional Google images → review, identification, price suggestion, confirm question seeds |
| POST | `/api/listing-coach/compose` | Confirm answers + images → full listing + template fields |
| POST | `/api/listing-coach/complete` | Create inventory, store pictures, persist all fields |

**Request — analyze**

- `Content-Type: multipart/form-data`
- Fields:
  - `item_photos[]` — 1–10 files (required ≥1)
  - `condition_photos[]` — 0–5 files (optional)
  - `google_photos[]` — 0–3 files (optional)
- Validation: ADR-026 image rules per file.

**Response — analyze (200)**

```json
{
  "ok": true,
  "photo_review": {
    "present_shots": ["hero", "detail"],
    "missing_shots": ["backstamp", "scale"],
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
  "confirm_cards": [
    { "id": "what_is_it", "question": "What is this item?", "suggested_answer": "..." },
    { "id": "included", "question": "What's included?", "suggested_answer": "..." },
    { "id": "condition", "question": "What condition issues should buyers know?", "suggested_answer": "..." },
    { "id": "buyer", "question": "Who is this for?", "suggested_answer": "..." },
    { "id": "special", "question": "Anything special to highlight?", "suggested_answer": "", "optional": true }
  ]
}
```

**Request — compose**

- `multipart/form-data` or JSON + separate image re-upload (implementation choice; **images must be included on every compose call** — do not generate without full visual context per etsy-listing-template §3).
- Body fields:
  - Same photo fields as analyze
  - `confirm_answers`: JSON array `{ id, answer }`
  - `price`: `{ sale_revenue?: number | null, accept_offer_note?: string }`
  - `identification_override?: string`

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
  "compose": { /* full compose response fields */ }
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
  - `PhotoPasteZone` — clipboard paste handler (`paste` event → `clipboardData.items` image/*)
  - `GoogleResultsPasteZone`
  - `ConfirmCard`
  - `ListingPreview`
- Inventory page: primary button **Add new listing with Listing Coach** → `/listing-coach`
- Clipboard paste: document-level or zone-focused; support multiple sequential pastes until slot limits.

### Relationship to ADR-023 modes

| ADR-023 mode | Relationship |
| ------------ | ------------ |
| Manual | Still available in listing workshop after coach save |
| Integrated AI (one-shot) | Still available on existing items; coach is **recommended** for **new** listings |
| Portable import | Unchanged |

Listing Coach is a **fourth operator-facing path** specialized for new listings; it uses **integrated AI** internally and sets `listing_draft_source = integrated_ai`.

### Activity log (ADR-037)

Log on complete:

- `action`: `listing.coach_complete`
- `entity_type`: `inventory`
- `entity_id`: new item id
- `detail_json`: `{ picture_count, price_confidence, google_photos_count }`

### Outstanding (ADR-020)

No new outstanding type. Existing rules apply after save (e.g. missing `sale_revenue` if skipped, draft not approved).

### Validation (ADR-021)

**Analyze (`POST /api/listing-coach/analyze`)**

| Rule | Error |
| ---- | ----- |
| ≥1 `item_photos[]` | 400 `fields.item_photos` |
| ≤10 item photos, ≤5 condition, ≤3 google | 400 `BATCH_TOO_LARGE` or field max |
| Each file passes ADR-026 (type, size, dimensions) | 400 per file |
| AI configured | 503 `AI_NOT_CONFIGURED` |

**Compose (`POST /api/listing-coach/compose`)**

| Rule | Error |
| ---- | ----- |
| Same photo rules as analyze | 400 |
| `confirm_answers` non-empty array; required card ids present (`what_is_it`, `included`, `condition`, `buyer`); `special` optional | 400 `fields.confirm_answers` |
| Each answer ≤ 500 chars | 400 field length |
| `sale_revenue` if provided: number > 0 | 400 `fields.sale_revenue` |
| AI returns valid title, description, ≥1 tag | 500 `LISTING_COMPOSE_FAILED` (retry once client-side) |

**Complete (`POST /api/listing-coach/complete`)**

| Rule | Error |
| ---- | ----- |
| `item_number` non-empty, unique (ADR-021 inventory create) | 400 / 409 duplicate |
| `compose` object includes `listing_title`, `listing_description`, `listing_tags` | 400 |
| `condition_code` one of ADR-002 enum if set | 400 |
| `status` one of inventory status enum; default `In stock` | 400 |
| Photos re-uploaded (v1) same as analyze minimum | 400 |
| On success: `listing_draft_state` = `generated`, `listing_draft_source` = `integrated_ai` | — |

Post-save listing content must pass same ADR-021 / ADR-068 checks as integrated one-shot generation before **Approve** (operator step).

### Error codes (API envelope)

| Code | HTTP | When | User message (example) |
| ---- | ---- | ---- | ---------------------- |
| `AI_NOT_CONFIGURED` | 503 | No `ai.api_key` | "Listing Coach needs AI set up in Config first." |
| `LISTING_ANALYZE_FAILED` | 500 | AI/vision error on analyze | "We couldn't review your photos. Try again." |
| `LISTING_COMPOSE_FAILED` | 500 | AI/parse error on compose | "We couldn't write the listing. Try again." |
| `VALIDATION_ERROR` | 400 | Missing photos, item number, etc. | Field-level `fields` object |
| `DUPLICATE_ITEM_NUMBER` | 409 | `item_number` exists | "That item number is already in use." |
| `BATCH_TOO_LARGE` | 400 | Too many images in one request | "Too many photos (max 10 item, 5 condition, 3 Google)." |

Actions array must include: link to Config for 503; retry for 500; fix field for 400.

### AI prompt contract

Two calls — **analyze** (vision + guidance) and **compose** (vision + guidance + confirms). Both use integrated AI (ADR-023) with `temperature` ≤ 0.3.

**Analyze — system intent**

- Role: Etsy vintage listing coach for Trudy's Classic Treasures.
- Inputs: all item + condition images; optional Google screenshot images labeled `GOOGLE_VISUAL_SEARCH_RESULTS`.
- Load guidance bundle (template, How_to_Win, Photo_Guide).
- Output: **strict JSON only** matching analyze response schema (§ API surface).
- Rules:
  - Photo review: map to Photo Guide shot types (`hero`, `detail`, `backstamp`, `scale`, `group`, `lifestyle`, `imperfection`).
  - Do not block flow on missing shots — advisories only.
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

| Step | Heading | Body / hint |
| ---- | ------- | ----------- |
| 0 Welcome | Listing Coach | Paste your photos, add Google results if you have them, confirm a few answers — we'll write the listing. You don't need to write marketing copy. |
| 1 Photos | Item photos | Click here, then press ⌘V to paste from Photos. First photo becomes the main image. |
| 1 Photos (alt) | | Or drag photos here, or choose files. |
| 2 Google | Google search results (optional) | In Photos, right-click your best photo → Search with Google. Screenshot the results and paste here (⌘V). |
| 2 Google skip | | Skip — I didn't use Google |
| 3 Review | What we found | Plain list: photo tips, identification, suggested price. |
| 3 Review CTA | Looks right | Continue |
| 4 Price | Suggested price | Show `$low – $high` or single value + rationale. Buttons: **Use this price** · **I know the price** · **Skip for now** |
| 5 Confirms | Quick checks | One card at a time or stacked; **Yes, use this** · **Edit** |
| 6 Preview | Your listing | Read-only title, description, tags, quality score. **Save to inventory** · **Back** · **Start over** |
| 7 Save | Item number | Enter your item number (e.g. TCT-2026-042). Optional short description. **Save** |
| Error AI | AI not set up | Go to Config → AI settings, add your key, and test connection. |
| Success | Saved | Opening your new item in Inventory. Review and approve when ready. |

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
