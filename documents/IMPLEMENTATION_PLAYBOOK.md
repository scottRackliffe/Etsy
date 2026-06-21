# Implementation Playbook (economized workflow) — for Scott

**Goal:** get features built cheaply by using lower-cost assistant models for implementation,
while reserving the expensive architect model (Opus) for design, ambiguity, and review only.

The architecture is already written (ADRs 078–084 + the program doc). Each feature is broken into
a **ticket** in `documents/tickets/`. A ticket is a self-contained spec a cheaper model can build
without guessing.

---

## The loop (per ticket)

1. **Open a NEW chat** (keeps context small = cheaper). Set the model to the ticket's
   **Recommended model** (see table below).
2. Paste the **kickoff prompt** from the bottom of the ticket (it @-references the ticket + ADRs;
   the `implementer` rule auto-attaches when source files are edited).
3. Let the assistant build. It will **STOP and ask** if it hits an escalation trigger.
4. **Review** (see checklist). For anything architectural, switch that chat to **Opus** OR start a
   short Opus chat and paste the diff — Opus review is cheap because it reads a diff, not the repo.
5. When acceptance criteria pass and build is green, commit.

> Rule of thumb: **cheap model builds, you skim, Opus reviews only on triggers.** Don't keep Opus
> in the loop during routine coding.

---

## Model selection guide

Pick the **cheapest model that can reliably do the ticket**. Tiers:

| Tier | Use for | Recommended model(s) | Notes |
|------|---------|----------------------|-------|
| **T1 – Mechanical** | CSS/layout, wiring an existing component, copy changes, simple list/filter, tests | **Composer (`composer-2.5-fast`)** or **Auto** | Cheapest & fast. Great for well-specified front-end. |
| **T2 – Standard feature** | New component + small API/state work, new endpoint following an existing pattern | **Claude 4.6 Sonnet** or **GPT‑5.5** | The workhorse for most tickets. |
| **T3 – Complex** | Multi-file logic, data-flow changes, anything cross-cutting (still no schema/arch decisions) | **GPT‑5.3 Codex** or **Claude 4.6 Sonnet (high thinking)** | Get Opus to confirm the ticket/design first. |
| **Architect** | ADRs, ambiguity, schema/migrations, money/auth/Etsy-publish, hard debugging, **diff review** | **Opus (Claude 4.x Opus)** = me | Front-loaded + review only. |

If a T1/T2 model stalls or repeats failures, **step up one tier** rather than fighting it — a
stuck cheap model can burn more than the next tier up.

**When in doubt about which model:** start one tier lower than you think; if it escalates or
struggles, bump it up.

---

## Review checklist (you, after a build)

- [ ] Does it match the ticket's **Acceptance criteria**? (skim, click through)
- [ ] Build is green / no type errors; no new lints.
- [ ] No hardcoded hex colors; uses `var(--ui-*)` and shared components.
- [ ] It did **not** quietly change schema, API shape, enums, or settings keys.
- [ ] If it touched auth/money/tax/Etsy-publish/shipping-label/outreach → **have Opus review the
      diff** before committing.
- [ ] Anything the assistant flagged with "STOP/escalate" is resolved.

---

## When to call the architect (Opus) — escalation triggers

Bring me in (paste the ticket + the diff or the question) when:
1. An ADR is **silent or contradictory** for a decision that must be made.
2. A **schema change / migration / new column, table, enum, or settings key** is needed.
3. The change touches **auth/tokens, financial math, tax, Etsy publish, payments, or shipping
   label purchase**.
4. Scope balloons **well beyond** the ticket's listed files, or needs a **new dependency**.
5. Tests/build can't pass without changing behavior the ticket didn't ask for.
6. You want a **design** for the next workstream, or a **diff review** of a risky change.

Everything else: let the cheap model handle it.

---

## Ticket index & per-ticket model recommendation

Phase 1 = quick wins (do these first). Build order top-to-bottom.

| Ticket | Workstream | ADRs | Recommended model | Why |
|--------|-----------|------|-------------------|-----|
| `WS-B_dashboard-activity-views.md` | B (dashboard Recent Activity 1/3 ÷ 2/3, newest 25) | ADR-016 §6 | **T1 – Composer** | Pure front-end layout + trimming an existing component. |
| `WS-D_low-quality-inventory-widget.md` *(to be written)* | D (low-quality widget) | ADR-016 §7, ADR-068 | **T2 – Sonnet / GPT‑5.5** | New widget + reads quality score; small data wiring. |
| `WS-A_activity-coverage.md` *(to be written)* | A (activity expansion, filters, deep-links) | ADR-037 §A1–A6, ADR-035, ADR-018 | **T2–T3 – Sonnet / GPT‑5.5**, Opus diff-review | Multi-file logging coverage + multi-type filter; review recommended. |

(Heavier workstreams — C, E, F, G, H — get their own tickets after Phase 1; several will need an
Opus design pass first, noted per ticket.)

---

## Notes
- Keep chats short and scoped; start a fresh chat per ticket.
- The `implementer` rule (`.cursor/rules/implementer.mdc`) auto-attaches when a model edits files
  under `src/**`, so the guardrails travel with every implementer session.
- This playbook and the tickets are the "manager" — static text, free to run. You pull the
  triggers.
