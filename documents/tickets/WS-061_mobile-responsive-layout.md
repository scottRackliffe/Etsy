# Ticket WS-061 — Mobile-responsive layout (ADR-061)

| Field | Value |
|-------|-------|
| Status | **OPEN — ON HOLD.** Not to be started until the owner **signs off on all other work** (owner, 2026-06-24). Last item in the queue. |
| Workstream | **Infrastructure / UX** — deferred post-v1 sprint (`.cursorrules`). |
| Source ADR | **ADR-061** (mobile-responsive layout), ADR-079 (SEMS on small screens). |
| Recommended model | Strong model — touches every tab; plan before coding. |
| Complexity | Large. |
| Risk | Medium — SEMS list↔editor transitions on narrow viewports. |
| Priority | **Lowest / last.** Gated on owner sign-off of everything else; not blocking desktop daily use. |
| Depends on | WS-E1–E6 SEMS rollout (done). |

---

## Problem

The app is optimized for desktop width. ADR-061 defines responsive behavior (tab bar, list/editor
stacking, touch targets, filter chip wrapping) but was explicitly deferred. Owner listed mobile as
a future need; no implementation ticket existed until now.

## Goal

On viewports below the `lg` breakpoint (~1024px):

- Tab bar remains usable (scroll or collapse per ADR-061).
- SEMS screens: list and editor stack vertically; sticky Save bar remains reachable.
- Dashboard activity 1/3–2/3 split stacks (Recent Activity above Activity Log).
- Master-detail remnants (if any) do not horizontal-scroll unusably.
- Touch-friendly hit targets on row actions and filter chips.

## Approach (doc-first)

1. Read ADR-061 + ADR-079 mobile notes; produce a **screen checklist** (Dashboard, Orders, Inventory,
   Shipping, each SEMS tab) before code.
2. Pilot fixes on **Dashboard + Orders**; then roll through remaining tabs.
3. No schema/API changes.

## Out of scope

- Native mobile app; PWA install prompts.
- Redesign of rubric/listing AI flows (desktop-first OK for v1).

## Acceptance criteria

- [ ] Documented breakpoint behavior matches ADR-061 checklist.
- [ ] All top-level tabs usable at 375px width without horizontal page scroll (except intentional tables).
- [ ] SEMS editor Save/Cancel reachable without losing context.
- [ ] `npm run build` passes; visual review on at least iPhone-width + tablet.

## Escalation triggers (STOP and ask)

- SEMS scaffold needs architectural change beyond CSS/layout (new routes/sub-routes).

## Kickoff prompt

> Implement `documents/tickets/WS-061_mobile-responsive-layout.md`. Read ADR-061 and ADR-079.
> Start with a screen checklist, then pilot Dashboard + Orders responsive fixes. No API changes.
