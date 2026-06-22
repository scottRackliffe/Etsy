# Ticket WS-G1 — Listing lifecycle, phases, one context-aware button, drift detection

| Field | Value |
|-------|-------|
| Workstream | **G (part 1 of 3)** — lifecycle foundation. Deterministic only, **no AI cost**. |
| Source ADR(s) | **ADR-081** (authoritative). Context: ADR-023 (draft states), ADR-068 (light score), ADR-072 (Coach), ADR-030 (detail panel), ADR-035 (deep-link), ADR-017/002 (columns), ADR-018 (endpoints), ADR-037 (activity). |
| Recommended model | **T3 — Opus** *(or strong Sonnet)*. Schema migration + central recompute logic + button state machine + drift hashing. |
| Complexity | Large |
| Risk | Medium (adds columns + recompute hooks on inventory mutations; additive, no behavior removed) |
| Sequencing | **Do FIRST.** WS-G2 and WS-G3 build on the `listing_phase` machine and the `listing-quality` endpoint stub introduced here. Run G1 → G2 → G3 **sequentially** (they share ADR/.cursorrules + inventory lib files). |

---

## Goal

Introduce a stored **`listing_phase`** dimension (separate from `inventory.status`) that drives **one
context-aware primary button** on the inventory detail (Evaluate Data → Generate Listing → Evaluate
Listing Quality), a **data-remediation list**, and **drift detection** so quality is never evaluated
against stale generated content. (ADR-081 in full.)

This ticket delivers everything in ADR-081 **except** the rubric body — the `listing-quality`
endpoint is stubbed here (returns the light ADR-068 score + empty remediation) and fully implemented
in **WS-G2/WS-G3**.

## Locked decisions (do not deviate)

- **Three new additive columns** on `inventory`: `listing_phase TEXT`, `listing_source_hash TEXT`,
  and `listing_generated_at TEXT`. **Confirmed:** none exist today — only `listing_approved_at` /
  `listing_published_at` are present (in `sqlite.ts` and migration 001). `listing_phase` +
  `listing_source_hash` are already named in `.cursorrules`/ADR-017; add `listing_generated_at` to
  those docs too.
- **Phase value set (closed):** `needs_data | ready_to_generate | generated |
  needs_quality_remediation | listing_ready` (ADR-081 §1). These are the canonical enum values
  already in `.cursorrules`.
- **Required-data set is already implemented:** `validateItemForListingRequest()` in
  `src/lib/inventory.ts` enforces exactly ADR-081 §2 (item_number, description, condition_code,
  sale_revenue>0, ≥1 picture) for **all** items. **Reuse it** — do not duplicate or fork the rule.
- **`listing_phase` is derived-but-stored.** It MUST be recomputed on every relevant mutation (save,
  picture add/remove/reorder, generate, quality eval). Centralize in ONE function and call it from
  the lib mutation functions so every route benefits.
- **Drift = hash mismatch.** `listing_source_hash` is a stable hash of the contributing inputs
  (ADR-081 §5). Quality evaluation is only offered when the live hash **matches** the stored one.
- **Threshold:** pass = `listing.min_quality_score`, **default 85**. WS-THRESH is **merged** — use
  the shared `getMinQualityScore()` helper from `src/lib/settings-store.ts` (do not re-read the
  setting manually or reintroduce an 80 default). Target 98 is advisory, not a gate.
- **Coexistence:** `status`, `listing_draft_state`, `listing_phase` all coexist. Do **not** change
  `status` or the ADR-023 draft-state machine.

## Files (create/edit only these)

**Schema / lib**
1. `migrations/013_listing_lifecycle.sql` — new migration: `ALTER TABLE inventory ADD COLUMN` ×3
   (`listing_phase`, `listing_source_hash`, `listing_generated_at` — all confirmed absent).
2. `src/lib/sqlite.ts` — add the same columns to the bootstrap `inventory` CREATE/ensure block so a
   fresh DB matches the migration (follow how migration 005's columns were added to bootstrap).
3. `src/lib/listing-phase.ts` — **new**: `computeListingSourceHash(item)`,
   `computeListingPhase(item)`, `recomputeAndStoreListingPhase(id)`.
4. `src/lib/inventory.ts` — call `recomputeAndStoreListingPhase(id)` at the end of `patchInventory`,
   the picture mutation helpers, and `updateListingContent` (after setting hash + generated_at).

**API**
5. `src/app/api/inventory/[id]/listing-readiness/route.ts` — extend response with `listing_phase`,
   `button: { label, action }`, `required: [{field, present}]`, `data_remediation: [...]`.
6. `src/app/api/inventory/[id]/generate-listing-content/route.ts` — on success, set
   `listing_generated_at` + `listing_source_hash` and recompute phase → `generated` (most of this
   moves into `updateListingContent`; the route just returns the new phase).
7. `src/app/api/inventory/[id]/listing-quality/route.ts` — **new STUB**: guard, load item, **block
   if drift** (hash mismatch) with a clear message, else return
   `{ ok, score, passed, quality_remediation: [], listing_phase }` using the **light ADR-068 score**
   for now (computeListingScore). Set phase to `needs_quality_remediation` if score < threshold else
   `listing_ready`. Log `listing.quality_evaluated`. (WS-G2 replaces the body.)

**UI**
8. `src/components/inventory/InventoryDetailPanel.tsx` — replace the single "Regenerate with AI"
   button (≈line 982) with the **one context-aware button** driven by `listing-readiness`
   (`label`/`action`), and render the **data-remediation list** when action = Evaluate Data. Show a
   small `listing_phase` chip. Keep existing save/approve/publish controls.
9. `src/app/(app)/inventory/page.tsx` — add **`listing_phase` as a list filter** (ADR-029 pattern,
   alongside the existing status filter).

**Docs (sequential — G1 owns these edits this round)**
10. `documents/adr/0017-database-schema.md` + `documents/adr/0002-inventory-data-model.md` — confirm
    `listing_phase` / `listing_source_hash` / `listing_generated_at` documented (add if missing).
11. `documents/adr/0018-api-surface-endpoints.md` — document the extended readiness response + new
    `listing-quality` endpoint shape.
12. `documents/adr/0037-activity-log-and-audit-trail.md` — add `listing.quality_evaluated` to the
    Listing actions table (if not present).
13. `.cursorrules` — verify the `listing_phase` enum + columns are listed (they are); ensure the
    threshold note reads `listing.min_quality_score` (**default 85**). (Full threshold cleanup is
    WS-THRESH.)

> Anything outside this list → **STOP and ask**.

## Implementation detail

### Drift hash (`computeListingSourceHash`)
Stable hash (e.g. `crypto.createHash("sha256")` over a deterministic JSON string) of: the listing-
contributing fields — `description, condition_code, condition_notes, materials, item_length,
item_width, item_height, item_dimensions_unit, sale_revenue, category_tags, store_category,
etsy_when_made, etsy_who_made, etsy_taxonomy_id` — **and** the ordered list of non-empty picture
paths (`picture_1..20` then `condition_picture_1..5`). Order matters; null/empty normalized to "".

### Phase computation (`computeListingPhase`) — pure, from a row
```
1. if !validateItemForListingRequest(item).ok            -> "needs_data"
2. const hasListing = listing_title && listing_description && listing_tags all non-empty
   if !hasListing                                        -> "ready_to_generate"
3. if listing_source_hash == null OR != computeListingSourceHash(item)  // drift
                                                          -> "ready_to_generate"
4. // listing exists, no drift; phase depends on last quality eval:
   if listing_phase in ("needs_quality_remediation","listing_ready") keep it
   else                                                   -> "generated"
```
`recomputeAndStoreListingPhase(id)`: load row, compute, `UPDATE inventory SET listing_phase=? ...`.
(Quality endpoints set `needs_quality_remediation`/`listing_ready` explicitly; a later data edit that
changes the hash flips it back to `ready_to_generate` via step 3.)

### Button mapping (readiness route + panel)
| phase | label | action id |
| --- | --- | --- |
| needs_data | **Evaluate Data** | `evaluate_data` (show data-remediation list) |
| ready_to_generate | **Generate Listing** | `generate` (POST generate-listing-content) |
| generated / listing_ready | **Evaluate Listing Quality** | `evaluate_quality` (POST listing-quality) |
| needs_quality_remediation | **Evaluate Listing Quality** | `evaluate_quality` (re-run) |

### Data-remediation list (readiness route)
From `validateItemForListingRequest(item).fields` plus recommended high-value fields (dimensions,
materials, condition_notes when `has_condition_issue`). Each entry: `{ field, label, present,
required, shortcoming, resolution_link }` where `resolution_link = /inventory?itemId=<id>#<anchor>`
(anchors are best-effort; if the field has no anchor yet, link to the item). Required-missing items
highlighted (a `required && !present` flag is enough; the panel styles it).

## Acceptance criteria
- [ ] Migration 013 adds `listing_phase` + `listing_source_hash` (+ `listing_generated_at` if it was
      missing); fresh-DB bootstrap (`sqlite.ts`) includes the same columns; `npm run build` clean.
- [ ] `listing_phase` is recomputed on item save, picture add/remove/reorder, and generation — verify
      by editing an item and re-reading the row.
- [ ] Inventory detail shows **one** button whose label/action match the phase table above; old
      standalone "Regenerate with AI" is gone (its generate behavior lives under Generate Listing).
- [ ] **Evaluate Data** shows the data-remediation list with required-missing items highlighted and a
      resolution link per item.
- [ ] **Generate Listing** generates (all pictures sent — unchanged behavior), then stores
      `listing_generated_at` + `listing_source_hash` and the item moves to `generated`.
- [ ] After generation, editing a contributing field or changing a picture flips the phase back to
      `ready_to_generate` (drift), and the button returns to **Generate Listing**.
- [ ] `POST /api/inventory/[id]/listing-quality` exists, **blocks on drift** with a clear message,
      otherwise returns score + phase (`needs_quality_remediation`/`listing_ready`) and logs
      `listing.quality_evaluated`. (Rubric body is the light score for now — WS-G2 replaces it.)
- [ ] Inventory list has a working **`listing_phase` filter**.
- [ ] Docs (ADR-017/002/018/037, `.cursorrules`) updated; cross-references checked per `.cursorrules`
      §1b. No `status`/draft-state/API-envelope changes; no hardcoded hex; no `any` beyond row casts.

## Out of scope (later sub-tickets)
- The real ADR-082 rubric scoring (deterministic) → **WS-G2**.
- AI-vision per-photo judgment → **WS-G3**.
- Listing Coach button reuse (ADR-072) → small follow-up after G2 (note it, don't build it here).

## Escalation triggers (STOP and ask)
- Recompute hook would require touching files beyond the list (e.g. an unexpected mutation path).
- The detail-panel button rework conflicts with the WS-E SEMS refactor (if SEMS landed on inventory).

## How to verify (manual)
1. `npm run build` → start. Open an incomplete item → button reads **Evaluate Data**, list shows
   missing required fields.
2. Complete required fields → button becomes **Generate Listing**. Generate → becomes **Evaluate
   Listing Quality**, phase chip = `generated`.
3. Edit the description → button reverts to **Generate Listing** (drift). Regenerate, then change
   nothing and click **Evaluate Listing Quality** → get a score + phase; confirm activity row
   `listing.quality_evaluated`.
4. Inventory list: filter by `listing_phase` and confirm it narrows results.

---

## Kickoff prompt

> Implement ticket `documents/tickets/WS-G1_listing-lifecycle-phases.md`. Read that ticket and
> **ADR-081** (`documents/adr/0081-listing-lifecycle-and-phases.md`) in full first, and follow
> `.cursor/rules/implementer.mdc`. This is part 1 of 3 for workstream G; implement ONLY G1 (the
> `listing-quality` endpoint is a stub using the existing light score — G2 replaces it). Reuse the
> existing `validateItemForListingRequest` for the required-data set and the `listing.min_quality_score`
> setting. Only touch the files the ticket lists, update the listed docs, then run `npm run build`.
> Report what you changed and confirm each acceptance-criteria checkbox. STOP and ask me if you hit an
> escalation trigger.
