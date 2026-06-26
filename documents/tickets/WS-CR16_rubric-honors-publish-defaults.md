# Ticket WS-CR16 — Quality rubric must honor publish defaults (who_made / when_made)

| Field | Value |
|-------|-------|
| Status | **OPEN** — Tier 2 |
| Workstream | **Conformance Remediation** — live-test finding 2026-06-26. |
| Source ADR | ADR-082 (rubric), ADR-034 §14 (publish defaults). Sibling of C7. |
| Recommended model | Sonnet — bounded logic fix, mirror existing code. |
| Complexity | Small–Medium. |
| Risk | Medium — rubric is the gate; don't change other categories' scoring. |
| Depends on | — |

## Problem

`validatePublishReadiness` already resolves `who_made` / `when_made` from settings
defaults ([inventory-validation.ts:105,119](../../src/lib/inventory-validation.ts) —
`item.etsy_who_made ?? settings["etsy.publish.default_who_made"]`). But the **quality
rubric** checks the **item field directly** ([listing-rubric.ts:426,436](../../src/lib/listing-rubric.ts) —
`if (str(row.etsy_when_made)) earned += 2` / `etsy_who_made`). So an owner who sets a
publish default still gets nagged ("Who-made attribute not set") even though publish
will apply it. This is the **same inconsistency class as C7**, in the rubric.

Note: `who_made` is **not** derived from the backstamp — it's the Etsy attribute
"who made it relative to the seller" (`i_did` / `someone_else` / `collective`), which
for vintage resale is effectively always `someone_else`.

## Goal

Make the rubric resolve `who_made` and `when_made` from the **same publish defaults**
the publish validator uses, so a configured default earns the points and clears the
finding.

- Pass the resolved defaults into `evaluateListingQuality` (the
  [listing-quality route](../../src/app/api/inventory/%5Bid%5D/listing-quality/route.ts)
  already loads settings via the settings store — load `etsy.publish.default_who_made`
  and `etsy.publish.default_when_made` and pass them in `opts`).
- **Locked decision:** credit the category when the value is present **on the item OR
  as a publish default** (consistent with what will actually be published).

## Out of scope

- Auto-setting a default for the owner / new Settings UI (separate; see WS-CR1-style work).
- Any other rubric category.

## Acceptance criteria

- [ ] With `etsy.publish.default_who_made` set, the rubric no longer flags
      "Who-made attribute not set" and awards the point.
- [ ] Same for `when_made`.
- [ ] No change to scoring when neither item value nor default is set.
- [ ] `npm run type-check` + `npm run build` pass.

## Kickoff prompt

> Implement `documents/tickets/WS-CR16_rubric-honors-publish-defaults.md`. Make
> `evaluateListingQuality` resolve `etsy_who_made`/`etsy_when_made` from the publish
> defaults (`etsy.publish.default_who_made`/`default_when_made`) like
> inventory-validation.ts:105,119 — pass them via opts from the listing-quality route.
> Credit the category if the item value OR the default is present. Touch only those two
> checks.
