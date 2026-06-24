# Code ↔ Docs Conformance Audit — 2026-06-23

Bidirectional deep audit following the **doc-side** ADR audit (completed 2026-06-22, log at
`documents/ADR_AUDIT_2026-06-22.md`). The doc side is now the trustworthy spec. This phase measures
the **code** (`src/`, `migrations/`, `tests/`, `scripts/`) against it.

**Two directions:**
1. **Code → docs (conformance):** does the app actually do what the ADRs/docs now say?
2. **Docs ← code (gaps):** capabilities the code has that **no ADR describes** → flag to document.

**Method (same as prior audit):** record raw findings as `C#` (code-conformance) below. Code is
ground truth where docs/code disagree on *fact*; the owner resolves direction during a walkthrough
(decisions are theirs — "No ambiguity is Job 1"). Several items here were explicitly **deferred from
the doc audit to this phase** (the "Verify (code, not docs)" rows): WS-L6 Coach/Workshop code
removal, F16 migration index ordering, F29 `who_made` validation.

> **STATUS: AUDIT + WALKTHROUGH + DOCUMENTATION COMPLETE; REMEDIATION LARGELY EXECUTED (2026-06-23).**
> All 10 clusters swept; findings **C1–C22**, gaps **G1–G4**, direction **D1**. Owner walkthrough
> (6 themes A–F) decided with rationale. New ADRs: **086** (AI cost), **087** (schema SSOT), **088**
> (financial-reports), **089** (remediation cycle).
>
> **DOCUMENTATION: COMPLETE.** Every finding is resolved or documented. C16 dirs deleted; C18 marked
> descoped in ADR-018; G3 moot post-C7; tax-as-expense recorded in ADR-077 §6; financial reports in
> ADR-088; WP5 design split across ADR-086 §1a / ADR-089 / ADR-085 §2&§5; G4 withdrawn (was
> inaccurate).
>
> **REMEDIATION EXECUTED:** WP1 ✅, WP2 ✅ (C3–C7), WP3 ✅ core (migrations 018/019 + bootstrap
> converged — verified), WP4 ✅ backend, **WP5 ✅ built 2026-06-24** (cycle endpoint + UI + premium
> tier; docs-first per ADR-089/086/034/018), WP6 ✅, WP7 ✅, C16 ✅. **REMAINING = UI-finish/OPS ONLY
> (no docs):** (a) WP4 dashboard tax badge + 3 Settings inputs; (b) WP3 full bootstrap *deletion* —
> gated on a `npm run dev` boot smoke-test; (c) WP5 + WP1/WP3 live behaviour confirmation via
> `npm run dev` smoke-test; (d) ops: run `npm run db:migrate` on the live DB; (e) future: WP5
> auto-cycle (stall→escalate) once the user-observed cycle gathers evidence.
>
> **Headline (act first):** C7 (publish rejects global-default fields), C13 (`tax_payments` missing
> from bootstrap → crash), C14 (bootstrap/migrations diverged), C1 (orphaned test reds CI), C11/D1
> (AI cost: OCR on premium model, no cheapest-first), C10 (AI key plaintext).
> **Large conformant surface verified** (OAuth/scopes/tokens, EasyPost, RI, nav/SEMS, all feature
> ADRs 040–067, pagination, ADR-018 removal hygiene). **Remaining depth (optional second pass):**
> ADR-082 rubric field-by-field, ADR-085 §2 generate-listing output schema, ADR-058 exact pragma
> values, column-level ADR-002/017 diff, `/api/jobs/[id]/stream` (C18).

---

## Owner walkthrough — decisions & rationale (in progress 2026-06-23)

> Purpose (owner): work through the findings deliberately and **record the logic / direction-change
> background behind each decision** — so the materials read as intentional, not spontaneous, which
> drives acceptance. Mirrors the doc audit's "Review decisions" table. Code is ground truth on
> *fact*; the owner decides *direction*. "No ambiguity is Job 1."
>
> **WALKTHROUGH COMPLETE (2026-06-23).** All 6 themes decided (A–F), all 22 findings + 4 gaps + D1
> resolved with rationale. Two decisions captured docs-first as new ADRs (086, 087); ADR-086 refined
> with the 3-phase engagement (§1a). Remediation plan below.

### Findings grouped by root-cause theme (the walkthrough order)

| Theme | Root cause | Findings | Direction-change background (owner to provide) | Decision |
| --- | --- | --- | --- | --- |
| **A. Coach/Workshop removal aftermath** | WS-L6 removed the Coach/Workshop but left code/schema/test/dir stragglers | C1, C2, C12, C16, (C8) | The Coach/Workshop (two parallel listing systems) was removed to achieve **consistency and eliminate ambiguity** — unnecessary complexity/confusion; world-class systems have no inconsistencies. **Deeper "why" (2026-06-23):** the wizard/assistant premise was "guide the user so they *learn* and eventually need it less." That premise was **flawed** — the real value is **not teaching a person why techniques work**, it's the **AI producing content already aligned with recent, data-backed (years of online-sales-data) best practices**. Removing the Coach corrected a flawed premise, not just clutter. (Superseded by the single unified lifecycle, ADR-085.) | **Complete the removal — delete every straggler.** A half-removed feature is itself the ambiguity/inconsistency the removal existed to kill, so finishing it is required by the same principle. |
| **B. AI cost & model strategy** | AI surface grew; cost-discipline + cheapest-first added later (→ ADR-086) | C9, C10, C11, D1, G1, G2, G3, G4 | Common sense **task–model fit**: determine where cheaper models *can* do the job and where they *cannot*. We will **not waste effort trying to teach a less-capable model to do complex things — that is the model owner's job**, not ours. Our job is to deliver the world-class system using the **tools the task requires**. _"Carpenters don't use a sledgehammer when the job calls for a tack hammer"_ (and vice-versa). | **Refine ADR-086 to "right tool for the job."** Match each task to the appropriate model tier (proven by the quality bar), use cheap where adequate and capable where required, and do **not** invest in uplifting a weak model. Then: route simple tasks (OCR/scan) to cheap (C11), keep complex listing-gen on the capable tier, document call-sites+tiers (C9), encrypt the AI key (C10), document features/settings (G1–G4). |
| **C. Schema SSOT (bootstrap vs migrations)** | Two parallel schema sources drifted apart | C13, C14 | The schema is **critical**. Development involved **many direction changes**; the codebase and DB took **many additions and deletions** along the way (prototyped → built → restructured repeatedly). At this lifecycle point, engineers who **understand the project history** must examine the **structure and procedures** that manage the DB and keep it **healthy**: **remove the unnecessary, re-architect inefficiency, and ensure alignment with industry best practices.** | **Dedicated database-health re-architecture → migrations as the single source of truth** (forward-only, versioned; app *applies* pending migrations). Retire the parallel hand-maintained bootstrap schema; remove dead schema (ties to Theme A); align to best practices. Captured as **ADR-087**. Fixes C13/C14 at the root, not as band-aids. |
| **D. Publish-validation evolution** | F29 → who_made gating commit changed the rules under the docs | C3, C4, C5, C6, C7 | _pending_ | _pending_ |
| **E. Doc-surface completeness + Expenses/tax history** | New features/reports added without back-filling the index ADRs | C17, C18, C20, C21, **C22** | **Tax payments were the *beginning* of the Expenses function (once "AP Lite").** When the true scope/clarity of the Expenses processes was documented, it became clear **tax payments are just another expense**, so they were **blended into Expenses**. The accounting reports (Income Statement / Balance Sheet, per ADR-077's motivation) are an **intentional** financial-reporting set, not exploratory. **However**, CT sales-tax remittance is **compliance-critical** — penalties for late filing — so tax retains a **focus** emphasis: ensure it is **filed on time**. | **Treat the accounting suite as an intentional, documentable feature set** → write a financial-reports ADR (C20); back-fill ADR-018 endpoints (C17) and tidy ADR-006 residuals (C21). **Document the tax-as-expense blending** + the compliance-focus requirement in ADR-077/039. **Build the on-time-filing focus** (C22). The schema re-architecture (ADR-087) should resolve `tax_payments` vs `business_expenses` cleanly **while preserving** the CT compliance tracking. |
| **F. Naming cleanup** | Rename (Sales→Orders, Config→Settings, →AiCE) reached docs/UI but not all code/scripts | C15, C19 | Same governing principle already established (Themes A/C): **simplify and be consistent** — world-class systems don't carry residual inconsistencies. These stale internal names are leftover residue from a rename that reached docs + UI but not the last code/script corners. | **Rename to canonical terms.** C15: "Etsy Sales Manager" → **AiCE** in `start.sh` / `install-esm.mjs`. C19: `components/sales/` → `components/orders/`, `components/config/` → `components/settings/` (internal-only; update imports). |

### Remediation plan (Step 3 → Step 4)

Work packages (WPs), each following the owner's sequence **document → define → code → test** ("doc is
always first"); a final **Step 4 system exercise** after all land. Ordered by value/risk.

| WP | Scope | Findings | Type | Priority | Notes |
| --- | --- | --- | --- | --- | --- |
| **WP1 — Quick wins** | Delete orphaned test (greens CI); route OCR/scan to economy lane; encrypt AI key via `secret-crypto` | C1, C11, C10 | code, low-risk | **1st** | ✅ DONE 2026-06-23 (Sonnet). Type-check clean; unit suite passes. AI key now `ai.api_key_encrypted` with legacy-plaintext migration on read. |
| **WP2 — Publish validation fix** | Fix validator/route global-default mismatch; reconcile materials/weight/dimension severity + messages | C7, C3, C4, C5, C6 | code+doc | **2nd** | ✅ DONE 2026-06-23. C7: validator+route now share who_made/when_made/taxonomy/return/shipping default fallbacks (`inventory-validation.ts`, `publish-to-etsy/route.ts`). C3–C6: ADR-021 §8 aligned to code (blocking model + actual messages). Type-check clean. _Follow-up: no TS unit-test harness — regression test deferred._ |
| **WP3 — Schema health re-architecture (ADR-087)** | Migrations = SSOT; app applies migrations; retire parallel bootstrap; drop dead column/tables; resolve `tax_payments`↔`business_expenses` (preserve compliance) | C13, C14, C2, C12 | code+migration+test | **3rd (heavy)** | ⏳ MOSTLY DONE 2026-06-23. ✅ migrations 018 (consolidate: 6 tables/8 cols/6 idx) + 019 (drop dead schema) — **verified** fresh==golden & upgrade-path data-preserving. ✅ bootstrap corrected (`sqlite.ts`: +tax_payments fixes C13; dead schema removed → matches migrations, fixes C14/C2/C12). Type-check clean. ⏳ DEFERRED: full bootstrap retirement (getDb applies migrations) — gated on `npm run dev` boot smoke-test. See ADR-087 impl status. |
| **WP4 — Tax compliance focus (NEW build)** | Outstanding tax liability + filing due-dates + reminder; surface on Outstanding/dashboard | C22 | code+doc | **High (penalty risk)** | ✅ CORE DONE 2026-06-23. Liability already computed (`getTaxPaymentSummary`); added `getTaxComplianceStatus()` (filing_status/days_until_due from owner-configured `tax.next_filing_due_date`/`filing_frequency`/`filing_reminder_days` — **no jurisdiction calendar hardcoded**). Exposed via `/api/tax-payments/summary` + `getDashboardStats().tax_compliance`. Documented ADR-039 §7. Type-check clean. ⏳ UI finish (dashboard badge + Settings inputs) needs live verification. |
| **WP5 — 3-phase model engagement (ADR-086 §1a + ADR-089)** | Score/lifecycle/remediation-driven tiered escalation; replaces static two-tier. Docs split: tiers/cost → ADR-086 §1a; flow + user-observed cycle (Stop/Cycle/Advance) → ADR-089. | D1 | code+test | Medium (larger) | ✅ BUILT 2026-06-24. Endpoint `POST /api/inventory/[id]/listing-remediation-cycle` (mine) + `RemediationCyclePanel` UI + `ai.premium_model` setting (Sonnet) + `model?` escalation hook on callAiJson/refineListing. Type-check clean, unit suite green. Live AI behaviour pending owner `npm run dev` smoke-test. (Auto-cycle stall→escalate = future.) ⏸ was NOT BUILT — **blocked on owner-supplied facts, deliberately not guessed.** Design documented (ADR-086 §1a). Implementation needs: (1) the tier→model assignments + score-band thresholds (which model at which score), and (2) **live AI verification** (real generate→evaluate runs measured vs the 85 gate) — neither can be invented or done headless without the owner's model choices + API spend. Build once those facts are provided. |
| **WP6 — Doc-surface completeness** | Financial-reports ADR; back-fill ADR-018 endpoints; tidy ADR-006 residuals; document AI call-sites/tiers, OCR/scan features, publish defaults/settings, tax-as-expense; verify jobs/stream | C20, C17, C21, C9, C18, G1–G4 | doc | Medium (parallelizable) | ⏳ PARTIAL 2026-06-23 (Sonnet): C8, C9, C17, C21 DONE (ADR-075 call-sites→7; ADR-018 +21 endpoints; ADR-006 residuals cleared). REMAINING: C20 (financial-reports ADR), C18 (jobs/stream), G1–G4 + tax-as-expense docs. |
| **WP7 — Naming cleanup** | "Etsy Sales Manager"→AiCE in scripts; `components/sales/`→`orders/`, `config/`→`settings/` | C15, C19 | code (mechanical) | Low (anytime) | Internal-only; update imports. |

**Step 4 — Full system exercise** once WP1–WP7 land: end-to-end run of the listing lifecycle
(Evaluate Data → 3-phase Generate → Evaluate Quality → Publish), tax recording + on-time-filing focus,
shipping, reports, and a fresh-install (migrations-only) boot to confirm the schema SSOT.

### Per-finding decisions (filled during walkthrough)

**Theme A — Coach/Workshop removal aftermath (DECIDED 2026-06-23).** Rationale: the removal existed
to deliver consistency / eliminate ambiguity for a world-class system; leftover artifacts are that
same ambiguity, so the removal must be finished.
- **C1 — DELETE** the orphaned `tests/unit/listing-coach-normalize.test.mjs` (its module is
  intentionally gone; deleting also un-reds the unit suite).
- **C2 — DROP** the dead `listing_draft_state` column (migration; remove from `sqlite.ts` bootstrap).
- **C12 — DROP** the dead tables `listing_exports`, `listing_imports`, `listing_publish_previews`
  (migration; remove from bootstrap + migration 001 lineage as appropriate).
- **C16 — DELETE** the empty dirs `src/app/api/inventory/[id]/listing-score/` and
  `src/app/api/auth/etsy/restore-session/`.
- **C8 (removal-ref part) — FIX** ADR-075's stale citation of the removed
  `improve-listing/route.ts` (and repoint `listing-generator.ts` → `listing-ai.ts`). (C8's
  call-site-count issue is handled under Theme B.)
- _Implementation deferred to step 3 (coded → tested); no code changed during the walkthrough._

**Theme B — AI cost & model strategy (DECIDED 2026-06-23).** Rationale: task–model fit / right tool
for the job; uplifting a weak model is the provider's job, not ours; deliver world-class with the
tools the task requires. ADR-086 to be refined to express this (see ADR-086 edit).
- **C11 — ROUTE to cheap.** Receipt-OCR + expense-scan are simple extraction ("tack hammer") →
  add `receipt-ocr` / `expense-scan` to the economy lane via `resolveModelForTask`.
- **D1 — Listing generation stays on the capable tier** (complex, world-class-critical = the job
  genuinely needs the better tool), but **determine** (via the ADR-082 quality bar) whether a cheaper
  tier can clear 85 for given item types; where it can't, use capable and don't fight it. Build the
  per-task tiering + (one-time) adequacy determination rather than a per-call retry loop.
- **D1 / 3-PHASE MODEL ENGAGEMENT — DEFINED (owner 2026-06-23).** "3 phases to engaging the higher-end
  models as the listing score improves" = **three correlated facets of one escalation signal**, all
  moving together: **(i) lifecycle step** (Evaluate Data/draft → Generate → Evaluate Quality/remediate),
  **(ii) score band** (low → mid → near-gate 85→~100), **(iii) remediation pass** (1 cheap → 2 stronger
  → 3 top, until the 85 gate clears). Cheap models do groundwork; top models do the final push to a
  world-class score. Now documented in **ADR-086 Decision §1a**. Current code is static two-tier with no
  escalation → this is the target build (D1).
- **C9 — DOCUMENT** all AI call sites + their assigned model tier in ADR-075 (fixes the 4-vs-7 count).
- **C10 — ENCRYPT** the AI key via `secret-crypto` (consistency with OAuth/EasyPost); doc name
  `ai.api_key_encrypted` then becomes accurate.
- **G1/G2 — DOCUMENT** receipt-OCR + expense-scan as AI features (ADR coverage + their cheap tier).
- **G3/G4 — DOCUMENT** the hardcoded publish defaults + the `etsy.publish.*` image/transform settings.

**Theme C — Schema SSOT / database health (DECIDED 2026-06-23).** Rationale: critical schema grown
through many pivots (add/delete cycles); needs a deliberate health re-architecture by engineers who
know the history — remove the unnecessary, fix inefficiency, align to best practices. Captured as
**ADR-087**.
- **Direction: migrations are the single source of truth** (forward-only, versioned). The app applies
  pending migrations (guarded init / deploy step); the `ensureCoreTables`/`ensureInventorySchema`
  parallel schema is retired (or generated from migrations), ending the dual-source drift.
- **C13 — RESOLVED by direction:** once migrations are SSOT and applied at startup, `tax_payments`
  (and the 6 bootstrap-only tables) come from one authoritative path — no missing-table crash.
- **C14 — RESOLVED by direction:** no second schema definition to diverge.
- Scope note: this is a focused engineering task (schema review + migration consolidation + health
  procedures), not a one-line patch; deferred to step 3. Dead-schema removal (C2/C12) folds in here.

**Theme E — Doc-surface completeness + Expenses/tax history (DECIDED 2026-06-23).** Background: tax
payments were the seed of the Expenses function (ex-"AP Lite"); once Expenses scope was clarified,
tax became "just another expense" and was blended in; the accounting reports are an intentional set;
CT tax filing is compliance-critical (penalties → on-time focus).
- **C20 — WRITE a financial-reports ADR** for the accounting suite (balance-sheet, income-statement,
  ar-aging, vendor-profitability) — intentional, motivated by ADR-077's Income-Statement/Balance-Sheet
  goals; make its scope unambiguous. (Or extend ADR-006; new ADR preferred for clarity.)
- **C17 — BACK-FILL** the ~20 live endpoints into ADR-018 (or cross-ref owning ADRs); add
  vendor-profitability (also missing from ADR-018).
- **C21 — TIDY** ADR-006's title/Context/Notes residuals (still list removed income-mtd/ytd/postal).
- **C18 — VERIFY** `/api/jobs/[id]/stream` (descoped vs unbuilt); reconcile doc/code. (low)
- **Tax-as-expense — DOCUMENT** the blending rationale + the compliance-focus requirement in
  ADR-077 (expenses) and ADR-039 (tax).
- **C22 — BUILD + DOCUMENT the on-time-filing focus** (outstanding tax liability + due dates +
  reminder; Outstanding/dashboard surfacing). High priority (penalty risk).
- **Schema interaction:** ADR-087 re-architecture resolves `tax_payments` vs `business_expenses`
  (already partially blended — `tax-payments.ts` reads both) **while preserving** CT compliance data.

**Theme D — Publish-validation evolution (DECIDED 2026-06-23).** Rationale: the F29 who_made-gating
commit tightened the gate (to avoid Etsy publish failures) but moved rules out from under the docs and
left the validator and route disagreeing on global-default fallbacks. Make them agree and align docs.
- **C7 — FIX (functional):** make `validatePublishReadiness` and the publish route agree on which
  fields resolve from global Settings defaults (who_made/when_made/taxonomy/shipping/return-policy).
  Pass the full publish settings to the validator; items relying on a configured default must publish.
- **C3/C4/C5 — RECONCILE severity + behavior** (materials/weight/dimensions: blocking-vs-warning,
  charset rule, all-three-dimensions) between ADR-021 §8 and code; pick one truth and align both.
- **C6 — ALIGN** documented error strings to code (or vice-versa).

**Theme F — Naming cleanup (DECIDED 2026-06-23).** Rationale: same simplify/consistency principle
(Themes A/C); world-class systems carry no residual inconsistency.
- **C15 — RENAME** "Etsy Sales Manager" → **AiCE** in `start.sh`, `scripts/install-esm.mjs`.
- **C19 — RENAME** `src/components/sales/` → `orders/`, `src/components/config/` → `settings/`
  (internal-only; update imports). Lower priority; mechanical.

---

## Audit clusters (coverage tracker)

| # | Cluster | ADRs | Code surface | Status |
| --- | --- | --- | --- | --- |
| 1 | Listing lifecycle / quality / AI | 023,068,072,079,081,082,083,084,085 | `src/lib/listing-*`, AI gen, validation | ✅ AI/lifecycle pass done (C1–C11,G1–G4,D1) |
| 2 | Data model / schema / migrations | 001,002,003,008,012,014,017,022,058 | `src/lib/sqlite.ts`, `migrations/` | ✅ schema/migration/RI pass done (C2,C12–C15; F16/F17/ADR-022 verified). Remaining: column-level ADR-002/017 diff |
| 3 | API surface | 018 | `src/app/api/**` (141 routes) | ✅ done (C16,C17,C18; removal hygiene good) |
| 4 | Etsy integration / OAuth / sync | 007,019,025,057,073,075 | `src/lib/etsy*`, sync | ✅ done (scopes/token/refresh conformant; C10 reinforced) |
| 5 | Shipping / EasyPost | 004,074,080 | `src/lib/*ship*`, easypost | ✅ done (conformant) |
| 6 | UI / nav / SEMS / components | 009,024,028,071,076,079,080 | `src/components/**`, TabBar | ✅ done (nav+SEMS conformant; C19 internal naming) |
| 7 | Reports | 005,006,013,036,038,039,054 | report code, PDF | ✅ done (C20 financial-report ADR gap; C21 ADR-006 residual) |
| 8 | Validation / business rules | 021,029,030,031,032,042,046 | `src/lib/*validation*` | ✅ done (publish C3–C7; pagination/concurrent/dialogs conformant) |
| 9 | Feature ADRs (search/bulk/notif/etc.) | 040–067 | various | ✅ done (ALL implemented; no gaps) |
| 10 | Settings | 027,034 | settings page | ✅ done (F51/F57 resolved; C10 reconfirmed) |

---

## Raw findings (code-conformance)

### Cluster 1 — Listing lifecycle / quality / AI

- **C1 — Orphaned/broken unit test (Coach removal incomplete in tests).**
  `tests/unit/listing-coach-normalize.test.mjs` imports `../../src/lib/listing-coach-normalize.mjs`,
  which **does not exist** (removed with WS-L6 / the Listing Coach). Running it fails hard with
  `ERR_MODULE_NOT_FOUND`. Because `npm test` = `node --test tests/**/*.test.mjs`, this makes the
  **whole unit suite exit non-zero** (red CI). The UI/route/lib (`/listing-coach`,
  `ListingAuthoringPanel`, `PublishPreview`, `src/lib/listing-coach.ts`, `improve-listing`) ARE gone
  from `src/` — only this orphaned test (and its production module's absence) remains.
  → Likely fix: delete the orphaned test (the module it covered is intentionally gone). Confirms the
  doc-audit suspicion that WS-L6 left stragglers.

- **C2 — Dead schema column `listing_draft_state` (superseded by `listing_phase`).**
  `src/lib/sqlite.ts:86` and `migrations/001_initial_schema.sql:53` still declare
  `listing_draft_state TEXT`, a vestige of the removed Workshop draft→approve flow. The canonical
  lifecycle column is `listing_phase` (`sqlite.ts:91`, added by `migrations/013_listing_lifecycle.sql`,
  indexed at `sqlite.ts:691`). Doc finding F69 already repointed docs `listing_draft_state` →
  `listing_phase`. So code carries a column with no documented meaning. → Decide: drop via new
  migration, or document as deliberately retained/deprecated (no-ambiguity).

- **C3 — Publish `materials` validation: severity + charset mismatch.** ADR-021 §8 (line 162)
  says materials is "Warning-level — not blocking" and each element "must be a string ≤ 45 chars
  **matching alphanumeric + whitespace only**." Code (`inventory-validation.ts:131-148`) instead:
  (a) pushes every materials problem to `errors` → **blocking**, not warning; (b) enforces only
  `typeof === string` and `length ≤ 45` — there is **no alphanumeric/whitespace charset check**;
  (c) additionally blocks on invalid JSON / non-array (doc doesn't mention). → Reconcile: decide
  blocking-vs-warning, and drop or implement the charset rule.

- **C4 — Publish `item_weight` validation: severity + missing-weight warning not implemented.**
  ADR-021 §8 (line 163) frames weight as "Optional… **Warning if missing for physical items.**"
  Code (`:150-157`): when `item_weight` is present, bad value or missing/invalid unit → `errors`
  (**blocking**); when weight is **absent**, code emits **no warning at all**. So the documented
  "warning if missing for physical items" does not exist, and present-but-invalid is blocking, not
  warning. → Reconcile severity + decide whether the missing-weight warning should be built.

- **C5 — Publish dimensions: "all three required" is documented but not enforced.** ADR-021 §8
  (line 164) and its error message say "All three dimensions and a unit are required when any
  dimension is provided." Code (`:159-172`) only requires the **unit** when any dimension is set,
  and that each *provided* dimension is positive — it does **not** require all three. Also the
  documented single error string doesn't match the code's actual per-field messages
  ("Length must be a positive number.", "Dimensions unit is required when any dimension is set…").
  → Reconcile: enforce all-three or relax the doc; align message text.

- **C6 — Publish error-message wording drift (low severity).** Several ADR-021 §8 error strings
  don't match the code's actual messages: taxonomy ("Etsy category is required…" vs code "Category
  ID (taxonomy) is required…" + an extra positive-int message), return policy ("Settings → Publish
  Defaults" vs code "Settings → Etsy Publish Defaults"), who_made (code appends a settings hint).
  Per "no ambiguity," align the documented strings to code (or vice-versa).

- **C7 — Publish global-default fallbacks are inconsistent between validator and route (functional).**
  ADR-017 §1c / ADR-021 §8 say the Etsy publish fields resolve from **per-item value OR global
  default**. But `validatePublishReadiness` only honors a settings fallback for `return_policy_id`
  and `shipping_profile_id`. Two concrete breaks:
  1. **`who_made` default never reaches the validator.** `publish-to-etsy/route.ts:92-96` builds the
     `publishSettings` object with only `etsy.publish.return_policy_id` and
     `etsy.publish.shipping_profile_id` — it **omits `etsy.publish.default_who_made`**. The validator
     (`inventory-validation.ts:114`) reads exactly that missing key, so an item with no per-item
     `etsy_who_made` is **always rejected** ("Who made it is required…") even when a global default
     is configured. The route's *own* later resolution (`route.ts:160`) would have used the default
     — but the validation gate (`route.ts:98-108`) fires first, so the item never gets there.
  2. **`when_made` / `taxonomy` have no validator fallback at all.** The validator requires
     item-level `etsy_when_made` (`:102`) and `etsy_taxonomy_id` (`:108`) with no settings fallback,
     yet the route resolves both from globals later (`route.ts:161,166-172`,
     defaults `"2010_2019"` / `globalTaxonomyId`). So items relying on a configured global
     when_made/taxonomy default are also blocked at the gate.
  → Net: the documented "per-item OR global default" only truly works for shipping_profile and
  return_policy. Decide the intended semantics and make validator + route agree. (This is the live
  successor to doc-audit F29, whose decision was overtaken by commit `6b3cde1`.)

- **C8 — ADR-075 cites a removed file as a live OpenAI call site.** ADR-075 "Where it's wired"
  (line 152) lists `src/app/api/inventory/[id]/improve-listing/route.ts` as carrying
  `logApiCall('openai', …)`. That route was **removed** with the Listing Coach (WS-L6); the path no
  longer exists. Stale code reference (doc-audit F68 cleaned other ADR-075 Coach refs but missed
  this one). Also line 149 cites `src/lib/listing-generator.ts` — that file exists but the actual
  OpenAI calls now live in `listing-ai.ts`; verify/repoint.

- **C9 — ADR-075 OpenAI call-site count is stale AND two AI features are undocumented.** ADR-075
  (line 69) says "**OpenAI (4 call sites)**." Actual OpenAI call sites in `src/` are **7**:
  `lib/ai-config.ts`, `lib/listing-ai.ts`, `lib/listing-photo-vision.ts`, `lib/shot-list.ts`,
  `lib/dimension-annotation.ts`, **`app/api/expenses/scan/route.ts`**, and
  **`app/api/receipts/ocr/route.ts`**. The last two are **AI-powered features (expense receipt
  scanning + receipt OCR) that no ADR describes as OpenAI call sites** — docs←code gap. Update
  ADR-075's count + table and confirm these features have ADR coverage (ADR-077 expenses / receipts?).

- **C10 — AI API-key setting: name mismatch + plaintext storage contradicts "encrypted" naming
  (security-relevant).** ADR-034 (line 39) lists the key as **`ai.api_key_encrypted`** (a "(password)").
  Code reads/writes **`ai.api_key`** (`ai-config.ts:55,131`) and stores the value **in plaintext**
  via `setSetting` into the `settings` table — there is no encryption at rest anywhere. So (a) the
  key name is wrong in the doc, and (b) the `_encrypted` suffix/"password" framing implies
  protection that does not exist. (Local single-user SQLite app, so the threat model is mild, but
  per "no ambiguity": either implement encryption or rename to `ai.api_key` and drop the
  "encrypted" implication.) Other documented `ai.*` keys (`provider`, `model`, `economy_model`,
  `base_url`, `timeout_ms`, `retry_count`, `token_budget`) all match code.
  **Update (cluster 4):** the app already has TWO secret-encryption mechanisms — Etsy OAuth tokens
  use AES-256-GCM (`auth-session.ts:42-57`, key from `TOKEN_ENCRYPTION_KEY`) and EasyPost secrets use
  `encryptValue/decryptValue` (`src/lib/secret-crypto.ts`, via `easypost.ts:5`). So the plaintext AI
  key is an **inconsistency**, not a missing capability: the obvious fix is to store `ai.api_key`
  via `secret-crypto` and the doc's `_encrypted` expectation becomes correct.

- **C11 — `expenses/scan` & `receipts/ocr` bypass the economy model lane (cost leak).** The
  WS-AICOST design (`ai-config.ts:33,40`) routes high-volume vision tasks (`photo-quality`,
  `shot-list`, `measure`) to the cheaper `ai.economy_model` via `resolveModelForTask()`. But the
  receipt-OCR and expense-scan routes call OpenAI with **`config.model` directly** — the **primary
  model** — and are not registered as economy `AiTask`s (`expenses/scan/route.ts:72`,
  `receipts/ocr/route.ts:71`). These are exactly the high-volume OCR/vision workloads the economy
  lane exists for, so they currently bill at premium-model rates. → Add `receipt-ocr` /
  `expense-scan` to the `AiTask` union + `ECONOMY_TASKS` and route them through
  `resolveModelForTask`. Directly relevant to the owner's cost-control priority (see
  [[aice-ai-provider-direction]]). Also document these two AI features' model use (ties to C9).

### Cluster 2 — Data model / schema / migrations

- **C12 — Three dead tables from the retired ADR-023/Coach flow.** `listing_exports`,
  `listing_imports`, and `listing_publish_previews` are created by the bootstrap (`sqlite.ts`) and
  `migrations/001_initial_schema.sql` but have **zero application reads/writes** (each appears only
  inside `sqlite.ts`; no other src reference). They are vestiges of the retired ADR-023 portable
  export/import and the removed Coach `PublishPreview` (superseded by ADR-085). Same class as C2 —
  the listing-workshop removal left schema behind. → Decide: drop via migration, or document as
  deliberately retained.
- **F16 — VERIFIED CLEAN (no fix needed).** The bootstrap creates every table (`sqlite.ts:184-596`)
  before the index block (`690-712`); inline indexes (`544`, `591-593`) immediately follow their own
  CREATE TABLE. The migration runner (`scripts/migrate.mjs`) splits per-statement and swallows
  `no such table`/`already exists`, so even a mis-ordered index in a migration file cannot break a
  run. No DDL index-ordering bug in code.
- **F17 — CONFIRMED PRESENT.** Both indexes the doc audit added to ADR-017 §8 exist in code:
  `idx_orders_shipper` (`sqlite.ts:708`) and `idx_vendors_is_active` (`sqlite.ts:698`).
- **ADR-058 hardening — present** (spot check): `journal_mode=WAL`, `busy_timeout=5000`,
  `foreign_keys=ON`, `synchronous=NORMAL` (`sqlite.ts:746-749`) + `wal_checkpoint(TRUNCATE)` (`777`).
  Cross-check exact ADR-058 values in a later pass.

- **C13 — `tax_payments` is missing from the runtime bootstrap (latent crash on a real feature).**
  `tax_payments` is an **active** feature: written/read by `src/app/api/tax-payments/**`, queried in
  `src/lib/reporting.ts` (4 tax-report queries) and `src/lib/tax-payments.ts`. It is created **only**
  by `migrations/008_tax_payments.sql` — **not** by `ensureCoreTables` (`sqlite.ts`). But the running
  app initializes the DB via `getDb()` → `ensureInventorySchema` + `ensureCoreTables`
  (`sqlite.ts:764-765`) and **runs no migrations at runtime**. Migrations only run at *install*
  (`scripts/install-esm.mjs` → `db:reset`); `start.sh` runs `npm run dev` with **no migrate step**.
  → On any DB created via the bootstrap path (e.g. delete `data/app.sqlite`, then `start.sh`), the
  `tax_payments` table never exists and every tax-payment write/read + tax report throws
  "no such table: tax_payments." **Fix:** add `tax_payments` to `ensureCoreTables` for parity with
  every other table. (ADR-017 documents `tax_payments`, so docs are correct; the bootstrap is wrong.)

- **C14 — Bootstrap and migrations have diverged; neither is the full schema (contract violated).**
  `scripts/migrate.mjs` asserts the `sqlite.ts` bootstrap "creates it with all current columns on
  first app start." That contract is false **both** ways:
  - Migration-only (no app boot): missing **6** tables that are bootstrap-only and in **no**
    migration — `receipts`, `receipt_items` (core!), `api_call_log`, `connection_sessions`,
    `etsy_taxonomy_nodes`, `etsy_taxonomy_properties`.
  - Bootstrap-only (no migrations, the `start.sh` path): missing `tax_payments` (C13).
  So there are two parallel, partially-overlapping schema sources kept in sync only by accident of
  the install order (migrate → seed → app boot). High maintainability risk and a real
  fresh-environment hazard. → Decide the SSOT: either the bootstrap is the complete current schema
  (add the migration-only tables to it) or migrations are (and the bootstrap only ensures the
  migration runner has run). Reconcile and document (ADR-001/012/017).

- **C15 — Stale app name "Etsy Sales Manager" in startup scripts.** `start.sh:2` ("Start the Etsy
  Sales Manager dev server…") and `scripts/install-esm.mjs` still use the deprecated product name.
  Governing rule 5 = the app is **AiCE**. The doc audit fixed docs; these scripts were missed.
  (src/ is clean of the stale name — only these two scripts.) → Rename to AiCE.

- **ADR-022 referential integrity — CONFORMANT (behavior).** FK clauses match the ADR:
  inventory→`order_items`/`purchases` = `ON DELETE RESTRICT`; `receipts→receipt_items` = CASCADE;
  `receipt_items.inventory_id` = SET NULL; `addresses`/`customer_notes` on customer = CASCADE. The
  one apparent gap — `orders.customer_id ON DELETE SET NULL` vs the ADR's "restrict customer with
  orders" — is correctly enforced at the **app layer**: `DELETE /api/customers/[id]` counts orders
  and returns **409** before deleting (`customers/[id]/route.ts`). The SET NULL FK is a never-reached
  fallback. (Minor: the DELETE route counts *all* orders via inline SQL while GET uses
  `getCustomerActiveOrderCount` — cosmetic, not an ADR issue.)

### Cluster 3 — API surface (ADR-018 vs 141 `route.ts` files)

- **ADR-018 removal hygiene — GOOD (positive).** All removed endpoints (the 6 `/api/listing-coach/*`
  routes, `listing-approve`/`listing-export`/`listing-import`, the ADR-068 `listing-score`, and the
  income-mtd/ytd/postal-by-vendor reports) are correctly **struck-through and annotated REMOVED**
  with supersession pointers (ADR-018 lines 159-161, 254, 735, 849, 1373, 1406-1417). The doc audit
  cleaned ADR-018 well; no stale-endpoint claims. (Initial diff false-positived on this struck-through
  text.)

- **C16 — Two empty/stray API directories left in code (cleanup stragglers).**
  `src/app/api/inventory/[id]/listing-score/` (empty — the directory for the **removed** ADR-068
  score endpoint) and `src/app/api/auth/etsy/restore-session/` (empty) contain **no `route.ts`** and
  no files. The first is a direct vestige of WS-L6/ADR-085 removals (same class as C1/C2/C12). →
  Delete both empty directories. ✅ **DONE 2026-06-23** — both directories removed.

- **C17 — ADR-018 (declared API-surface SSOT) omits ~20 live endpoints (docs←code gap).** These
  exist in code with no ADR-018 entry (spot-checked: 0 matches each). Several likely belong to
  feature ADRs but ADR-018 should enumerate them (or state it is non-exhaustive):
  `/api/addresses`, `/api/auth/etsy/info`, `/api/backup/scheduled`,
  `/api/dashboard/low-quality-inventory`, `/api/expenses/[id]/payments`, `/api/expenses/bills`,
  `/api/expenses/bills/summary`, `/api/inventory/regenerate-thumbnails`, `/api/order-items/[id]`,
  `/api/orders/[id]/items`, `/api/orders/[id]/items/[itemId]`, `/api/orders/discount-reasons`,
  `/api/reports/vendor-profitability`, `/api/settings/integrity-check`, `/api/settings/logo`,
  `/api/settings/report-header`, `/api/shipping/test-connection`, `/api/tutorial/files`,
  `/api/tutorial/files/[id]`, `/api/usage/session`, `/api/vendors/categories`. (`/api/usage` IS
  documented.) → Add to ADR-018 or cross-reference the owning ADR; reconcile per "no ambiguity."

- **C18 (minor) — `/api/jobs/[id]/stream` documented but no streaming in code.** ADR-018 references a
  jobs streaming endpoint; `src/app/api/jobs/[id]/route.ts` has no SSE/ReadableStream/stream subroute.
  ✅ **RESOLVED 2026-06-23** — verified no SSE in code (descoped); marked **NOT IMPLEMENTED** in
  ADR-018 in all 3 places (the §40 endpoint table row + the two prose mentions). Poll
  `GET /api/jobs/[job_id]` instead.

### Cluster 4 — Etsy integration / OAuth / sync

- **OAuth scopes — CONFORMANT (positive).** Code requests `transactions_r`, `shops_r` at connect and
  adds `listings_r`, `listings_w` only on publish (`etsy.ts:115-117`, `auth/etsy/route.ts:17`). This
  matches ADR-073 §3 (line 450, "minimum required") and §2.4's least-privilege principle exactly.
- **Token security / refresh (ADR-025) — CONFORMANT (positive).** Access + refresh tokens stored
  AES-256-GCM encrypted (`auth-session.ts:42-57`); proactive refresh 5 min before expiry
  (`PROACTIVE_REFRESH_WINDOW_MS`). Legacy plaintext keys are read for migration.
- **Scheduled auto-sync (ADR-057) — PRESENT.** `src/lib/auto-sync-interval.ts` +
  `src/lib/backup-schedule.ts` + `/api/backup/scheduled` exist. Conformance detail (interval source,
  client vs server trigger) not yet deep-checked.
- (No new C-findings in cluster 4 beyond the C10 reinforcement above.)

### Cluster 10 — Settings (ADR-034 / ADR-027)

- **F51/F57 — RESOLVED (no gross mismatch).** ADR-034 now claims a "Complete section inventory (20
  sections)" (line 23). The settings page (`src/app/(app)/settings/page.tsx`, 3476 lines) renders 20
  inline `<h4>` section headings (Business profile, Etsy connection, Shipping defaults, Shipping API
  (EasyPost), Tax, Item numbering, Order numbering, Store categories, Etsy categories & attributes,
  Display preferences, AI settings, Publish defaults, Icons and sizing, Content & paths, Email (SMTP),
  Message Templates, Sample Data, API Usage, Backup and restore, Database integrity) **plus** the
  **Accounting** section delegated to `ChartOfAccountsSection.tsx`. So rendered ≈ 20–21 vs documented
  20 — within ±1 (the prior 22/8 contradictions are gone). → Minor: set ADR-034 to the exact rendered
  number (decide whether Accounting and the two Pictures sub-cards "Icons and sizing" / "Content &
  paths" each count as their own section).
- **C10 reconfirmed at source.** ADR-034 line 39 still lists `ai.api_key_encrypted`; code uses
  plaintext `ai.api_key` (see C10). This is the canonical doc location to fix.
- **G4 follow-up — CORRECTED 2026-06-23.** Earlier text here said the Publish-defaults UI saves only
  4 keys; that was an incomplete read. Fact: the section saves all 13 publish keys
  (`page.tsx:1316-1350`) and ADR-034 §14 documents them. No gap — see the corrected G4 entry above.

### Cluster 6 — UI / nav / SEMS

- **Nav taxonomy — CONFORMANT (positive, code is the source).** `src/components/shell/TabBar.tsx`
  defines exactly the 13 canonical tabs (Dashboard, Orders, Shipping, Inventory, Receipts, Customers,
  Communications, Vendors, Expenses, Reports, Outstanding, Tutorial & tips, Settings); the doc audit
  (F49/F61) aligned all ADRs to this. **All 13 routes resolve** to real pages under `src/app/(app)/`.
- **SEMS (ADR-079) — IMPLEMENTED + ADOPTED (positive).** `src/components/sems/` (`SemsScreen.tsx`,
  `SemsEditor.tsx`, `useSemsEditorGuard.ts`) exists and is used by customers, vendors, receipts, and
  expenses pages (ADR-079's pilot → rollout). Inventory/Order detail panels also present.
- **User-facing labels clean (positive).** No deprecated "Sales"/"Config" labels in rendered UI
  (rule 4 satisfied in the UI layer).
- **C19 (low) — Deprecated terms persist as internal code directory names.**
  `src/components/sales/` (`OrderDetailPanel.tsx`, `RateShoppingModal.tsx`) and
  `src/components/config/` (`ChartOfAccountsSection.tsx`, `ShippingInfoSection.tsx`) use the retired
  "Sales"/"Config" terms (governing rule 4: Sales→Orders, Config→Settings). Internal only (not
  user-visible) → rename for consistency when convenient; lower priority than C15.

### Cluster 5 — Shipping / EasyPost (ADR-004/074/080)

- **EasyPost integration — CONFORMANT (positive).** `src/lib/easypost.ts` exposes every ADR-074
  capability: `createShipmentAndGetRates` (rate shop, 4a/4b), `buyLabel` (4c), `refundShipment`
  (refund/void), `validateAddress`, `getTrackingUrl` + tracking-code save (4e), `testConnection`,
  test/production mode. Routes present: `/api/orders/[id]/shipping-{rates,buy,label,refund}`,
  `/api/shipping/{batch-buy,validate-address,test-connection}`. Legacy HTML address-label path
  coexists per ADR-074 §62. Secrets encrypted via `secret-crypto` (see C10). No webhook/live-tracking
  claimed in ADR-074, none expected.
- **ADR-080 (top-level Shipping module) / ADR-004 (shipper field) — CONFORMANT.** `/shipping` tab+page
  exist (cluster 6); `orders.shipper` + `idx_orders_shipper` exist (cluster 2). No new findings.

### Compliance / requirements gap (surfaced in walkthrough Theme E)

- **C22 — No on-time tax-filing FOCUS mechanism (compliance-critical, CT penalties).** Owner
  (2026-06-23): the State of Connecticut must stay in control of the **outstanding sales-tax revenue
  collected**, with penalties for **late filing**; the standing emphasis is making sure filing is
  **completed on time**. Code today only **records** tax payments (`tax_payments`, with
  `period_from`/`period_to`) and **reports** them (sales-tax-summary; "Sales Tax Payable" balance
  line, `reporting.ts:1616`). There is **no** filing due-date tracking, **no** outstanding-tax-owed
  surfaced on the Outstanding tab (ADR-020 = listing/unpaid-order only) or dashboard, and **no**
  filing reminder. → Requirement gap: add an on-time-filing focus (outstanding tax liability + due
  dates + reminder/alert). Document in ADR-039 (tax) / ADR-078 (reminders) and build. **Priority:
  high (financial penalty risk).**

### Cluster 7 — Reports (ADR-006/013/036/038/039/054)

- **Removed reports correctly absent (positive).** Code has no `income-mtd` / `income-ytd` /
  `postal-by-vendor` routes — matches ADR-006's removal note (lines 35-37) and rule 3. Per-order
  document endpoints `/api/reports/invoice/[orderId]` and `/thank-you-note/[orderId]` present per
  ADR-036. Most reports trace to feature ADRs (profit-by-item→038, inventory-aging→054,
  sales-tax-summary→039, accounting-export→056, print-queue→055, outstanding-items→020/036).
- **C20 — Accounting/financial reports lack functional ADR coverage (docs←code gap).** These report
  routes exist in code but have **no scope/functional ADR** (only an ADR-018 API-surface line, or
  scattered mentions in supporting docs like design-decisions-implementation/ui-design):
  `/api/reports/balance-sheet`, `/api/reports/income-statement`, `/api/reports/ar-aging`, and
  **`/api/reports/vendor-profitability`** (in **no** ADR at all, also missing from ADR-018 → see
  C17). They appear to have arrived with the accounting/COA/GL/AP-lite enhancement (migrations 012,
  `chart_of_accounts`, `gl_transaction_rules`) without ADRs. → Write an ADR (or extend ADR-006) for
  the financial-reports suite so the report scope is unambiguous.
- **C21 (minor, doc-side residual of F59) — ADR-006 still describes removed reports as current.**
  The title (line 1), Context (line 13), and Notes (lines 51, 53) still enumerate "income
  month-to-date, year-to-date, postal costs by vendor" / "income MTD/YTD" as supported scope,
  contradicting the removal note at lines 35-37. Tidy for no-ambiguity (this is doc-only cleanup the
  prior audit's F59 left behind).

### Cluster 8 (rest) — CRUD / list validation (ADR-029/030/031/032/046)

- **Pagination envelope — CONFORMANT (positive).** List routes return the canonical nested envelope
  `{ items, pagination: { limit, offset, total, has_more } }` (`inventory/route.ts:29-33`) via shared
  `parsePagination` (`api-utils.ts`), matching ADR-029 line 108 + the F55 reconciliation exactly.
- **Concurrent-edit detection (ADR-046) — PRESENT.** Write routes (`customers/[id]`, `settings/[key]`,
  `addresses/[id]`, …) implement stale-write/concurrent checks.
- **Confirmation dialogs / unsaved guard (ADR-032/042) — PRESENT** (SEMS `useSemsEditorGuard`,
  `UnsavedChangesDialog`, confirm dialogs across pages).
- (Publish validation already covered as C3–C7. Minor doc residual: ADR-029 line 13 still says
  "Sales" page — rule 4 → "Orders"; doc-side cleanup.)

### Cluster 9 — Feature ADRs 040–067

- **ALL FEATURE ADRs IMPLEMENTED (positive — no documented-but-unbuilt features).** Verified code
  for each: 040 batch (`/api/*/batch`), 041 search (`/api/search`), 042 unsaved guard, 043 progress
  (`ProgressModal`), **044 setup wizard (`components/onboarding/SetupWizard.tsx`)**, 045/049
  keyboard/a11y, **046 concurrent-edit checks**, 047 CSV import (`/api/inventory/import`), 048
  duplicate detection (`/api/*/check-duplicate`), **050 offline retry queue
  (`lib/mutation-queue.ts`, `replay-mutation-queue.ts`, `OfflineBanner`)**, **051 notification center
  (`components/shell/NotificationCenter.tsx`, `lib/notifications.ts`)**, 052 purchase timeline, 053
  merge/dedup (`/api/customers/merge`), 054 inventory aging, 055 print queue (`lib/print-queue.ts`),
  056 accounting export, 057 auto-sync (`lib/auto-sync-interval.ts`), 058 sqlite hardening, 059 empty
  states, 060 tooltips, 061 mobile responsive, 062 inline edit, **063 recently viewed
  (`context/RecentlyViewedContext.tsx`)**, 064 inventory-value widget, 065 customer notes, 066 repeat
  badge, **067 undo/redo (`context/UndoRedoContext.tsx`, real undo/redo stacks)**. No gaps found.

<!-- more findings appended as the audit proceeds -->

---

## Docs ← code gaps (undocumented capabilities)

- **G1 — RESOLVED 2026-06-23.** Receipt OCR (`receipts/ocr/route.ts`) is now listed as an OpenAI
  call site in ADR-075 (C9) and routed to the economy model lane (C11/WP1). It is a sub-capability of
  the receipts flow; the AI-call + cost-lane aspects are now documented.
- **G2 — RESOLVED 2026-06-23.** Expense receipt scanning (`expenses/scan/route.ts`) likewise added to
  ADR-075's call sites (C9) and routed to the economy lane (C11/WP1); it is a sub-capability of the
  ADR-077 expenses flow. AI-call + cost-lane aspects documented.
- **G3 — Hardcoded publish defaults not documented.** `publish-to-etsy/route.ts:160-161` falls back
  to `who_made = "someone_else"` and `when_made = "2010_2019"` when no setting/item value exists.
  These literals aren't in any ADR; document or drive from Settings.
- **G4 — WITHDRAWN (was inaccurate; corrected 2026-06-23 with facts).** The claim that the
  `etsy.publish.*` image/transform settings were undocumented/non-editable was based on an incomplete
  read of the Settings page. Facts: ADR-034 §14 (line 40) **documents all of them**, and the Settings
  page **does expose them** (`page.tsx:1316-1350` saves `default_taxonomy_id`, `shipping_profile_id`,
  `return_policy_id`, `readiness_state_id`, `image_ids`, `default_who_made`, `default_when_made`,
  `image_max_dimension`, `image_target_dpi`, `image_jpeg_quality`, `allow_partial_image_upload`,
  `image_upload_attempts`, `etsy.developer_mode`). No gap. (Lesson: the cluster-10 note that "only 4
  keys are saved" read only the first 4 lines of the save handler — corrected.)
  Residual (was G3) — ✅ **MOOT post-C7 (2026-06-23):** the route's last-resort literals
  `who_made="someone_else"` / `when_made="2010_2019"` (`publish-to-etsy/route.ts:160-161`) are now
  **unreachable** — the WP2/C7 validator requires `who_made` and `when_made` (per-item or configured
  default) before the route proceeds, so these fallbacks never fire. Harmless dead fallbacks;
  optional future code cleanup, no doc ambiguity remains. `etsy.active_shop_id` is set from the
  dashboard shop picker (not a Settings field) — documented behavior.

---

## Direction-vs-architecture notes (forward-looking; not docs↔code defects)

- **D1 — Cheapest-model-first / escalate-on-proven-inadequacy is not yet supported by the model
  router.** Owner rule (2026-06-23): every task starts on the least-costly model and escalates only
  when the cheap model is *demonstrated* inadequate (see [[aice-ai-provider-direction]]). Current
  code (`ai-config.ts`): `resolveModelForTask()` makes a **static one-shot** economy-vs-primary
  choice — no try-cheap → measure → escalate loop. Worse, **`generate-listing` is pinned to the
  primary model** (excluded from `ECONOMY_TASKS`), i.e. it assumes premium is required for listings,
  the assumption the rule forbids without evidence. AiCE already has the adequacy yardstick (quality
  score + 85 gate) to drive escalation. Future work: an evaluation/escalation loop + per-task cheap
  defaults; record escalation evidence. Pair with C11 (OCR on premium model).

## Deferred-from-doc-audit verification items

| Item | Source (doc audit) | Status |
| --- | --- | --- |
| WS-L6 Coach/Workshop removed from `src/` | Governing rule 2 / "Verify (code, not docs)" | ✅ verified: UI/route/lib gone; only orphaned test C1 + dead column C2 remain |
| F16 — migration/bootstrap shares/avoids DDL index-ordering bug | F16 | ✅ verified clean (see C12 block) |
| F29 — `who_made` unvalidated → publish could fail at Etsy | F29 | ✅ superseded by commit 6b3cde1; now lives as C7 (validator/route fallback bug) + ADR-086 |
| F51/F57 — actual rendered Settings section count | F51/F57 | ✅ resolved — ADR-034 "20" ≈ rendered (see cluster 10) |
