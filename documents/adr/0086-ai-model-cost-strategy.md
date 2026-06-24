# ADR-086: AI model selection & cost strategy — cheapest-first, escalate on proven inadequacy

## Status

Accepted

_Decision date 2026-06-23. The **policy** below is accepted and binding. The **escalation
mechanism** (try-cheap → measure → escalate with recorded evidence) is a stated requirement that is
**not yet fully implemented** — see Consequences / "Conformance gaps" — and is tracked in
`documents/CODE_DOC_CONFORMANCE_AUDIT_2026-06-23.md` (C9, C11, D1)._

## Date

2026-06-23

**Amends / extends:** ADR-075 (API usage tracking), ADR-082 (quality rubric — the adequacy
yardstick), ADR-083 / ADR-084 (AI vision tasks on the economy lane), ADR-085 (lifecycle Generate
step). Does not supersede any ADR.

## Context

AiCE's reason for existing is **world-class listings**, and its AI surface is growing (listing
generation, photo-quality scoring, shot-list generation, dimension annotation, receipt OCR, expense
receipt scanning, connection testing). These calls have usage-based billing (ADR-075). Two
constraints are therefore **both first-class**: keep **cost** down, and keep **listing quality**
world-class.

The naive resolutions are both wrong:

- "Use the premium model everywhere" — burns money on high-volume grunt work (OCR, vision) where a
  cheap model is fine.
- "Use the cheap model everywhere" — risks the listings, which are the whole point.

The code already has the **bones** of task-based routing (WS-AICOST): `resolveModelForTask()` +
`ECONOMY_TASKS` in `src/lib/ai-config.ts` send economy-eligible vision tasks (`photo-quality`,
`shot-list`, `measure`) to a cheaper `ai.economy_model`, and everything else to the primary
`ai.model`. But the selection is **static and one-shot**, listing generation is **pinned to the
primary model**, and the receipt-OCR / expense-scan features bypass the lane entirely and run on the
primary model.

Crucially, AiCE already owns an **objective adequacy yardstick**: the ADR-082 quality rubric and the
firm **85** publish gate (`listing.min_quality_score`, ADR-085 §4). That makes "is the cheap model
good enough?" a **measurable** question, not a guess.

## Decision

0. **Task–model fit ("right tool for the job") is the governing principle.** Match each task to the
   model tier its complexity actually requires — cheap models for simple work, capable models for
   complex work. _"Carpenters don't use a sledgehammer when the job calls for a tack hammer"_ (and
   the reverse is just as wrong). Two corollaries follow:
   - **It is not our job to uplift a weak model.** We do **not** spend engineering effort coaxing a
     less-capable model into doing complex work it isn't built for — increasing a model's raw
     capability is the **model owner's** job. Our job is to deliver the world-class system using the
     tools the task requires.
   - **Determine fit deliberately, then commit.** Establish where the cheaper tier is adequate and
     where it is not (evidence below), assign the tier per task, and use it — rather than fighting a
     known-inadequate tier on every call.

1. **Cheapest-model-first, escalate only on proven inadequacy.** Within the right-tool principle,
   default a task to the **least costly** tier and move up **only after the cheaper tier has been
   demonstrated inadequate** for it. Do not *assume* the premium model is required; require evidence.
   (For genuinely complex, world-class-critical work — e.g. listing generation — the evidence will
   typically justify the capable tier, and that is correct: the job calls for that tool.)

1a. **Three model tiers for listing work; engage each where it earns its cost.**
   - **Economy** (`ai.economy_model`) — high-volume vision grunt-work (photo-quality, shot-list,
     measurement). Already wired (ADR-083/084).
   - **Standard** (`ai.model`) — generation, and the scoring↔mitigation loop that drives a listing to
     the 85 quality gate.
   - **Premium** (`ai.premium_model`, to add) — a more capable model engaged only when standard is
     **proven inadequate** (evidence: the remediation loop stalls below 85) or when the user elects to
     push the score beyond 85. The crossover is **configurable, not hardcoded** — *where* premium is
     actually needed is an open empirical question (2026-06-23).

   **Reasoning-class premium models add a second cost dial (2026-06-24).** If the premium tier is a
   reasoning model (e.g. `gpt-5.5`), it does **not** take `temperature` — it takes a **reasoning
   effort** (none / low / medium / high / xhigh), where higher effort = better output at higher cost.
   So the cost/quality lever for a reasoning premium tier is *model + effort*, both configurable.
   Implementation (drop `temperature`, send `reasoning.effort`, expose an effort setting) is tracked
   in **WS-CR7** — without it, `temperature` is sent unconditionally and a reasoning premium model 400s.

   Cheapest tier does the groundwork; premium is spent only on evidence. **The listing flow and the
   user-observed remediation cycle that surfaces this evidence (the Stop / Cycle again / Advance AI
   controls) are specified in [ADR-089](0089-listing-remediation-cycle.md)** — kept there to keep this
   ADR about *tiers and cost*, not flow. **Status (2026-06-24, WP5): built.** The remediation cycle
   uses `ai.model` (standard) and escalates to `ai.premium_model` (premium) via "Advance AI"; one-shot
   `generate-listing-content` still uses `ai.model`. Auto-cycle (stall→escalate without a human) is the
   remaining future step, to be tuned from the evidence the user-observed cycle gathers.

2. **Adequacy is measured, not assumed.** "Inadequate" must be grounded in an objective signal —
   for listing generation, failing the ADR-082 quality bar (score < `listing.min_quality_score`,
   default 85); for other tasks, a task-appropriate failure/quality signal. Escalation decisions
   and their evidence should be **recorded** (so cost increases are auditable, consistent with
   ADR-075's cost-awareness goal).

3. **Multiple models routed per task.** Routing exists to spend money only where it changes the
   output. High-volume grunt work (OCR, vision classification, measurement) defaults to the cheapest
   adequate model; premium spend is reserved for where evidence shows it lifts the result.

4. **Model is configurable; provider is intentionally narrow today.** The model(s) are driven by
   settings (`ai.model`, `ai.economy_model`, …), so adopting a stronger model is a configuration
   change, not a code change. The provider is currently OpenAI-only by design (ADR-075); broadening
   to additional providers is a separate future decision and must update this ADR + ADR-075 in
   lockstep ("no ambiguity is Job 1").

## Consequences

- **Positive:** cost scales with value delivered; escalation is defensible with recorded evidence;
  the existing quality gate doubles as the cost-control trigger; adopting better models is a setting.
- **Cost of the rule:** requires building a **try-cheap → measure → escalate** capability and
  per-task cheap defaults, rather than the current static selection. Until that exists, the policy is
  partially aspirational.

### Conformance gaps to close (as of 2026-06-23)

These are open items measured against this decision (detail in
`documents/CODE_DOC_CONFORMANCE_AUDIT_2026-06-23.md`):

- **C11** — `receipts/ocr` and `expenses/scan` call the **primary** model directly, bypassing
  `resolveModelForTask`. They should default to the cheapest adequate model (add `receipt-ocr` /
  `expense-scan` tasks to the economy lane).
- **D1** — `generate-listing` is pinned to the primary model and the router has no escalation loop.
  Under this ADR it should start cheapest and escalate only when the quality bar is missed.
- **C9** — ADR-075's OpenAI call-site inventory is stale (4 vs. actual 7) and omits the OCR/scan
  features; reconcile so cost tracking covers every AI call site.

## Cross-references to update when implemented

- ADR-075 — add the OCR/scan call sites; note per-task model lanes and escalation events in usage
  tracking.
- ADR-082 / ADR-085 §4 — reference the 85 gate as the listing-generation adequacy signal for
  escalation.
- `src/lib/ai-config.ts` — extend `AiTask` / `ECONOMY_TASKS`; add escalation routing.
