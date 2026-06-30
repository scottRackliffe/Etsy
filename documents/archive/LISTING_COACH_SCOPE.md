# Listing Coach — implementation scope (Etsy approval hold)

> **RETIRED (2026-06-21, ADR-085):** The standalone Listing Coach is removed; its AI capabilities
> are absorbed into the unified listing lifecycle's Generate step on the inventory detail editor.
> This document is historical only. Canonical spec: [ADR-085](adr/0085-unified-listing-lifecycle.md).

**Status:** RETIRED (historical) — superseded by ADR-085  
**Last updated:** 2026-06-21  
**Canonical spec:** [ADR-085](adr/0085-unified-listing-lifecycle.md) (was ADR-072)  
**User guide:** [system/tips/Listing_Coach_Guide.md](../system/tips/Listing_Coach_Guide.md)

---

## 1. Why this work now

### Compliance remediation waves — on hold

| Item                                                                                      | Status                                                                                              |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Waves **1–35** (priorities 8–38 in build doc; compliance remediation through print queue) | **Done and pushed** on `feature/final-system-completion`                                            |
| Waves **36+** (customer merge, aging report, accounting export, auto-sync, etc.)          | **On hold** until **MyEMS / Etsy API key is approved** and OAuth can be tested end-to-end           |
| Local mode (`ALLOW_LOCAL_WITHOUT_ETSY`)                                                   | Available for inventory, sample data, Listing Coach — **not** a substitute for Etsy sync/publish QA |

**Rule during hold:** Do not start new compliance waves that assume live Etsy API until Connect Etsy works in dev.

### Listing Coach — green light

Listing Coach is **in scope during the hold** because:

- **No Etsy OAuth required** for analyze, compose, or save to local inventory.
- **Only hard dependency:** integrated AI configured in Config (OpenAI key).
- **Directly unblocks Trudy:** she can build real listings on the Mac while waiting for approval.
- **Publish to Etsy** remains blocked until OAuth — coach output stops at **saved draft** (approve/publish later).

Build priority: **53** in [no-developer-questions-build.md](no-developer-questions-build.md). Treat as **Wave LC** (Listing Coach), separate from numbered compliance waves.

---

## 2. Problem statement

Trudy is **not comfortable writing** marketing copy. She **is** comfortable with:

- Copy/paste from **Photos** on Mac (⌘C / ⌘V)
- **Search with Google** on item photos (excellent identification and comp luck)
- Confirming short answers (**Yes** / fix one line)

The app must turn photos + optional Google screenshot + minimal confirms into a **search-optimized Etsy listing** (title, description, 13 tags, suggested price) aligned with Win/Keywords/Photo Guide docs — without exposing internal template field names.

---

## 3. v1 scope (in)

| Area                | v1 deliverable                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Route**           | `/listing-coach` full-screen wizard                                                                                       |
| **Entry**           | Inventory → **Add new listing with Listing Coach** (primary CTA)                                                          |
| **Photo intake**    | Clipboard paste (primary), drag-and-drop, file picker; up to **20** item + 5 condition photos + optional video (MP4/MOV) |
| **Google step**     | Optional paste zone for 0–3 Visual Search screenshots + plain instructions                                                |
| **Analyze API**     | Photo checklist, advisories, identification, price suggestion + confidence, confirm-card seeds, suggested era/category/materials |
| **Price step**      | Use suggested / I know / Skip                                                                                             |
| **Era/Cat step**    | Step 4b: confirm era (`when_made`), category (`taxonomy_id`), materials, optional dimensions/weight (ADR-072)             |
| **Confirm step**    | Up to 6 cards with AI suggested answers (incl. materials card)                                                            |
| **Compose API**     | Final listing + hidden template columns + ADR-068 quality score hints + era/category/materials/dimensions                 |
| **Complete API**    | Create inventory row, store pictures + video (ADR-026), persist Etsy fields (`etsy_when_made`, `etsy_taxonomy_id`, `materials`, dimensions), set `listing_draft_state=generated`, `listing_draft_source=integrated_ai` |
| **After save**      | Navigate to Inventory `?itemId=` with workshop open; operator approves when ready                                         |
| **Activity log**    | `listing_coach_complete` (ADR-037)                                                                                        |
| **Docs in prompts** | etsy-listing-template, How_to_Win_on_Etsy, Etsy_Photo_Guide                                                               |
| **Tutorial**        | Listing_Coach_Guide.md listed in Tutorial & Tips                                                                          |

---

## 4. v1 scope (out)

| Item                                    | Reason                                                         |
| --------------------------------------- | -------------------------------------------------------------- |
| Live Etsy / eBay comp scraping          | No compliant API in v1; Google screenshot is the comp source   |
| Google Lens API integration             | Manual paste only; matches Trudy’s workflow                    |
| Publish to Etsy from coach              | Requires OAuth; separate step after approval                   |
| Phone-first UX                          | Mac Photos paste is primary (ADR-061 can follow later)         |
| Server-side session cache for images    | v1 may re-upload on analyze/compose/complete; optimize post-v1 |
| Separate standalone app / repo          | Same Next.js app per ADR-072                                   |
| Coach on **existing** items (edit flow) | post-v1; v1 is **new listing only**                            |
| Voice input                             | post-v1                                                        |
| Auto-run Google Visual Search           | post-v1 / never without explicit user action                   |

---

## 5. Dependencies

| Dependency                         | Required for coach? | Notes                                       |
| ---------------------------------- | ------------------- | ------------------------------------------- |
| `ai.api_key` in Config             | **Yes**             | 503 `AI_NOT_CONFIGURED` with link to Config |
| Etsy OAuth                         | **No**              | Local mode sufficient                       |
| `ALLOW_LOCAL_WITHOUT_ETSY=true`    | Recommended         | Dev + hold period                           |
| Existing picture storage (ADR-026) | **Yes**             | On complete only                            |
| Existing inventory CRUD            | **Yes**             | On complete                                 |
| Listing quality score (ADR-068)    | **Yes**             | Show on preview step                        |
| Listing approve/publish (ADR-023)  | After save          | Existing workshop flows                     |

---

## 6. Implementation phases

Estimated for one focused build slice (not calendar promises).

### Phase LC-1 — Backend + prompts (~core)

- [ ] `src/lib/listing-coach.ts` — analyze + compose prompt builders; JSON response parsing
- [ ] Reuse `loadListingGuidance()` + vision pattern from `listing-generator.ts`
- [ ] `POST /api/listing-coach/analyze`
- [ ] `POST /api/listing-coach/compose`
- [ ] `POST /api/listing-coach/complete` — create inventory + multipart picture upload loop
- [ ] Unit tests for JSON parse / tag normalization / price confidence enum

### Phase LC-2 — UI wizard (~core)

- [ ] `src/app/(app)/listing-coach/page.tsx`
- [ ] `PhotoPasteZone` — `paste` event, `clipboardData.items`, preview grid, reorder, remove
- [ ] `GoogleResultsPasteZone`
- [ ] Step components: Welcome → Photos → Google → Review → Price → **Era/Category/Materials (4b)** → Confirms → Preview → Save
- [ ] `ConfirmCard`, `ListingPreview`
- [ ] Error states: AI not configured, analyze failed, validation

### Phase LC-3 — Inventory integration (~small)

- [ ] Inventory page: **Add new listing with Listing Coach** button
- [ ] Post-save redirect with `itemId` query + workshop expanded
- [ ] Activity log on complete

### Phase LC-4 — Polish (~small)

- [ ] Optional: minimal tab chrome on coach route (focus mode)
- [ ] ADR-068 score on preview
- [ ] Clipboard paste hint persistence (“⌘V to paste from Photos”)
- [ ] Manual QA checklist (below)

---

## 7. API summary (ADR-018 §29)

| Endpoint                           | Input                                                        | Output                                             |
| ---------------------------------- | ------------------------------------------------------------ | -------------------------------------------------- |
| `POST /api/listing-coach/analyze`  | multipart: item_photos[] (1–20), condition_photos?, google_photos?, video?  | photo_review, identification, price, confirm_cards, suggested_when_made, suggested_taxonomy_id, suggested_materials |
| `POST /api/listing-coach/compose`  | multipart photos + confirm_answers JSON + price + when_made + taxonomy_id + materials + dimensions | listing fields + template fields + quality_score   |
| `POST /api/listing-coach/complete` | item_number, status, condition_code, etsy_when_made, etsy_taxonomy_id, materials, dimensions, compose payload, photos | `{ item_id, item_number }`                         |

Full schemas: ADR-072.

---

## 8. Trudy acceptance test (Mac, no Etsy)

Prerequisites: `npm run dev`, AI configured, `ALLOW_LOCAL_WITHOUT_ETSY=true`.

1. Inventory → **Add new listing with Listing Coach**
2. Photos → select 5+ shots → ⌘C → coach → ⌘V (up to 20 supported)
3. Google → Search with Google on best photo → screenshot → paste in Google zone
4. Review → identification, suggested era/category/materials, and price look plausible
5. Price → **Use suggested** or enter known price
6. Era/Category → confirm era dropdown, category, materials tags, optional dimensions/weight
7. Confirms → **Yes** on all cards (edit one if wrong)
8. Preview → read title/description/tags; quality score visible; era/category shown
9. Save → item number `TEST-COACH-001`
10. Inventory → item exists with pictures, listing fields filled, `etsy_when_made` and `etsy_taxonomy_id` set, draft state `generated`
11. **Do not** publish to Etsy until OAuth approved
Pass criteria: Trudy completes flow without writing a paragraph from scratch; listing is Etsy-ready (title, description, tags, era, category all populated) pending her accuracy read.

---

## 9. After Etsy approval

| Step | Action                                                                                 |
| ---- | -------------------------------------------------------------------------------------- |
| 1    | Resume compliance **Wave 36+** per DEEP_AUDIT / build doc priorities                   |
| 2    | QA coach → **Approve draft** → **Publish to Etsy** on a test item                      |
| 3    | Resume Etsy sync, dashboard receipts, scheduled sync (ADR-057) testing                 |
| 4    | post-v1: coach for existing items; image session cache; optional comp API if compliant |

---

## 10. Open questions (defaults chosen)

| Question                               | v1 default                                                        |
| -------------------------------------- | ----------------------------------------------------------------- |
| Item number required at start or end?  | **End** (after preview) — Trudy knows SKU when item is identified |
| Default status on save?                | **`In stock`** (selectable: Draft)                                |
| Default condition if AI unsure?        | **`Good`** with visible warning to confirm                        |
| Re-use one-shot Generate on same item? | Yes — workshop modes unchanged after coach save                   |

---

## 11. Files to create (implementation checklist)

See [listing-authoring-task-cards.md](listing-authoring-task-cards.md) §4.

**New:**

- `src/lib/listing-coach.ts`
- `src/app/api/listing-coach/analyze/route.ts`
- `src/app/api/listing-coach/compose/route.ts`
- `src/app/api/listing-coach/complete/route.ts`
- `src/app/(app)/listing-coach/page.tsx`
- `src/components/listing-coach/*`

**Touch:**

- `src/app/(app)/inventory/page.tsx` — CTA
- `archive/audits/DEEP_AUDIT_2026-05-24.md` — Wave LC entry when done

---

## 12. Sign-off

| Gate                                | Owner       | Status                  |
| ----------------------------------- | ----------- | ----------------------- |
| ADR-072 accepted                    | Docs        | Done                    |
| User guide (Listing_Coach_Guide.md) | Docs        | Done                    |
| This scope doc                      | Docs        | Done                    |
| Implementation LC-1–LC-4            | Dev         | Pending                 |
| Trudy Mac acceptance test           | Trudy       | Pending                 |
| Etsy publish path QA                | Dev + Trudy | Blocked on API approval |

---

## 13. Doc completion checklist (2026-05-24)

| Document                          | Content added                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| **ADR-072**                       | Validation, error codes, AI prompt contract, UI copy, focus mode, clipboard behavior |
| **ADR-018 Appendix B29**          | Full multipart + JSON schemas for analyze/compose/complete                           |
| **ADR-037**                       | `listing.coach_complete` action                                                      |
| **ADR-021 Notes**                 | Cross-ref to coach validation                                                        |
| **ADR-034 §4**                    | AI required for coach; Config helper text                                            |
| **knowledge-base-topics-catalog** | D21–D25 Listing Coach topics                                                         |
| **DEEP_AUDIT**                    | Wave LC planned entry                                                                |

---

## 14. Client state machine (wizard)

```
welcome → photos → google → analyzing → review → price → confirms → composing → preview → save → done
                ↘ skip google ────────────────────────────────┘
```

- `analyzing` / `composing`: show `ProgressModal` or inline spinner (ADR-043 indeterminate).
- Back button: allowed until `save` submits; returning to photos clears analyze results (re-run analyze on forward).
- `Start over`: ConfirmDialog (ADR-032) — clears all client-held images and answers.

---

## 15. Security and privacy

- Images sent only to configured AI provider (same as integrated generation); never logged to activity `detail_json`.
- Google screenshots may contain third-party listing data — treat as ephemeral; not stored separately from item photos except as uploaded inventory files only after **complete**.
- No Etsy tokens required; coach does not call Etsy API.

---

## 16. Sign-off (updated)

| Gate                                    | Owner       | Status                     |
| --------------------------------------- | ----------- | -------------------------- |
| ADR-072 + Appendix B29                  | Docs        | **Done** (2026-05-24 pass) |
| Validation / errors / prompts / UI copy | Docs        | **Done**                   |
| User guide (Listing_Coach_Guide.md)     | Docs        | Done                       |
| Knowledge base topics D21–D25           | Docs        | Done                       |
| Implementation LC-1–LC-4                | Dev         | Pending                    |
| Trudy Mac acceptance test               | Trudy       | Pending                    |
| Etsy publish path QA                    | Dev + Trudy | Blocked on API approval    |
