# ADR-078: Communications & customer outreach (payment reminders, thank-you notes)

## Status

Accepted

## Date

2026-06-21

## Context

The owner needs to communicate with customers efficiently and in batch — primarily
**payment reminders** (for unpaid orders entered manually) and **thank-you notes** (after
shipping), with room to add more message types later. Today there is no communication tooling
and **no email/sending infrastructure** (dependencies: EasyPost, OpenAI, pdfkit, sharp,
better-sqlite3 — no SMTP layer).

What already exists and must be reused (do not reinvent):

- Per-order **PDF document generation** (Invoice, Thank-You note) via pdfkit (ADR-013, ADR-036).
- **Outstanding** queries that already identify unpaid/unshipped orders (ADR-020).
- **Print queue** for batch printing (ADR-055).
- **Activity log** (ADR-037) and **encrypted-secret** pattern (AES-256-GCM, ADR-025).

Program reference: `archive/audits/PROGRAM_2026-06-21_major-enhancements.md` workstream **C** (LOCKED).

## Decision

Build an in-app **Communications / Outreach Center** that (1) computes **action lists** of who
needs a given message, (2) **merges** order/customer data into reusable **templates**,
(3) **sends in batch** via **email** (new SMTP layer) and/or **printable PDF** (reusing the
letter engine + print queue), and (4) **tracks** every send in a new `communication_log` table
so nothing is sent twice and all sends appear in the activity feed.

---

### 1. "Etsy Safe" compliance rules (authoritative, owner-approved)

All outreach is **transactional / order-tied only — never marketing**. Specifically:

- **Payment reminders** are restricted to **manual-channel orders** (`orders.source_channel =
  'manual'`). Etsy collects payment at checkout, so Etsy-channel orders are effectively always
  paid; reminding an Etsy buyer to pay off-platform is both unnecessary and non-compliant.
- **Thank-you notes** are allowed for **both** channels. For **etsy-channel** orders the default
  channel is a **printed letter** (placed in the package); email is **optional**. For
  **manual-channel** orders, email or letter.
- **No bulk marketing/promotional messaging** of any kind. This ADR does not provide newsletter
  or promotional features (out of scope; see ADR-070 non-goals).
- The Etsy trademark/disclaimer rules (ADR-011, etsy-compliance.md) are unaffected; outreach
  emails must not imply Etsy endorsement.

This compliance section is cross-referenced into **etsy-compliance.md** and **ADR-011**.

---

### 2. Message-type catalog (extensible)

Message types are a closed, code-defined catalog. v1 ships two; the structure supports adding
more without schema change.

| `message_type` | Trigger meaning | Default channel | Allowed channels |
| --- | --- | --- | --- |
| `payment_reminder` | Manual order, active, unpaid | email if customer email present, else print | email, print |
| `thank_you` | Order shipped, not yet thanked | print (etsy) / email (manual) | email, print |

Future candidates (documented, not built): `review_request`, `back_in_touch`, `shipping_update`.
Adding one requires: a catalog entry, a default template, and inclusion in the candidate-query
switch (Section 4) — **no schema change**.

---

### 3. Action-list (candidate) definitions — exact queries

All queries exclude `order_status` of `void`/`cancelled` (only `active`).

**`payment_reminder` candidates:**

```
orders WHERE order_status = 'active'
  AND source_channel = 'manual'
  AND payment_status = 'unpaid'
```

Each candidate row returns: `order_id`, `order_number`, `customer_id`, customer name + email,
`grand_total`, `order_date`, `shipping_date` (nullable), a derived `is_shipped` flag
(`shipping_date IS NOT NULL`), and `already_reminded_at` (most recent `communication_log` row of
this type for the order, or null). The dashboard "shipped but unpaid" quick-link (1.h/1.i,
handled in the dashboard workstream) deep-links here pre-filtered to `is_shipped = true`.

**`thank_you` candidates:**

```
orders o WHERE o.order_status = 'active'
  AND o.shipping_date IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM communication_log c
    WHERE c.order_id = o.id
      AND c.message_type = 'thank_you'
      AND c.status IN ('sent','printed')
  )
```

Returns the same shape as above. "Not yet thanked" = no successful (`sent` or `printed`)
thank-you communication exists for the order.

---

### 4. Templates and merge tokens

- **Storage:** default templates are seeded as rows in `settings` under keys
  `comm.template.payment_reminder.subject`, `comm.template.payment_reminder.body`,
  `comm.template.thank_you.subject`, `comm.template.thank_you.body`. They are **editable in
  Config** (ADR-034 addition). Missing/blank → fall back to the built-in default string.
- **Merge tokens (exact, closed set):** `{{customer_first_name}}`, `{{customer_last_name}}`,
  `{{customer_full_name}}`, `{{order_number}}`, `{{order_date}}`, `{{order_total}}`,
  `{{amount_due}}`, `{{business_name}}`, `{{business_email}}`, `{{tracking_number}}`,
  `{{shipper}}`. Unknown tokens are left **verbatim** and flagged in preview. Amounts/dates use
  the app's currency/date formatters (`ui.currency_code`, `ui.date_format`).
- **Rendering:** a single `renderTemplate(template, order, customer, business)` produces
  `{ subject, body }`. The same rendered text is used for both the email body and the PDF letter
  body, so email and printed letter are consistent.

---

### 5. Channels

**5a. Email (new infrastructure).**

- Add dependency **`nodemailer`**.
- SMTP settings live in `settings` (ADR-034 Config "Email" section), **secrets encrypted at rest
  (AES-256-GCM, ADR-025)**:
  - `email.smtp_host`, `email.smtp_port`, `email.smtp_secure` (`"true"|"false"`),
    `email.smtp_user`, `email.smtp_pass_encrypted`, `email.from_name`, `email.from_address`,
    `email.enabled` (`"true"|"false"`).
- `POST /api/settings/email/test-connection` verifies SMTP login (mirrors the AI
  test-connection pattern) and returns a masked-safe result.
- Send failures are caught and recorded as `communication_log.status = 'failed'` with the error;
  they never throw to the caller (consistent with non-blocking logging).
- If `email.enabled` is false or no SMTP configured, email sends are blocked with a clear
  user_message directing to Settings → Email; print remains available.

**5b. Printable PDF letter (reuse).**

- New per-order document **Payment Reminder** letter, generated by the existing pdfkit engine
  with business letterhead/logo (ADR-013, ADR-036). Thank-You letter already exists.
- Batch print uses the existing **print queue** (ADR-055): "print" channel adds rendered letters
  to the queue / combined PDF.

---

### 6. Database — `communication_log` (new table)

Added to ADR-017 (schema is king). DDL:

```sql
CREATE TABLE IF NOT EXISTS communication_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  message_type  TEXT NOT NULL,                 -- payment_reminder | thank_you | (future)
  channel       TEXT NOT NULL,                 -- email | print
  order_id      INTEGER,                       -- FK orders(id) ON DELETE SET NULL
  customer_id   INTEGER,                       -- FK customers(id) ON DELETE SET NULL
  recipient     TEXT,                          -- email address, or 'print'
  subject       TEXT,
  body_snapshot TEXT,                          -- rendered body at send time (audit)
  status        TEXT NOT NULL DEFAULT 'queued',-- queued | sent | printed | failed
  error         TEXT,
  sent_at       TEXT,                          -- ISO 8601 when sent/printed
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comm_log_order ON communication_log(order_id);
CREATE INDEX IF NOT EXISTS idx_comm_log_type ON communication_log(message_type);
CREATE INDEX IF NOT EXISTS idx_comm_log_created ON communication_log(created_at);
```

`status` values: `queued` (created, not yet sent), `sent` (email accepted by SMTP), `printed`
(added to print queue / PDF generated), `failed` (see `error`).

---

### 7. API endpoints (added to ADR-018 §38)

Standard envelope + list pagination per ADR-018.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/communications/candidates?type=` | List eligible orders for a message type (Section 3). `200: { items, pagination }`. |
| POST | `/api/communications/preview` | Body `{ type, order_id }` → rendered `{ subject, body, channel_default, unknown_tokens: [] }`. No send. |
| POST | `/api/communications/send` | Body `{ type, channel, order_ids: [] }` → per-item result `{ order_id, status, error? }`; writes `communication_log`; logs activity. |
| GET | `/api/communications/log?type=&order_id=` | History (paginated). |
| GET | `/api/reports/payment-reminder/[orderId]?format=pdf` | Per-order payment-reminder letter (ADR-036 pattern). Thank-you letter already exists. |
| PUT | `/api/settings/email` | Save SMTP settings (secrets encrypted). |
| POST | `/api/settings/email/test-connection` | Verify SMTP login. |

Compliance enforcement is **server-side**: `/api/communications/send` rejects
`payment_reminder` for any order whose `source_channel != 'manual'` with a 400 +
`user_message` ("Payment reminders are only available for manually-entered orders.").

---

### 8. Activity logging (ADR-037)

A successful send writes one activity row per batch (or per item — implementer choice, batch
preferred): `communication.sent` with `detail_json: { message_type, channel, count, order_ids }`.
New `entity_type` value `communication` is added to ADR-037 §A1, and a **"Communications"**
filter chip is added to ADR-037 §A4 (maps to `entity_type='communication'`). Deep-link target:
the related order (`/orders?orderId=`) when a single order, else no link.

| Action | entity_type | Logged when |
| --- | --- | --- |
| `communication.sent` | `communication` | Batch/message sent or printed. `detail_json: { message_type, channel, count, order_ids }` |
| `communication.failed` | `communication` | Send failed. `detail_json: { message_type, error }` |

---

### 9. UI

- **Communications Center screen** — a list-first view per the forthcoming form/list standard
  (ADR-079, WS-E): a message-type selector (Payment reminders / Thank-you notes), the candidate
  list (single-spaced, full width, with customer, order, amount, shipped/paid status, last-sent),
  multi-select, and a **Send** action with channel choice (Email / Print). Until ADR-079 lands,
  it uses current shared components (DataTable, Button, ConfirmDialog, Toast, ProgressModal).
- **Placement:** reachable from the dashboard quick-links (the unpaid-orders link from 1.h and
  the thank-you prompt) and from the top navigation. Exact tab placement is reconciled in
  ui-design.md / ADR-024 (added under the existing nav; not a Sales sub-feature).
- **Per-order entry points:** the order detail panel (ADR-031) gains "Send payment reminder"
  (manual + unpaid only) and "Send thank-you" actions that open the preview then send.

---

## Consequences

- **Positive**
  - High-automation outreach with minimal new infrastructure: only SMTP send + `communication_log`
    are new; everything else reuses letters, print queue, outstanding queries, and activity log.
  - Compliance is enforced in code (manual-only payment reminders), so the owner cannot
    accidentally violate Etsy rules.
  - Idempotency: "not yet thanked" logic prevents duplicate thank-yous.
- **Negative**
  - Introduces email/SMTP as a new failure surface and a new secret to manage.
  - One new table and several endpoints.
  - Template editing in Config adds UI surface.

## Notes

- Editable `.docx` output is **out of scope** for v1 (PDF + email body only); revisit only if
  requested.
- **Cross-references to update when WS-C is implemented (.cursorrules §1b):** ADR-017
  (`communication_log` DDL + `settings` email/template keys), ADR-018 (§38 endpoints above),
  ADR-034 (Config: Email section + template editors), ADR-013/036 (Payment Reminder letter type),
  ADR-037 (`communication` entity_type, actions, chip), ADR-011 + etsy-compliance.md (transactional-
  only rule), ADR-031 (order-detail send actions), ADR-055 (print-queue "print" channel),
  ADR-070 (confirm outreach scope/non-goals), `.cursorrules` (settings keys, new table, new ADR).
