# Ticket WS-L5 — Publish re-gate + re-publish guard (Update vs Create)

| Field | Value |
|-------|-------|
| Workstream | **L** — listing consolidation, 5 of 6. |
| Owner | **Opus (me).** Live-marketplace path + new Etsy `updateListing` code — owner reviews/implements personally (per budget decision). |
| Source ADR | **ADR-085** (§5), ADR-081 (publish gate), ADR-018 (publish endpoint), ADR-032 (confirm dialog), ADR-073/011 (Etsy compliance). |
| Complexity | Medium-high. |
| Risk | **High** — creates/updates real Etsy listings; a mistake duplicates or corrupts a live listing. |
| Depends on | L1 (phase/price). Land before L6 (which removes approve/reject). |

---

## Goal

1. **Re-gate publish** on `listing_phase = 'listing_ready'` (+ existing Etsy field checks), removing
   the `listing_draft_state = 'approved'` gate.
2. **Re-publish guard:** never silently duplicate a live listing. If the item already has
   `etsy_listing_id`, require an explicit **Update existing** vs **Create new** choice.
3. Add an Etsy **`updateListing`** client method (new) for the Update path.

## What to build

1. **Etsy client** (`src/lib/etsy.ts`): add `updateListing(listingId, payload)` using the official
   Etsy API (PATCH/PUT listing) — mirror the field mapping used by `createDraftListing`. Re-upload /
   refresh images as appropriate. Compliance: official API only (ADR-073/011); rate-limit/429 handling
   consistent with the rest of the client.
2. **Publish route** (`src/app/api/inventory/[id]/publish-to-etsy/route.ts`):
   - Gate on `listing_phase = 'listing_ready'` (read/compute via `listing-phase.ts`) + the existing
     `validatePublishReadiness` Etsy field checks. Not ready → 409 `PUBLISH_NOT_READY`.
   - Accept body `{ mode?: "create" | "update" }`.
   - **First publish** (no `etsy_listing_id`, or `mode:"create"`): `createDraftListing` → activate →
     persist **new** `etsy_listing_id`, `is_listed=1`, `status='Listed'`, `listing_published_at`,
     `date_listed`.
   - **Re-publish without `mode`** (item has `etsy_listing_id`): return **409 `ALREADY_PUBLISHED`**
     with `{ etsy_listing_id, actions:["update","create"] }`.
   - `mode:"update"` → `updateListing(etsy_listing_id, …)`; bump `listing_published_at`; keep id.
   - `mode:"create"` on an already-published item → new listing (duplicate; previous untouched).
   - Log `listing.published` with `detail_json:{ etsy_listing_id, mode }`; on failure `listing.publish_failed`.
3. **Publish UI** in the lifecycle controls (`InventoryDetailPanel` / lifecycle controls component):
   - Surface a **Publish to Etsy** action once `listing_ready`.
   - First publish → ConfirmDialog "Publish to Etsy?".
   - Already on Etsy → the **"Already on Etsy"** dialog (ADR-032) with two accent actions
     **Update existing** / **Create new** + Cancel; call the route with the chosen `mode`.
   - Handle the server 409 `ALREADY_PUBLISHED` defensively (open the same dialog) so the guard holds
     even if the client state is stale.

## Do NOT

- Do not remove the approve/reject routes here (L6) — just stop gating publish on `approved`.

## Files

- Edit: `src/lib/etsy.ts`, `src/app/api/inventory/[id]/publish-to-etsy/route.ts`,
  `src/components/inventory/InventoryDetailPanel.tsx` + lifecycle controls component,
  `src/lib/inventory.ts`/`listing-phase.ts` (publish-eligibility helper if needed).
- Reuse: `validatePublishReadiness`, `ConfirmDialog`, activity log.

## Acceptance criteria

- [ ] Publish blocked unless `listing_phase = 'listing_ready'` + required Etsy fields; `approved` no longer referenced.
- [ ] First publish creates + activates a listing and stores `etsy_listing_id`/status/dates.
- [ ] Re-publishing an item with `etsy_listing_id` **always** prompts Update vs Create; server returns
      409 `ALREADY_PUBLISHED` when `mode` is missing.
- [ ] Update path calls Etsy `updateListing` (no duplicate); Create path makes a new listing.
- [ ] `listing.published` logs `mode`; failures log `listing.publish_failed`.
- [ ] Official Etsy API only; 429/rate-limit handled; `npm run build` passes; no new lint.

## Escalation triggers

- Etsy's update API can't update a field we send at create time (decide partial-update behavior).
- Image update semantics on `updateListing` are ambiguous (replace vs append).

## Note

This ticket is **owner-implemented/reviewed** (Opus). If a budget model picks it up, it must STOP before
any real Etsy mutation and hand back for review.

---

## Implementation status & decisions (Opus)

Split into two phases to run **conflict-free in parallel with L2/L3** (both touch
`InventoryDetailPanel.tsx`):

### Phase A — backend (DONE, no L2 overlap)

`src/app/api/inventory/[id]/publish-to-etsy/route.ts`:
- Removed retired gates: `listing_draft_state === 'approved'`, `listing_approved_at`,
  changed-after-approval, and the publish-preview hash gate (dropped the `getLatestPublishPreview`
  import + `preview_hash` body field).
- New gate: `computeListingPhase(item) === 'listing_ready'` (recomputed, drift-aware) **plus** the
  existing `validatePublishReadiness` Etsy field checks. Not ready → 409 `PUBLISH_NOT_READY`.
- Body `{ mode?: "create" | "update" }`. Re-publish guard: item has `etsy_listing_id` **and** no
  `mode` → **409 `ALREADY_PUBLISHED`** with `fields:{ etsy_listing_id, available_modes:["update","create"] }`.
- `create` path: unchanged Etsy flow (`createDraftListing` → image upload → attributes →
  `updateListingDetails` → activate). First publish (no id) is always `create`.
- `update` path: reuses the stored `etsy_listing_id`; refreshes text/details (`updateListingDetails`,
  which is already a PATCH to `/shops/{id}/listings/{id}`) + attributes (`updateListingProperty`),
  then ensures `active`. **Bumps `listing_published_at`, keeps the id.**
- Activity: `listing.published` with `detail:{ etsy_listing_id, mode, developer_mode }`; genuine
  failures (non-`ApiRouteError`) log `listing.publish_failed`.

**Decision — no new `updateListing` client method.** `updateListingDetails` already PATCHes an
existing listing, so the Update path reuses it. The ticket's "add `updateListing`" item is satisfied
by the existing client function; no new Etsy code/risk introduced.

**Decision — image semantics on Update = leave images as-is** (escalation trigger #2). Re-uploading
would *append* duplicates on Etsy. Update refreshes fields/attributes only; image replace (delete +
re-upload) is a deliberate later follow-on, not part of L5.

**Back-compat note:** the publish DB write still sets `listing_draft_state='published'` so
`outstanding.ts` (which still reads draft_state) stays correct. L6 repoints those reads to
`listing_phase` and removes the write.

### Phase B — UI (DONE, on top of L3)

`src/components/inventory/InventoryDetailPanel.tsx` (`ListingLifecycleControls`):
- New props `etsyListingId` + `onSuccess` threaded from the panel.
- When `listing_phase === 'listing_ready'`, a **Publish to Etsy** / **Re-publish to Etsy** accent
  button appears beside the (now secondary) lifecycle button.
- First publish (no `etsy_listing_id`) → `ConfirmDialog` "Publish to Etsy?".
- Already on Etsy (`etsy_listing_id` present) → **"Already on Etsy"** `Modal` with **Update existing**
  / **Create new listing** / **Cancel**; posts the chosen `mode`.
- Server 409 `ALREADY_PUBLISHED` handled **defensively**: a stale first-publish attempt re-opens the
  Update/Create dialog (reads `error.fields.etsy_listing_id`).
- Success → toast via `onSuccess` (distinguishes "published" vs "updated") + `onReloadItem`.

`npm run build` passes (exit 0); no new lint.
