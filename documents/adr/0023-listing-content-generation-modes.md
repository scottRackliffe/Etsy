# ADR-023: Listing content generation modes (manual, integrated AI, portable AI handoff)

## Status

**Superseded by ADR-085 (2026-06-21).**

> **Note (2026-06-21):** The "four operator-facing paths" model and the `listing_draft_state`
> machine (`draft → generated|imported → approved → published`) described below are **retired**.
> There is now a single listing system — the three-processor lifecycle (ADR-081) scored by the
> single rubric (ADR-082), ending in Publish-to-Etsy gated on `listing_phase = 'listing_ready'`.
> Direct field editing survives as plain editing (not a named "mode"); the integrated AI generate
> absorbs the former Listing Coach research/authoring; portable export/import, approve/reject, and
> the draft-state machine are removed. See **ADR-085** for the authoritative decision. This ADR is
> retained for historical context only.

Accepted (historical)

## Date

2026-02-16

## Context

The system needs a durable strategy for generating Etsy listing content (title, description, tags, category path) without forcing a single AI vendor dependency.

Product constraints:

- The app must be sellable as a standalone product.
- Some users will not want any AI provider setup.
- Some users will want direct AI automation in-app.
- Some users will want to use their own external AI tools manually.
- The system must keep final approval and Etsy publish control inside this app.

We considered three options:

1. In-app integrated AI provider flow.
2. User-provided API key flow (BYO key).
3. Portable handoff flow: export structured package, user runs external AI manually, re-import generated listing draft.

## Decision

The system will support **four operator-facing paths** with a single canonical listing-draft workflow (fourth path added 2026-05-24 — **ADR-072**).

### Canonical modes

1. **Manual mode (no AI dependency)**  
   User fills listing fields directly in app.

2. **Integrated AI mode (in-app generation)**  
   System generates listing content internally using configured provider.

3. **Portable AI handoff mode (export/import)**  
   System exports a versioned JSON package plus item picture references and explicit generation instructions. User runs any external AI manually and imports the generated JSON back into the app.

4. **Listing Coach mode (guided new listing — ADR-072)**  
   Recommended when **adding a new listing**. Operator pastes photos from macOS Photos (⌘C/⌘V), optionally pastes Google Visual Search screenshots, confirms AI-suggested answers to short questions, reviews price guidance, and receives a composed listing saved to inventory. Uses integrated AI; does not require Etsy OAuth. See ADR-072.

### Product default

The default workflow will be:

- Manual mode always available.
- Portable AI handoff available without provider configuration.
- Integrated AI optional (enabled only when provider configuration exists).

### Required invariants

- Etsy publish may occur only from an explicitly approved listing draft.
- All modes must pass the same readiness checks before generation/import approval.
- Imported/generated output must pass the same schema validation.
- Operator can always edit draft content before approval.
- All listings require `etsy_when_made` (Etsy era enum) and `etsy_taxonomy_id` (Etsy numeric category ID) to be set before publish. These are per-item fields on the inventory table (ADR-017).

### Required listing-authoring surfaces

> **Note (updated 2026-06-16):** The separate "Listing Workshop" panel UI has been removed. Listing fields (title, description, tags, strategy fields, etc.) are now consolidated directly into the `InventoryDetailPanel` component as a "Listing Content" section. The modes below describe content generation approaches, not separate UI panels.

The build must include these operator-facing capabilities:

1. **Inline editing (manual mode)**  
   Listing fields are editable directly in the inventory detail panel. Sections include: title strategy, product story/details, condition clarity, attributes, tags/keywords, pricing/shipping notes, and confidence checks.

2. **Hybrid portable handoff (export/import mode)** *(deferred to post-v1)*  
   Export structured listing package + pictures + clear generation instructions; user runs external AI manually; user imports generated draft; system validates and presents for approval.

3. **Integrated AI (in-app generation mode)**  
   "Regenerate with AI" button in the inventory detail panel sends item data + all pictures to configured AI provider. Returned structured JSON is saved directly to inventory listing fields. Settings fields and validation for provider connection data are in Config.

### Listing draft lifecycle

The listing workflow state model is:

- `draft` -> (`generated` or `imported`) -> `approved` -> `published`

Readiness is checked before generation but is not a separate draft state. The system validates that all required fields (item_number, description, condition_code, sale_revenue > 0, at least one picture) are present before allowing generation or import — this is a validation gate, not a lifecycle state.

Additional publish-gate fields (not required for draft/generation): `etsy_when_made`, `etsy_taxonomy_id`, `etsy_shipping_profile_id` or global default, `etsy_return_policy_id` or global default. See ADR-017 §1c for per-item vs global resolution.

`published` is irreversible from this workflow perspective; later edits are handled by separate Etsy update behavior.

> **Reconciliation note (2026-06-09):** Removed `ready_for_generation` from lifecycle. Canonical `listing_draft_state` enum is: `draft`, `generated`, `imported`, `approved`, `published` (matches ADR-017 DDL).

### Data contract for portable handoff

Export package must include:

- `schema_version`
- `export_id`
- `item_id`
- `item_number`
- normalized item context fields used for generation
- list of picture references included in prompt scope
- strict required output schema
- operator instructions (what quality bar to meet)

Import package must include:

- matching `schema_version`
- matching `item_id` (and if provided, `export_id`)
- generated listing fields
- optional AI metadata (model/provider) for audit only

## Consequences

### Positive

- No single-vendor lock-in.
- App remains usable without paid AI services.
- Users can choose cost/quality tradeoff outside the app.
- Consistent approval/publish safety regardless of generation path.

### Negative

- More implementation surface area (four modes including Listing Coach — ADR-072).
- Requires strict schema versioning and validation for import/export.
- Support documentation must clearly explain each mode.

## Notes

- ADR-018 remains the canonical API surface and must be updated to include export/import/approve endpoints before finalizing this workflow in production.
- ADR-021 validation rules apply equally to manual, integrated AI, and imported draft content.
- User-facing docs must not expose ADR terminology; they should describe this as “Manual,” “Generate in app,” “Import AI draft,” and **“Listing Coach”** (new listings).
- **ADR-072** is the canonical spec for Listing Coach; it extends integrated AI with clipboard photo intake, Google Visual Search screenshot support, confirm-card UX, and price guidance.
- “Guided winning-listing form” content source should stay aligned with user documentation and quality guidance in `documents/etsy-listing-template-and-requirements.md` and related tips content.
