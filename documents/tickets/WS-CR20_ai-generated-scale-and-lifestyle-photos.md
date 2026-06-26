# Ticket WS-CR20 — AI-generated scale & lifestyle photos (FUTURE / tech-gated)

> **Status: ON HOLD — FUTURE / TECH-GATED.** Do **not** start until image-generation
> fidelity is good enough to depict a real, patterned collectible *without altering it*,
> and to do so within Etsy's accurate-representation policy. Owner-aligned decision
> 2026-06-26. Like WS-061 (mobile), this is parked on purpose, with the reasoning recorded
> so the future pickup is deliberate, not spontaneous.

| Field | Value |
|-------|-------|
| Status | **ON HOLD — future enhancement** |
| Workstream | Listing photography / AI imaging — owner request 2026-06-26. |
| Source ADR | ADR-082 §8 (photos), ADR-083 (shot list), ADR-084 (dimension annotation). New ADR required first. |
| Recommended model | Owner-led design; image-gen model TBD (e.g. a future `gpt-image-*` with verified fidelity). |
| Complexity | Large — new AI capability + policy guardrails + UX. |
| Risk | **High** — authenticity / Etsy policy / brand trust. The whole reason it's gated. |
| Depends on | Image-gen tech maturity; a design ADR (below) before any code. |

## Goal

When the technology is good enough, let the picture AI **auto-generate** two shot-list
items from an existing real photo:
1. **In-hand / place-setting scale view** (`SCALE`).
2. **Styled tea setting / lifestyle** (`LIFESTYLE`).

Trigger idea (owner): once a usable base photo (and the scale/measurement data) exists, the
AI produces these staged shots automatically — reducing what the seller has to physically
shoot.

## Why it's parked (the honest constraints — keep on record)

Today's image-generation tech cannot do this while staying true to Etsy **and** the owner's
no-BS foundation. Three blockers, all of which must be *resolved* before this ticket opens:

1. **Etsy authenticity / policy.** Listing photos must accurately depict the actual item;
   Etsy actively polices AI-generated content. A fabricated scene is a misrepresentation
   risk.
2. **Fidelity loss.** Generative models *re-render* the product — altering pattern, trim,
   color, shape, or inventing/hiding details. Fatal for a vintage collectible where buyers
   scrutinize pattern and condition.
3. **A generated scale shot is self-defeating.** The value of an in-hand/place-setting shot
   is an *honest* size cue. A fabricated reference that's even slightly off-proportion
   misleads buyers → returns/disputes. It defeats its own purpose.

This also cuts against the system's deliberate philosophy: **the AI fixes the text; the
human provides the real photos.** Reopening this ticket means consciously revisiting that
line.

## What already exists (do NOT rebuild — this is the safe, honest cousin)

`renderAnnotatedImage()` in [dimension-annotation.ts](../../src/lib/dimension-annotation.ts)
already composites **scale-bar / dimension callouts onto the real `picture_1`** (Sharp + SVG
overlay), saved to a secondary slot, classified `measurement`, never the hero. That covers
the "scale bars on it" need **non-generatively** — the actual item is unchanged. The
measurement shot should keep using this, regardless of this ticket.

## Re-evaluation trigger (when does "the tech caught up"?)

Open this ticket only when an image-edit/generation model can pass a **fidelity test**:
given a real product photo of a patterned collectible, produce a staged scene where the
item's pattern, trim, color, shape, and condition are **visually identical** to the
original (no hallucinated/altered detail), verified by side-by-side review — AND the output
is consistent with Etsy's then-current AI-content policy.

## Acceptance criteria (when un-parked)

- [ ] **Design ADR first** ("AI image generation: scope & authenticity guardrails"):
      records the overlay-vs-generative distinction, the three constraints above, the
      fidelity test, labeling/disclosure rules, which shots are in scope, and cost.
- [ ] Lifestyle shots (if approved) are clearly labeled as styling mockups, never the hero,
      and only ship when the fidelity test passes.
- [ ] **No AI-generated in-hand scale shot** unless the fidelity/honesty problem is provably
      solved (default: stays a real user shot or the existing annotation).
- [ ] Generated images carry provenance/classification so they're never mistaken for raw
      photos.
- [ ] Cost per generated image is measured and acceptable (economy-lane mindset, ADR-086).

## Notes

Parked alongside WS-061 (mobile) as a deliberate "later, on purpose" item. The decision and
its reasoning are recorded here so that whoever revisits it inherits the full logic, not a
one-line wish.
