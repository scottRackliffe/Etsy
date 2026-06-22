# Ticket WS-THRESH — Standardize listing quality pass threshold to 85 (single source)

| Field | Value |
|-------|-------|
| Workstream | Cross-cutting cleanup (prereq for WS-G). Small but touches several files. |
| Source ADR(s) | **ADR-068 / ADR-081 §1 / ADR-082 §1** (pass = **85**, target 98 advisory). |
| Recommended model | **T2 — Sonnet** (`claude-4.6-sonnet-medium-thinking`). Mechanical, well-scoped. |
| Complexity | Small |
| Risk | Low–Medium (changes the global pass bar 80→85; intended per ADRs, but it shifts badge colors / outstanding / approve gate / the WS-D widget) |
| Sequencing | **Run AFTER WS-D is merged** (it touches `src/lib/dashboard.ts`, which WS-D creates) and **BEFORE / alongside WS-G** (G consumes the helper). Not parallel with WS-D. |

---

## Problem

The ADRs define the listing-quality **pass threshold = 85** (target 98 advisory). The code drifted:
the implemented setting `listing.min_quality_score` defaults to **80** in ~11 places, and
`.cursorrules` lists a **phantom second key** `listing.quality_threshold` (85) that nothing reads.
Result: docs say 85, the app behaves at 80, and there are two key names. Fix: **one key, one default,
one helper.**

## Locked decisions

- **Canonical key:** keep `listing.min_quality_score` (already wired everywhere). **Do not** introduce
  or migrate to `listing.quality_threshold` — retire that name in the docs instead.
- **Default = 85** everywhere a value is absent.
- **Single helper** so the default lives in ONE place: add
  `getMinQualityScore(): number` (returns the configured int or **85**) and export a
  `DEFAULT_MIN_QUALITY_SCORE = 85` constant. Put it where server code already reads settings
  (recommend `src/lib/settings-store.ts`, next to `getSetting`). Replace every server-side
  `getSetting("listing.min_quality_score") ?? "80"` / `: 80` site with `getMinQualityScore()`.
- **Client default** (AppContext / settings form / inventory badge) → `"85"` / `85`.
- **Target 98** is advisory only; not added as a gate here.

## Files (edit only these — confirm `dashboard.ts` exists, i.e. WS-D merged)

**Server (use `getMinQualityScore()`):**
1. `src/lib/settings-store.ts` — **add** `DEFAULT_MIN_QUALITY_SCORE = 85` + `getMinQualityScore()`.
2. `src/app/api/inventory/[id]/listing-score/route.ts` — line ~38–39.
3. `src/app/api/inventory/[id]/listing-approve/route.ts` — line ~60–61.
4. `src/app/api/inventory/[id]/improve-listing/route.ts` — line ~80–81.
5. `src/lib/listing-coach.ts` — lines ~560–561 and ~881–882.
6. `src/lib/outstanding.ts` — lines ~202–203.
7. `src/lib/dashboard.ts` — line ~177 (the WS-D widget query). **Only if WS-D is merged.**

**Client defaults (80 → 85):**
8. `src/context/AppContext.tsx` — lines ~189 and ~542 (`"80"` → `"85"`).
9. `src/app/(app)/settings/page.tsx` — line ~1200 (`|| "80"` → `|| "85"`) and ~2471 placeholder
   `"80"` → `"85"`.
10. `src/app/(app)/inventory/page.tsx` — lines ~390, ~399 (`|| 80` → `|| 85`).

> If `src/lib/dashboard.ts` does NOT yet have the threshold read (WS-D not merged), **STOP and ask** —
> do not proceed out of order.

**Docs:**
11. `.cursorrules` — change the `listing.quality_threshold` (ADR-082, default 85) settings-key line to
    document the **actual** key: `listing.min_quality_score` (default **85**; target 98 advisory).
    Remove/alias the phantom `listing.quality_threshold` mention.
12. `documents/adr/0068-listing-quality-score.md` and `documents/adr/0082-listing-quality-rubric.md` —
    one-line note: the configurable setting is `listing.min_quality_score`, default **85**.

## Acceptance criteria
- [ ] `getMinQualityScore()` + `DEFAULT_MIN_QUALITY_SCORE = 85` exist in `settings-store.ts`; all
      server sites use the helper (no remaining `: 80` / `?? "80"` for this setting server-side).
- [ ] Client defaults read **85** (AppContext, settings form value + placeholder, inventory badge).
- [ ] With **no** `listing.min_quality_score` setting saved, the inventory badge, Outstanding low-
      quality logic, listing-approve gate, listing-coach, and the WS-D "Needs work" widget all treat
      **85** as the pass bar (items 80–84 now read as below-threshold).
- [ ] Saving a custom value in Settings still overrides the default everywhere (single key).
- [ ] `.cursorrules` + ADR-068/082 reference the single key `listing.min_quality_score` (default 85);
      no live reference to `listing.quality_threshold` remains.
- [ ] `npm run build` passes; no new lint; no hardcoded hex; no schema/API-shape changes.

## Out of scope
- Implementing the 98 target as a publish gate (publish gate stays ADR-023/§5).
- Any rubric logic (that's WS-G2/G3).

## Escalation triggers (STOP and ask)
- `src/lib/dashboard.ts` threshold line missing (WS-D not merged yet).
- A site reads `listing.min_quality_score` in a way the helper can't cleanly replace.

## Kickoff prompt

> Implement ticket `documents/tickets/WS-THRESH_quality-threshold-default-85.md`. Read it and follow
> `.cursor/rules/implementer.mdc`. The decision is locked: ONE setting key `listing.min_quality_score`
> with default **85**, exposed via a single `getMinQualityScore()` helper; retire the phantom
> `listing.quality_threshold` in docs. Confirm `src/lib/dashboard.ts` already has the threshold read
> (WS-D merged) before editing it — if not, STOP and ask. Only touch the files the ticket lists,
> update the listed docs, then run `npm run build`. Report what you changed and confirm each
> acceptance-criteria checkbox.
