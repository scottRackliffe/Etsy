# WS-AICOST — Tiered AI model (cheaper model for auxiliary/vision tasks)

**Status:** done (2026-06-21)
**Size:** ▪▪ medium
**Created:** 2026-06-21
**Depends on:** none (retrofits existing + WS-G/WS-H call sites)
**Related ADRs:** ADR-023 (listing modes), ADR-072 (Listing Coach), ADR-075 (API usage),
ADR-082 (quality rubric §8b), ADR-083 (shot list), ADR-084 (dimension estimate), ADR-034 (Config).

---

## 1. Problem

All OpenAI calls resolve a **single** model from `getAiConfig().model` (`ai.model`,
default `gpt-4.1-mini`). The highest-volume / highest-cost calls are the **vision** ones, which
do not need the top model:

| Call site | Endpoint label (ADR-075) | Quality need |
|---|---|---|
| `listing-generator.ts` → `generateListingFromAi()` | `responses.create/generate-listing` | **High** — keep on primary |
| `listing-coach.ts` → `callAiJson()` (analyze + compose) | `responses.create/listing-coach` | **High** — keep on primary |
| `app/api/inventory/[id]/improve-listing/route.ts` | `responses.create/improve-listing` | **High** — keep on primary |
| `listing-photo-vision.ts` → `evaluatePhotoQuality()` | `responses.create/listing-photo-quality` | **Economy candidate** (per-photo scoring) |
| `shot-list.ts` → `generateShotList()` (WS-H1) | `responses.create/shot-list` | **Economy candidate** |
| `dimension-annotation.ts` → `estimateDimensions()` (WS-H2) | `responses.create/measure` | **Economy candidate** |
| `ai-config.ts` → `testAiConnection()` | `responses.create/test-connection` | trivial (primary fine) |

There is no way to route the economy-candidate tasks to a cheaper model, so vision-heavy
features (WS-G3, WS-H) cost more than necessary.

## 2. Goal

Add a **single, optional "economy model"** setting. Tasks tagged *economy* use it; everything
else uses the primary model. When the economy model is blank, **everything falls back to the
primary model** (zero behavior change until configured).

Explicitly **not** building per-task model pickers, multi-provider routing, or auto-tier
heuristics — one primary + one economy lane only.

## 3. Design

### 3.1 Setting
- New settings key **`ai.economy_model`** (TEXT, default `""`).
  - Empty → economy tasks use `ai.model` (no change).
  - Suggested value for OpenAI: `gpt-4.1-nano` (advisory only; user-editable).
- Reuses the same `ai.api_key` / `ai.base_url` / `ai.timeout_ms` / `ai.retry_count` /
  `ai.token_budget`. (Only the **model** differs per lane.)

### 3.2 Resolver (in `src/lib/ai-config.ts`)
```ts
export type AiTask =
  | "generate-listing" | "listing-coach" | "improve-listing"   // primary lane
  | "photo-quality" | "shot-list" | "measure" | "test";        // economy-eligible

const ECONOMY_TASKS = new Set<AiTask>(["photo-quality", "shot-list", "measure"]);

/** Resolve the model for a task: economy model for economy tasks when set, else primary. */
export function resolveModelForTask(config: AiConfig, task: AiTask): string {
  if (!ECONOMY_TASKS.has(task)) return config.model;
  const economy = (getSetting("ai.economy_model") ?? "").trim();
  return economy || config.model;
}
```
- Surface `ai.economy_model` in `getMaskedAiConfig()` and accept it in `saveAiConfig()`.

### 3.3 Wire call sites
At each economy-eligible call site, replace `config.model` (or `model`) with
`resolveModelForTask(config, "<task>")`. Keep the **ADR-075 endpoint labels unchanged** so
usage reporting still distinguishes call sites. Primary-lane sites are left as-is.

### 3.4 Config UI (ADR-034 AI section)
- Add an **"Economy model (optional)"** text field beneath the model field, with help text:
  *"Used for high-volume vision tasks (photo quality, shot list, measurements). Leave blank to
  use the primary model for everything."*
- Optional: extend the existing AI connection test to also ping the economy model when set
  (label `responses.create/test-connection-economy`), or note it as a follow-up.

## 4. Files
- `src/lib/ai-config.ts` — `AiTask`, `resolveModelForTask()`, economy in get/save/masked config.
- `src/lib/listing-photo-vision.ts` — use `resolveModelForTask(config, "photo-quality")`.
- `src/lib/shot-list.ts` (WS-H1) — `"shot-list"`.
- `src/lib/dimension-annotation.ts` (WS-H2) — `"measure"`.
- `src/app/api/settings/ai/route.ts` (or wherever AI config is saved) — accept `economy_model`.
- Config AI section component — new field.
- Docs: ADR-075 (note economy lane + label), ADR-034 (Config AI field), ADR-082/083/084
  (note vision calls honor the economy lane), `.cursorrules` (settings key `ai.economy_model`).

## 5. Acceptance criteria
- [ ] `ai.economy_model` setting exists; blank by default; editable in Config.
- [ ] With blank economy model, every AI call uses the primary model (no behavior change).
- [ ] With an economy model set, `photo-quality`, `shot-list`, and `measure` calls use it; the
      three primary-lane tasks still use `ai.model`.
- [ ] ADR-075 endpoint labels unchanged; `GET /api/usage` still attributes calls per site.
- [ ] Graceful: economy model resolution never throws; falls back to primary on blank/whitespace.
- [ ] `npm run build` passes; no lint errors.
- [ ] Docs updated (ADR-075, ADR-034, ADR-082/083/084 notes, `.cursorrules`).

## 6. Notes
- This ticket retrofits WS-G3 (already merged) and applies to WS-H1/H2 as they land. Until this
  ships, those vision calls correctly use the primary model.
- Keep token budgets per existing `ai.token_budget`; if economy responses need a different cap,
  add `ai.economy_token_budget` in a follow-up (not in scope here).
