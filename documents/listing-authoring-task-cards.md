# Listing Authoring Task Cards (Manual + Hybrid + Integrated AI)

This implementation checklist is the execution companion for:

- `documents/adr/0023-listing-content-generation-modes.md`
- `documents/adr/0018-api-surface-endpoints.md`
- `documents/etsy-listing-template-and-requirements.md`
- `documents/pictures-and-sales.md`
- `documents/tutorial.md` and `system/tips/How to Win on Etsy` guidance

Use this file as the build list for listing-authoring completion.

---

## 1) Manual Winning-Listing Guided Form

### 1.1 UI task cards

- Build `Listing Authoring` panel/section for item detail with mode toggle:
  - `Manual`
  - `Generate in app`
  - `Import AI draft`
- Build form sections (all required in UI, with inline hints):
  - Title strategy (clear item intent, searchable wording, no spam)
  - Product details/story (what it is, era/material, why it is valuable)
  - Condition and defects (honest disclosure tied to condition pictures)
  - Attributes and category fit
  - Tags/keywords (search intent coverage, avoid duplicates)
  - Pricing/shipping notes (packed size/weight assumptions, handling notes)
  - Final quality checklist (clarity, compliance, typo check, policy check)
- Add `Save draft` and `Approve draft` actions.
- Add read-only summary card after approval.

### 1.2 Data task cards

- Ensure inventory listing fields are complete and normalized:
  - `listing_title`
  - `listing_description`
  - `listing_tags`
  - `listing_category_path`
- Add explicit draft status fields if not present:
  - `listing_draft_state` (`draft|generated|imported|approved|published`)
  - `listing_draft_source` (`manual|integrated_ai|portable_import`)
  - `listing_approved_at`, `listing_approved_by`
- Add migration for any new fields.

### 1.3 Validation task cards

- Reuse preflight readiness rules before allowing approve:
  - item number
  - description
  - condition code
  - sale revenue > 0
  - at least one picture
- Add manual-form quality checks:
  - title minimum and maximum length
  - description minimum length
  - tags count and uniqueness
  - prohibited empty required sections
- Surface failures with standard API error envelope and actionable steps.

---

## 2) Hybrid Portable AI Handoff (Export/Import)

### 2.1 API task cards

- Add `POST /api/inventory/[id]/listing-export`
  - Validate listing-readiness preconditions.
  - Return versioned export package JSON + picture reference manifest.
  - Include strict output schema and instructions block.
- Add `POST /api/inventory/[id]/listing-import`
  - Accept imported draft JSON.
  - Validate `schema_version`, `item_id`, and optional `export_id`.
  - Validate output fields (title/description/tags/category path).
  - Store imported draft and mark `listing_draft_source=portable_import`.
- Add `POST /api/inventory/[id]/listing-approve`
  - Requires valid draft payload and readiness checks.
  - Transitions state to `approved`.
- Update publish endpoint behavior (or add endpoint) to enforce:
  - only `approved` drafts can be published to Etsy.

### 2.2 Export package contract task cards

- Define canonical export schema:
  - `schema_version`
  - `export_id`
  - `item_id`, `item_number`
  - `item_context`
  - `picture_references`
  - `required_output_schema`
  - `quality_instructions`
- Add hash/signature fields for integrity checks (manifest hash at minimum).
- Store export audit row (export id, timestamp, user/session).

### 2.3 Import contract task cards

- Define canonical import schema:
  - `schema_version`
  - `item_id`, `export_id` (if present in export)
  - `listing_title`
  - `listing_description`
  - `listing_tags`
  - `listing_category_path`
  - optional `ai_metadata`
- Store import audit row (timestamp, source, validation result).

---

## 3) Integrated AI Connection (Internal Generation)

### 3.1 Config/settings UI task cards

- Add `AI Provider Settings` form in Config:
  - provider (`openai|gemini|openrouter|custom`)
  - model
  - auth fields (key/token and optional endpoint/base URL)
  - optional org/project identifiers
  - timeout, retry count, token budget
- Add `Test connection` action with clear success/error status.
- Add provider-specific helper text and required field indicators.

### 3.2 Backend settings and security task cards

- Store provider config in settings table (or secured secrets store strategy).
- Do not log raw API keys.
- Return masked values in API responses.
- Add setting validation endpoint behavior and error guidance.

### 3.3 Generator integration task cards

- Refactor listing generator into provider strategy layer:
  - manual mode passthrough
  - integrated provider adapter(s)
  - portable import adapter path
- Ensure all integrated generation writes through same validation and draft state transitions.
- Persist generation metadata for troubleshooting (provider/model/duration/status).

---

## 4) Shared UX and Workflow Requirements

- Mode switch is explicit and persisted per item draft.
- User can edit generated/imported drafts before approval.
- Approval action is separate from generation/import action.
- Publish action is disabled unless state is `approved`.
- Failures must never block manual editing fallback.

---

## 5) Test Task Cards

### 5.1 Unit/integration

- Validate manual form field rules.
- Validate export schema generation and import schema parsing.
- Validate state transitions:
  - `draft -> generated/imported -> approved -> published`
- Validate publish guard rejects non-approved drafts.
- Validate provider settings validation and masking behavior.

### 5.2 End-to-end manual scenarios

- Manual mode: create, validate, approve, publish.
- Hybrid mode: export package, external edit simulation, import, approve, publish.
- Integrated mode: valid provider config, generate, edit, approve, publish.
- Failure scenarios:
  - bad import schema
  - mismatched item id/export id
  - provider connection failure
  - missing required item readiness data

---

## 6) Documentation Task Cards

- Update user docs for three listing modes (non-ADR wording):
  - `Manual`
  - `Generate in app`
  - `Import AI draft`
- Add operator step-by-step examples for each mode in:
  - `documents/operating-the-system.md`
  - `documents/tutorial.md`
- Update API examples in ADR-018 once endpoints are finalized.

---

## 7) Completion Gate (for this build slice)

This slice is complete only when all are true:

- Manual guided form shipped with all required sections.
- Hybrid export/import endpoints and validation shipped.
- Integrated AI settings + connection test + generation path shipped.
- Approval-before-publish enforced in API and UI.
- Test plan and manual scenarios updated and passing.
