# ADR-023: Listing content generation modes (manual, integrated AI, portable AI handoff)

## Status

Accepted

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

The system will support all three modes with a single canonical listing-draft workflow.

### Canonical modes

1. **Manual mode (no AI dependency)**  
   User fills listing fields directly in app.

2. **Integrated AI mode (in-app generation)**  
   System generates listing content internally using configured provider.

3. **Portable AI handoff mode (export/import)**  
   System exports a versioned JSON package plus item picture references and explicit generation instructions. User runs any external AI manually and imports the generated JSON back into the app.

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

### Required listing-authoring surfaces

The build must include these three operator-facing capabilities:

1. **Guided winning-listing form (manual mode)**  
   A structured form that mirrors recommended winning-listing sections (title strategy, product story/details, condition clarity, attributes, tags/keywords, pricing/shipping notes, and confidence checks) so users can produce high-quality listings without AI.

2. **Hybrid portable handoff (export/import mode)**  
   Export structured listing package + pictures + clear generation instructions; user runs external AI manually; user imports generated draft; system validates and presents for approval.

3. **Integrated AI connection configuration (in-app generation mode)**  
   Settings fields and validation for provider connection data required for internal generation (provider type, model, key/token or endpoint configuration, optional org/project, timeout/retry/token limits, and safe test-connection behavior).

### Listing draft lifecycle

The listing workflow state model is:

- `draft` -> `ready_for_generation` -> (`generated` or `imported`) -> `approved` -> `published`

`published` is irreversible from this workflow perspective; later edits are handled by separate Etsy update behavior.

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

- More implementation surface area (three modes).
- Requires strict schema versioning and validation for import/export.
- Support documentation must clearly explain each mode.

## Notes

- ADR-018 remains the canonical API surface and must be updated to include export/import/approve endpoints before finalizing this workflow in production.
- ADR-021 validation rules apply equally to manual, integrated AI, and imported draft content.
- User-facing docs must not expose ADR terminology; they should describe this as “Manual,” “Generate in app,” and “Import AI draft.”
- “Guided winning-listing form” content source should stay aligned with user documentation and quality guidance in `documents/etsy-listing-template-and-requirements.md` and related tips content.
