# Ticket WS-C — Communications & Outreach Center (payment reminders + thank-you notes)

| Field | Value |
|-------|-------|
| Workstream | **C** — Communications/Outreach (LOCKED in `archive/audits/PROGRAM_2026-06-21_major-enhancements.md`) |
| Source ADR | **ADR-078** (authoritative; read in full first). Cross-refs: ADR-017, 018 §38, 034, 013/036, 037, 011 + etsy-compliance.md, 031, 055, 025. |
| Recommended model | **T2 — Sonnet** (`claude-4.6-sonnet-medium-thinking`) for the build. ADR-078 is fully spec'd; this is wiring well-trodden patterns. Escalate to a stronger model only if an escalation trigger fires. |
| Complexity | Medium (one new table, ~7 endpoints, one new lib, SMTP via nodemailer, one new screen, Config section, order-detail buttons, activity wiring). |
| Risk | Medium — introduces SMTP (a new failure surface + new secret). Compliance gate (manual-only payment reminders) must be enforced **server-side**. |
| Sequencing | Independent of other open workstreams. Build on the current branch after the WS-A–H merge (already merged). |

---

## Goal

Build an in-app **Communications / Outreach Center** that (1) lists who needs a given message,
(2) merges order/customer data into editable templates, (3) sends in batch via **email** (new SMTP)
and/or **printable PDF letter** (reuse the existing letter engine + print queue), and (4) records
every send in a new `communication_log` table so nothing is sent twice and all sends appear in the
activity feed. Two message types ship in v1: `payment_reminder` and `thank_you`.

**Read ADR-078 end to end before coding. It contains the exact queries, tokens, DDL, endpoint table,
and compliance rules. This ticket is the build plan + the reuse map; the ADR is the spec.**

---

## Locked decisions (from ADR-078 — do not deviate)

- **Compliance (enforced server-side):** `payment_reminder` is allowed **only** for
  `orders.source_channel = 'manual'`. `/api/communications/send` must reject any other channel for
  that type with `400` + user_message "Payment reminders are only available for manually-entered
  orders." `thank_you` allowed for both channels. **No marketing/bulk promo of any kind.**
- **Message types** are a closed, code-defined catalog (ADR-078 §2). Adding more later must need **no
  schema change**.
- **Candidate queries** are exactly as written in ADR-078 §3 (active-only; manual+unpaid for reminders;
  shipped + not-yet-successfully-thanked for thank-you). "Not yet thanked" = no `communication_log`
  row for the order with `message_type='thank_you'` and `status IN ('sent','printed')`.
- **Merge tokens** are the exact closed set in ADR-078 §4. Unknown tokens are left **verbatim** and
  reported in `unknown_tokens` on preview. Amounts/dates use the app formatters
  (`ui.currency_code`, `ui.date_format`).
- **Templates** live in `settings` (keys in ADR-078 §4); blank → built-in default string. Editable in
  Config.
- **SMTP secret** (`email.smtp_pass_encrypted`) is **encrypted at rest with the existing AES-256-GCM
  helper** — do not roll new crypto.
- **`communication_log` DDL** is exactly ADR-078 §6 (incl. the three indexes). Mirror it in
  `src/lib/sqlite.ts` bootstrap **and** add a numbered migration (see Files).
- Email send failures are **caught and recorded** as `status='failed'` with the error — they never
  throw to the caller.
- **Editable .docx is out of scope** (PDF + email body only).

---

## Reuse map (point the implementer at real code — do NOT reinvent)

| Need | Reuse this |
|------|-----------|
| Encrypt/decrypt the SMTP password (AES-256-GCM) | `src/lib/easypost.ts` — copy the `encryptValue` / `decryptValue` + `getEncryptionKey` pattern (uses `process.env.TOKEN_ENCRYPTION_KEY`). Best to extract these into a shared `src/lib/secret-crypto.ts` and have easypost import it, OR replicate the same approach. Prefer a tiny shared helper to avoid a third copy. |
| Settings get/set | `src/lib/settings-store.ts` → `getSetting` / `setSetting` / `deleteSetting`. |
| Settings route shape (test-connection + masked save) | `src/app/api/settings/ai/route.ts` (GET masked / PUT save) — mirror for `PUT /api/settings/email` and `POST /api/settings/email/test-connection`. Mask the password in any GET. |
| Per-order PDF letter route pattern | `src/app/api/reports/thank-you-note/[orderId]/route.ts` — mirror exactly for the **new** `GET /api/reports/payment-reminder/[orderId]?format=pdf`. |
| PDF letter builder engine | `src/lib/reporting.ts` — `buildSingleOrderThankYou(orderId)` is the template. Add `buildSingleOrderPaymentReminder(orderId)` next to it (same letterhead/logo, body = rendered template). |
| Report HTTP helpers | `src/lib/report-http.ts` → `reportResponse`, `resolveReportFormat`. |
| Candidate data (unpaid/shipped) | `src/lib/outstanding.ts` for query patterns; write the two candidate queries per ADR-078 §3 in the new lib. |
| Activity logging | `src/lib/activity-log.ts` → `logActivity({ action, entityType, entityLabel, detail })`. |
| Activity deep-link + chip | `src/lib/activity-display.ts` (add a `communication` case) and the entity filter chips in `src/components/activity/ActivityLogSection.tsx` (add a "Communications" chip mapping to `entity_type='communication'`). |
| Standard error envelope | `src/lib/api-error.ts` → `ApiRouteError`, `errorResponse`, `fromUnknownError`; `parsePositiveInt` from `api-utils`. |
| Auth guard | `requireEtsyAccessToken(await cookies())` (see ai route). |
| Order detail buttons | `src/components/sales/OrderDetailPanel.tsx` (add "Send payment reminder" [manual+unpaid only] and "Send thank-you"). |
| Nav tab | `src/components/shell/TabBar.tsx` — add a `{ id: "communications", label: "Communications", href: "/communications" }` entry (place after Customers; confirm with ui-design.md). |
| Print channel | existing print queue (ADR-055) for the "print" channel. |
| UI primitives | `DataTable`, `Button`, `ConfirmDialog`, `Toast`, `ProgressModal`, `FormField`, `EmptyState`. |

---

## Files to create

**Lib**
1. `src/lib/communications.ts` — message-type catalog; `getCandidates(type)` (ADR-078 §3 queries);
   `renderTemplate(type, order, customer, business) → { subject, body, unknown_tokens }` (token set
   ADR-078 §4); `getCommunicationLog(filter)`; `recordCommunication(row)`; the send orchestrator
   `sendCommunications({ type, channel, orderIds })` returning per-item `{ order_id, status, error? }`
   and writing `communication_log` + activity. Server-side compliance gate lives here and is also
   re-checked in the route.
2. `src/lib/email.ts` — nodemailer transport built from encrypted SMTP settings;
   `sendEmail({ to, subject, body })`; `testSmtpConnection()`; blocks with clear error if
   `email.enabled !== 'true'` or SMTP unconfigured. Never throws to callers of the send path
   (catch → failed).
3. `src/lib/secret-crypto.ts` *(recommended)* — extract `encryptValue`/`decryptValue`/`getEncryptionKey`
   from `easypost.ts` and re-import there, so email reuses one implementation. (If you prefer not to
   touch easypost, replicate the same approach in `email.ts` — but a shared helper is cleaner.)

**Migration + bootstrap**
4. `migrations/017_communication_log.sql` — the ADR-078 §6 DDL (table + 3 indexes), with the same
   header-comment style as `migrations/015_shot_list.sql` (note it is mirrored in `sqlite.ts`).
5. `src/lib/sqlite.ts` — add the `communication_log` `CREATE TABLE IF NOT EXISTS` + indexes to bootstrap
   (so fresh DBs have it), matching the migration.

**API routes** (standard envelope; lists paginated — ADR-018)
6. `src/app/api/communications/candidates/route.ts` — `GET ?type=` → `{ items, pagination }`.
7. `src/app/api/communications/preview/route.ts` — `POST { type, order_id }` → `{ subject, body, channel_default, unknown_tokens }`. No send.
8. `src/app/api/communications/send/route.ts` — `POST { type, channel, order_ids[] }` → per-item results; writes log + activity; **enforces compliance gate**.
9. `src/app/api/communications/log/route.ts` — `GET ?type=&order_id=` history (paginated).
10. `src/app/api/reports/payment-reminder/[orderId]/route.ts` — per-order reminder letter (mirror thank-you route).
11. `src/app/api/settings/email/route.ts` — `PUT` save SMTP (password encrypted; GET returns masked).
12. `src/app/api/settings/email/test-connection/route.ts` — `POST` verify SMTP login (masked-safe result).

**UI**
13. `src/app/(app)/communications/page.tsx` — Communications Center: message-type selector
    (Payment reminders / Thank-you notes), candidate DataTable (customer, order #, amount,
    paid/shipped status, last-sent), multi-select, **Send** with channel choice (Email / Print) via
    ProgressModal + Toast. Supports deep-link `?type=payment_reminder` (and pre-filter `is_shipped`).
14. `src/components/communications/SendCommunicationModal.tsx` *(or inline)* — preview (calls
    `/preview`) then send (calls `/send`) for per-order entry points.

## Files to edit

- `src/components/shell/TabBar.tsx` — add the Communications tab.
- `src/components/sales/OrderDetailPanel.tsx` — add "Send payment reminder" (manual + unpaid only) and
  "Send thank-you" actions (open preview → send).
- `src/lib/activity-display.ts` — add `communication` entity case (deep-link to `/orders?orderId=` when
  a single order, else no link).
- `src/components/activity/ActivityLogSection.tsx` — add "Communications" entity filter chip
  (`entity_type='communication'`).
- `src/app/(app)/settings/page.tsx` — add the **Email** Config section (SMTP host/port/secure/user/
  password/from-name/from-address/enabled + Test connection button) and **template editors** for the
  four template settings keys.

## Settings keys (ADR-078 §4/§5a — add to `.cursorrules` settings list)

`email.smtp_host`, `email.smtp_port`, `email.smtp_secure`, `email.smtp_user`,
`email.smtp_pass_encrypted`, `email.from_name`, `email.from_address`, `email.enabled`,
`comm.template.payment_reminder.subject`, `comm.template.payment_reminder.body`,
`comm.template.thank_you.subject`, `comm.template.thank_you.body`.
(Most already listed in `.cursorrules`; confirm and keep consistent.)

## Dependency

- Add **`nodemailer`** via the package manager (latest). Add `@types/nodemailer` as a dev dependency.

## Activity logging (ADR-078 §8)

- `communication.sent` (entity_type `communication`, `detail_json { message_type, channel, count, order_ids }`) on a successful batch (one row per batch preferred).
- `communication.failed` (`detail_json { message_type, error }`) on failure.

## Docs to update when done (.cursorrules §1b consistency)

- `documents/adr/0017-database-schema.md` — add `communication_log` DDL + email/template settings keys.
- `documents/adr/0018-api-surface-endpoints.md` — §38 endpoints (the table in ADR-078 §7).
- `documents/adr/0034-config-completion.md` — Email section + template editors.
- `documents/adr/0013-report-output-pdf.md` / `0036-...` — add **Payment Reminder** letter type.
- `documents/adr/0037-activity-log-and-audit-trail.md` — `communication` entity_type + actions + chip.
- `documents/adr/0011-...` + `documents/etsy-compliance.md` — transactional-only outreach rule.
- `documents/adr/0031-...` — order-detail send actions.
- `documents/ui-design.md` / `documents/adr/0024-...` — Communications tab placement.
- `.cursorrules` — settings keys, new table, mark WS-C implemented in "what's built".

## Acceptance criteria

- [ ] `communication_log` exists via both bootstrap (`sqlite.ts`) and `migrations/017_*.sql` (matching DDL + indexes).
- [ ] `GET /api/communications/candidates?type=payment_reminder` returns only **active, manual, unpaid** orders; `type=thank_you` returns **active, shipped, not-yet-successfully-thanked** orders (exact ADR-078 §3 shape incl. `already_reminded_at` / last-sent).
- [ ] `POST /api/communications/preview` renders subject/body with the closed token set; unknown tokens returned in `unknown_tokens` and left verbatim; amounts/dates use app formatters.
- [ ] `POST /api/communications/send`: writes `communication_log` per item, logs `communication.sent`, and **rejects `payment_reminder` for any non-manual order with 400 + the exact user_message**.
- [ ] Email path: SMTP settings saved with **encrypted** password (never returned in plaintext / masked on GET); `test-connection` verifies login; send failures recorded as `status='failed'` (no throw); email blocked with clear guidance when `email.enabled!='true'` or SMTP missing.
- [ ] Print path: `GET /api/reports/payment-reminder/[orderId]?format=pdf` returns a letterhead PDF; thank-you letter still works; "print" channel integrates with the print queue.
- [ ] Idempotency: re-running thank-you candidates excludes orders already successfully thanked.
- [ ] Communications tab renders; candidate list + multi-select + Send (Email/Print) works; deep-link `?type=` selects the type. Order detail shows the two send actions (payment reminder only for manual+unpaid).
- [ ] Activity feed shows `communication.*` rows; "Communications" filter chip works; single-order rows deep-link to `/orders?orderId=`.
- [ ] All listed docs updated; `.cursorrules` reflects new table/keys + WS-C built.
- [ ] `npm run build` passes; no new lint; no hardcoded hex (`var(--ui-*)` only); standard error envelope everywhere; parameterized SQL only; no secrets exposed to client.

## Out of scope

- Newsletter / promotional / bulk-marketing messaging (ADR-070 non-goal).
- `.docx` output.
- New message types beyond `payment_reminder` / `thank_you` (structure must allow future ones with no schema change).
- SEMS (ADR-079) refactor — use current shared components; SEMS adoption is a separate workstream.

## Escalation triggers (STOP and ask)

- `TOKEN_ENCRYPTION_KEY` env var is not set in this environment (encryption helper depends on it) — confirm how secrets are keyed before building the email secret path.
- The `reporting.ts` letter engine cannot be cleanly extended to a payment-reminder letter (e.g., shared layout assumes thank-you-only data) — surface it rather than forking the engine.
- Tab placement / nav for Communications conflicts with ui-design.md locked tab order — confirm placement.
- Any candidate query needs a column that does not exist on `orders`/`customers`.

## Kickoff prompt

> Implement ticket `documents/tickets/WS-C_communications-outreach.md`. Read that ticket AND **ADR-078**
> (`documents/adr/0078-communications-and-customer-outreach.md`) in full first, and follow
> `.cursor/rules/implementer.mdc`. Build the Communications/Outreach Center exactly per ADR-078:
> `communication_log` table (bootstrap + migration 017), the candidate/preview/send/log endpoints,
> the email lib (nodemailer, encrypted SMTP password reusing the AES-256-GCM helper from
> `src/lib/easypost.ts`), the payment-reminder PDF letter (mirror the thank-you route + `reporting.ts`),
> the Communications screen + tab, order-detail send actions, Config Email section + template editors,
> and activity wiring (`communication` entity_type + chip). **Enforce the compliance gate server-side:
> payment reminders only for `source_channel='manual'`.** Use the standard error envelope, parameterized
> SQL, `var(--ui-*)` colors only, and never expose secrets. Update the listed docs, then run
> `npm run build`. Report what you changed and confirm each acceptance-criteria checkbox. STOP and ask
> if any escalation trigger fires.
