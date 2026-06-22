# Ticket WS-L6 — Remove the old listing code

| Field | Value |
|-------|-------|
| Workstream | **L** — listing consolidation, 6 of 6. **Do this LAST.** |
| Source ADR | **ADR-085** (§7). |
| Recommended model | Budget/mid model OK — mechanical deletion + build verification. |
| Complexity | Medium. |
| Risk | Medium — must keep the build green and not break live paths. |
| Depends on | **L1, L2, L3, L5 must be done first** (everything must be ported + publish re-gated before deletion). |

---

## Goal

Delete the now-orphaned legacy listing system: the Listing Coach, the ADR-023 modes/draft-state/
portable handoff/approve/reject, and `improve-listing`. Confirm the app still builds and the unified
lifecycle is the only listing path.

## Delete (routes)

- `src/app/api/listing-coach/analyze/route.ts`, `…/compose/route.ts`, `…/complete/route.ts`,
  `…/refine/route.ts`, `…/video/route.ts` (and the empty `listing-coach` folder).
- `src/app/api/inventory/[id]/listing-export/route.ts`, `…/listing-import/route.ts`,
  `…/listing-approve/route.ts`, `…/listing-reject/route.ts`, `…/improve-listing/route.ts`,
  `…/publish-preview/route.ts`, `…/publish-history/route.ts`.
  *(Only delete `listing-score` if WS-L4 hasn't already.)*

## Delete (pages/components/libs)

- `src/app/(app)/listing-coach/page.tsx` and `src/components/listing-coach/*` (relocate any component
  L3 still imports — e.g. paste zones, `GoogleResultsPasteZone`, `CoachPhoto` types — into
  `src/components/inventory/` first).
- **Dead local copy:** delete the unused `EvidenceBadge` function in
  `src/components/inventory/InventoryDetailPanel.tsx` (defined but never rendered — WS-L1a resolution).
  Evidence is surfaced via the citations/compliance panel, not per-field badges.
- Libs: `src/lib/listing-coach.ts` (the temporary re-export shim from L1), `listing-coach-complete.ts`,
  `listing-coach-multipart.ts` (after moving needed helpers in L1), `listing-handoff.ts` (export/import),
  `listing-workshop-draft.ts` (draft-state), and `listing-review.ts`/`listing-guidance.ts` **only if
  unused after the above** (grep first).

## Clean up references

- Remove any AppContext orphan publish/approve state, nav entries, deep links, or `/listing-coach`
  redirects (Inventory empty-state CTA, tutorial links, `frontend-architecture` already updated).
- Remove writes to deprecated columns (`listing_draft_state`, `listing_draft_source`,
  `listing_export_id`, `listing_approved_at`) and to retired tables (`listing_exports`,
  `listing_imports`, `listing_publish_previews`). **Do not** drop the columns/tables (back-compat per
  ADR-085 §7) — just stop reading/writing them. (WS-L1 deliberately **kept** these writes — in
  `src/lib/inventory.ts` `updateListingContent` + `generate-listing-content/route.ts` — because live
  readers still depend on them; see next bullet. Remove the writes only together with the reads.)
- **CRITICAL — repoint live `listing_draft_state` readers to `listing_phase` in the SAME change that
  stops the writes, or Outstanding breaks:**
  - `src/lib/outstanding.ts` **line ~149** ("missing era/category"): replace
    `listing_draft_state IN ('generated','imported','approved')` with `listing_phase IN
    ('generated','needs_quality_remediation','listing_ready')` (per ADR-020, already updated).
  - `src/lib/outstanding.ts` **line ~208** ("drafts in progress"): repoint to the equivalent
    `listing_phase` set (any phase past `needs_data` with a generated listing) or remove if no longer
    a meaningful Outstanding category — decide and note.
  - `src/lib/records.ts` (lines ~527/556) draft-state defaults, `src/context/AppContext.tsx`,
    `src/types/index.ts` — drop the deprecated fields from app-facing types/state.
  - The publish gate read (`publish-to-etsy/route.ts`) is handled by **WS-L5**; confirm it no longer
    references `listing_draft_state`/`listing_approved_at` before deleting approve/reject.
- Remove retired activity actions from any emit sites (`listing.coach_complete`, `listing.exported`,
  `listing.imported`, `listing.approved`, `listing.rejected`, `listing.draft_saved`).

## Acceptance criteria

- [ ] All routes/pages/components/libs listed above are deleted (or relocated where still used).
- [ ] Grep is clean for: `listing-coach`, `listing-handoff`, `listing-export`, `listing-import`,
      `listing-approve`, `listing-reject`, `improve-listing`, `listing_draft_state`, `computeListingScore`.
- [ ] No code writes deprecated listing columns or retired tables; deprecated columns/tables still exist in schema.
- [ ] Inventory create, Generate, Quality, and Publish (incl. re-publish guard) all work end-to-end.
- [ ] `npm run build` passes; no new lint; no dead imports.

## Escalation triggers (STOP and ask)

- A "dead" lib turns out to be used by a live non-listing path.
- Deleting a component would break a screen L1–L5 didn't cover.
- Removing draft-state writes breaks a query that wasn't repointed to `listing_phase`.

## Kickoff prompt

> Implement `documents/tickets/WS-L6_remove-dead-code.md`. Read it + **ADR-085 §7**; follow
> `.cursor/rules/implementer.mdc`. Only proceed if WS-L1/L2/L3/L5 are merged. Delete the Listing Coach,
> portable export/import, approve/reject, improve-listing, and publish-preview/history routes + the coach
> page/components/libs (relocating anything still imported), stop reading/writing the deprecated listing
> columns + retired tables (without dropping them), and remove orphan state/nav/redirects + retired
> activity emits. Grep for the listed terms to confirm clean. Run `npm run build`; confirm each acceptance
> checkbox; STOP on any escalation trigger.
