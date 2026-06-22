# Ticket WS-L1 — Unified Generate engine (research + price + all fields)

| Field | Value |
|-------|-------|
| Workstream | **L** — listing consolidation, 1 of 6. **Do this first; L2–L6 depend on it.** |
| Source ADR | **ADR-085** (§2, §3), ADR-081 (lifecycle), ADR-082 (rubric), ADR-021 (gates), ADR-018 (endpoints), ADR-075 (AI usage). |
| Recommended model | Strong model. This is the riskiest refactor in the workstream (AI prompts/types). |
| Complexity | Large. |
| Risk | Medium-high — behavioral change to the only AI authoring path. |
| Depends on | Nothing (foundation). |

---

## Goal

Make the lifecycle **Generate Listing** step do everything the Listing Coach's `researchAndCompose`
did — web-search **price recommendation**, identification, and **all** listing fields — and **remove
the `sale_revenue > 0` prerequisite** from the generation gate. No UI work here (that's WS-L2/L3);
this ticket delivers the neutral engine + upgraded API so the existing `ListingLifecycleControls`
button produces a full listing including a recommended price.

## What to build

1. **New neutral lib `src/lib/listing-ai.ts`** (vendor-neutral, not "coach"):
   - Move/relocate from `src/lib/listing-coach.ts`: `researchAndCompose()`, `refineListing()`,
     `callAiJson()`, and the shared types (`PriceSuggestion`, `PhotoClassification`,
     `ResearchAndComposeInput/Result`, `RefineListingInput/Result`, evidence/citation/compliance
     types) and prompt builders (`RESEARCH_SYSTEM_PROMPT`, `buildResearchUserText`, etc.).
   - Keep behavior identical; only change the import surface and any coach-specific naming.
   - Preserve the AI-usage logging call sites but rename qualifiers per ADR-075:
     `responses.create/generate-listing` for generate, `responses.create/listing-refine` for refine.
   - Keep the economy-lane model resolution (`resolveModelForTask` in `src/lib/ai-config.ts`) exactly
     as the coach used it (text authoring stays on the primary `ai.model`; do not downgrade).
2. **Move multipart photo parsing** used by Generate into a neutral util (e.g.
   `src/lib/listing-ai-multipart.ts`) from `src/lib/listing-coach-multipart.ts` — only the photo/Google
   intake helpers the generate path needs. (Leave the coach-create-specific parsing alone; L6 deletes it.)
3. **Upgrade `generateListingFromAi()` in `src/lib/listing-generator.ts`** to call the new engine and
   return the **full** field set, not just title/description/tags:
   - `listing_title`, `listing_description`, `listing_tags`, `listing_category_path`, and the strategy
     fields (`listing_title_strategy`, `listing_product_story`, `listing_condition_clarity`,
     `listing_attributes`, `listing_pricing_shipping_notes`, `listing_quality_checklist`);
   - suggested `etsy_when_made`, `etsy_taxonomy_id`/path, `materials`, dimensions, `picture_classifications`;
   - a **recommended `sale_revenue`** (from the price suggestion) + the `PriceSuggestion` payload
     (low/high/suggested/confidence/rationale), evidence/citations, compliance_check.
   - Always send **all** non-empty pictures (unchanged invariant).
4. **Remove the price gate.** In `src/lib/inventory.ts` → `validateItemForListingRequest`, drop
   `sale_revenue > 0`. Required = `item_number` + `description` + `condition_code` + ≥1 picture (ADR-085 §2).
   Update `src/lib/inventory-validation.ts` if it duplicates the check.
5. **Drop `sale_revenue` from drift inputs.** In `src/lib/listing-phase.ts`, remove `sale_revenue`
   from `HASH_FIELDS` (price is now an output of generation, not a driver of re-generation). Confirm
   `computeListingPhase` no longer treats missing price as `needs_data`.
6. **Upgrade `POST /api/inventory/[id]/generate-listing-content`**
   (`src/app/api/inventory/[id]/generate-listing-content/route.ts`):
   - Use the new gate (no price).
   - Persist all returned fields via `updateListingContent` (extend it in `src/lib/inventory.ts` to
     write the new fields + the recommended `sale_revenue` **only if the item's price is currently
     unset/zero** — never overwrite a price the owner already entered).
   - Keep `markListingGenerated` (timestamp + `listing_source_hash`), set phase `generated`.
   - Return `{ listing_title, listing_description, listing_tags, listing_category_path, price,
     evidence, citations, compliance_check, listing_phase }` (ADR-018).
   - Log activity `listing.ai_generated` with `detail_json: { price_confidence, sale_revenue_set }`.
7. **Extend the readiness endpoint** (`listing-readiness/route.ts`) so its preflight no longer lists
   `sale_revenue` as required (ADR-018 row already updated).

## Do NOT (this ticket)

- Do **not** delete `src/lib/listing-coach.ts` or the coach routes/UI yet — L6 owns deletion. For now
  `listing-coach.ts` may re-export from `listing-ai.ts` so the still-live coach keeps building.
- Do **not** touch the publish path (WS-L5) or the rubric surfaces (WS-L4).

## Files

- Add: `src/lib/listing-ai.ts`, `src/lib/listing-ai-multipart.ts`.
- Edit: `src/lib/listing-generator.ts`, `src/lib/inventory.ts`, `src/lib/inventory-validation.ts`,
  `src/lib/listing-phase.ts`, `src/app/api/inventory/[id]/generate-listing-content/route.ts`,
  `src/app/api/inventory/[id]/listing-readiness/route.ts`, `src/lib/ai-config.ts` (qualifier rename only).
- Re-export shim (temporary): `src/lib/listing-coach.ts` → from `listing-ai.ts`.

## Acceptance criteria

- [ ] Generate on an item with **no price** succeeds and writes a recommended `sale_revenue` (without
      clobbering a price the owner already set) plus all 9 listing fields + era/taxonomy/materials.
- [ ] `validateItemForListingRequest` no longer requires `sale_revenue`; `needs_data` is driven only by
      item_number/description/condition_code/≥1 picture.
- [ ] `HASH_FIELDS` excludes `sale_revenue`; editing price alone does not flip phase to `ready_to_generate`.
- [ ] `generate-listing-content` returns the full ADR-018 payload and logs `listing.ai_generated`.
- [ ] AI usage qualifiers are `generate-listing` / `listing-refine` (ADR-075).
- [ ] The still-live Listing Coach continues to build (via the re-export shim).
- [ ] `npm run build` passes; no new lint.

## Escalation triggers (STOP and ask)

- The Coach's `researchAndCompose` output shape can't cleanly map onto the inventory fields without a
  schema/contract decision.
- Removing `sale_revenue` from `HASH_FIELDS` would break an existing drift assumption elsewhere.
- `updateListingContent` can't be extended without an API/schema change.

## Kickoff prompt

> Implement `documents/tickets/WS-L1_generate-engine.md`. Read it + **ADR-085** (§2/§3), ADR-081,
> ADR-082, ADR-018, ADR-075; follow `.cursor/rules/implementer.mdc`. Move the AI engine to a neutral
> `listing-ai.ts`, upgrade `generateListingFromAi` to research + recommend price + write all fields,
> remove the `sale_revenue` generation gate, drop `sale_revenue` from drift hashing, and upgrade the
> `generate-listing-content` route accordingly. Keep the Coach building via a temporary re-export.
> `var(--ui-*)` only; run `npm run build`; confirm every acceptance checkbox; STOP on any escalation trigger.
