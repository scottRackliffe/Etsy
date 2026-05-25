# Design decisions — implementation index (SSOT)

This document is the **decision index**. Each section summarizes the decision and points to the **single source of truth (SSOT)** for full wording. Do not duplicate SSOT content here; reference the canonical document.

---

## 1. Print shipping label

**Summary:** No automated connection to any shipping service. App generates and prints the label using order ship-to + stored Shipping Info. If Shipping Info is missing when needed, app tells user and how to navigate to it (Config → Shipping Info). Automated connections to shippers (e.g. carrier APIs) are a future consideration; not in current scope.

**SSOT:** [shipping-label-carrier-templates.md](shipping-label-carrier-templates.md) (no carrier connection; Shipping Info; behavior); [ui-design.md](ui-design.md) (Sales commands, Config); [ADR-018](adr/0018-api-surface-endpoints.md) (Notes). Storage: [ADR-017](adr/0017-database-schema.md).

---

## 2. Customer country and default US; billing address

**Summary:** Customer country = billing address country; no billing → US. Default country for new customer/address = US. In the live schema, the customer's primary address fields are stored directly on the `customers` table (`country` column); separate ship-to addresses are in the `addresses` table.

**SSOT:** Schema: [ADR-017](adr/0017-database-schema.md) (customers table and addresses table). Behavior (default US, when to use): this document only—no duplication elsewhere; implement from this summary and ADR-017.

---

## 3. Multi-currency (currency per customer)

**Summary:** Currency per customer from billing country (mapping); default USD. For v1, all operations use USD only. Multi-currency display on customer records is a future enhancement. Reporting uses the app default currency (`settings.currency_code`).

**SSOT:** Reporting currency: [ADR-006](adr/0006-reports-scope.md) (Notes). App currency setting: [ADR-017](adr/0017-database-schema.md) (settings table, `ui.currency_code` key).

---

## 4. Void / cancel order

**Summary:** Order status active/void/cancelled; status change only (no row delete). Void/cancelled excluded from reports and outstanding list.

**SSOT:** Schema and values: [ADR-017](adr/0017-database-schema.md). Delete/void behavior: [ADR-022](adr/0022-referential-integrity-and-delete-behavior.md). Report filter: [ADR-013](adr/0013-report-output-pdf.md) (global report data filter). Outstanding filter: [ADR-020](adr/0020-outstanding-list-definitions-and-queries.md) (exclude void/cancelled orders).

---

## 5. Customer inactivate / reactivate (maintenance)

**Summary:** Inactivate by years of inactivity (activity = latest of last `orders.order_date` for that customer, or `customers`/`addresses` `updated_at`); reactivate when new customer matches (first_name+last_name+email) or by name in maintenance. Inactive excluded from current reports; date-range reports include all in range. Schema: `customers.is_active`.

**SSOT:** Schema: [ADR-017](adr/0017-database-schema.md) (`customers.is_active`). Full behavior (activity definition, match rule, report rules): this document only—no other canonical source; implement from this summary and ADR-017.

---

## 6. Token refresh

**Summary:** Required for production. Refresh on 401 or proactively (5 min before expiry); single in-flight; retry once after refresh; encrypted at rest (AES-256-GCM); revoked token handling.

**SSOT:** [ADR-025](adr/0025-token-refresh-middleware.md) (comprehensive spec: proactive/reactive refresh, single-in-flight, retry logic, encryption, revoked tokens, structured logging). Background concepts: [ADR-007](adr/0007-base-system-etsy-oauth-dashboard-receipts.md). Implementation: `src/lib/auth-session.ts`.

---

## 7. Automated backup (rolling 25, FIFO)

**Summary:** Automated backup on schedule; backup directory configurable; full DB (optionally pictures); rolling 25 FIFO; v1 may be DB only—document in Config/help. Settings: backup_directory, backup_schedule.

**SSOT:** [ADR-027](adr/0027-backup-and-restore.md) (format, schedule, rolling FIFO retention, API endpoints, restore flow with safety net, error handling, Config UI). Settings keys: [ADR-017](adr/0017-database-schema.md). Frontend UI: ADR-034 (Config page backup/restore section).

---

## 8. Report user choices: Print, Export PDF, Export CSV, Cancel

**Summary:** After report generation, user is offered exactly four actions: Print, Export PDF, Export CSV, Cancel. All reports support both export formats.

**SSOT:** [ADR-013](adr/0013-report-output-pdf.md) (Decision: "User choices after a report is generated").

---

## 9. Etsy listing content (template, AI, save with item, can't list until complete)

**Summary:** Listing template and requirements; AI must receive all item pictures; response structured and saved on item; can't list until complete.

**SSOT:** [etsy-listing-template-and-requirements.md](etsy-listing-template-and-requirements.md) (template, requirements, inputs to AI §3, response shape §4, where used §5). Schema: [ADR-017](adr/0017-database-schema.md) (listing_title, listing_description, listing_tags). Endpoint: [ADR-018](adr/0018-api-surface-endpoints.md) (generate-listing-content). UI: [ui-design.md](ui-design.md) §5.4.

---

## 10. Data checks; context checks; errors in user terms; outstanding list

**Summary:** Every add/change runs validation and context checks; errors in user terms; auto-correct or tell user what to do next; validation failures become outstanding items.

**SSOT:** [ADR-021](adr/0021-validation-and-business-rules.md) (checks, context checks, user terms, auto-correct). Outstanding type "validation/context-check issues": [ADR-020](adr/0020-outstanding-list-definitions-and-queries.md) §7.

---

## 11. No ship until paid or override

**Summary:** Do not allow "Mark as shipped" until order is paid unless user explicitly overrides (e.g. "Ship anyway"); message in user terms. When user overrides, store audit flag on the order row (`orders.shipped_without_paid_override = 1`) per ADR-017.

**SSOT:** [ADR-021](adr/0021-validation-and-business-rules.md) (§5 Purchase/order: "Ship until paid or override").

---

## 12. Etsy sync on startup; last sync date; command to sync

**Summary:** Full sync on startup when authenticated; manual "Sync from Etsy" remains; store and display last_etsy_sync_at.

**SSOT:** [ADR-019](adr/0019-etsy-order-sync-import.md) (Trigger, Last sync date). Settings key: [ADR-017](adr/0017-database-schema.md) (last_etsy_sync_at).

---

## 13. Orders needing action → outstanding list

**Summary:** Any order needing action appears on the outstanding list; single place for "what needs my attention."

**SSOT:** [ADR-020](adr/0020-outstanding-list-definitions-and-queries.md) (outstanding item types and query rules).

---

## 14. Report: Outstanding items (all todos)

**Summary:** Report listing all current outstanding items (same data as panel/tab); PDF; snapshot at run time.

**SSOT:** [ADR-006](adr/0006-reports-scope.md) (report table); [ADR-013](adr/0013-report-output-pdf.md) (report content "Outstanding items").

---

## 15. Report: AR aging (unpaid orders)

**Summary:** Report of unpaid orders by age bucket (0–30, 31–60, 61–90, 90+ days); PDF.

**SSOT:** [ADR-006](adr/0006-reports-scope.md) (report table); [ADR-013](adr/0013-report-output-pdf.md) (report content "AR aging").

---

## 16. Outstanding: orders missing shipping cost — in scope

**Summary:** Orders missing shipping cost is in scope for v1; appears on outstanding list.

**SSOT:** [ADR-020](adr/0020-outstanding-list-definitions-and-queries.md) §6 (Orders missing shipping cost (in scope)).

---

## 17. Bulk picture import (in scope; directory remembered; selection window; item first)

**Summary:** Item first; remembered directory (default_picture_directory); selection window; selected pictures filed with item.

**SSOT:** [ADR-010](adr/0010-inventory-picture-import-process.md) (Bulk picture import flow); [ADR-017](adr/0017-database-schema.md) (default_picture_directory); [ui-design.md](ui-design.md) §5.8.

---

## 18. Config: Why pictures matter / tutorial links

**Summary:** Config exposes optional "Why pictures matter" path/URL (pictures_matter_url) and optional "Tutorial and tips folder" path (tutorial_system_folder_path). If set, the app uses them; if unset, default tutorial content and system/tips/ apply. No future-only scope; in scope per ui-design and knowledge-base-design.

**SSOT:** [ui-design.md](ui-design.md) (Config, §5); [knowledge-base-design.md](knowledge-base-design.md) (§4, §7); [ADR-017](adr/0017-database-schema.md) (settings: pictures_matter_url, tutorial_system_folder_path).

---

## 19. Preferences: date format, first-day-of-week (in scope; Config)

**Summary:** Date format and first-day-of-week in scope; stored in settings; used for display and calendars.

**SSOT:** [ADR-017](adr/0017-database-schema.md) (settings keys date_format, first_day_of_week).

---

## 20. Thumbnail: specify default; user can increase/decrease size for all

**Summary:** Default format/size (e.g. JPEG, 200×200); user setting for size for all items (regenerate or apply to new).

**SSOT:** [ADR-002](adr/0002-inventory-data-model.md) or [ADR-010](adr/0010-inventory-picture-import-process.md) (default spec); [ADR-017](adr/0017-database-schema.md) (thumbnail_size setting).

---

## 21. Report layout (full spec)

**Summary:** 12 pt Courier; title 14/16 pt; page number centered; header/footer every page; 1 in margins; grid; single spacing.

**SSOT:** [ADR-013](adr/0013-report-output-pdf.md) ("Report layout (full spec)").

---

## 22. Outstanding list sort order (date default first; user picks 1st/2nd/3rd and asc/desc)

**Summary:** Three sort levels; date default first; user picks field and asc/desc for each; stored in settings.

**SSOT:** [ADR-020](adr/0020-outstanding-list-definitions-and-queries.md) ("Sort order (user-configurable)"); [ADR-017](adr/0017-database-schema.md) (outstanding*sort*\* settings keys).

---

## 23. Mark as paid

**Summary:** A single action sets `orders.was_paid = 1` (and `payment_status = 'paid'`) on the order header — e.g. `POST /api/orders/[id]/mark-paid` per ADR-018. The client does not update each `order_items` row separately.

**SSOT:** [ADR-018](adr/0018-api-surface-endpoints.md) (API; add mark-paid endpoint if not already listed); [ADR-021](adr/0021-validation-and-business-rules.md) (was_paid validation).

---

## 24. Build priorities 21–52 (feature ADRs — index only)

**Summary:** Post-v1 UX and operations features (profit/margin, tax, bulk ops, search, wizard, a11y, merge, reports, demo data, etc.) are specified in **ADR-038 through ADR-069**. Implementation order: [no-developer-questions-build.md](no-developer-questions-build.md) §5 priorities 21–52 (after §4 documentation gate + §7 compliance audit). API catalog: ADR-018 Extensions §12–§28. Schema: ADR-017 (2026-05-24 reconciliation).

| Priority | ADR | Topic |
|----------|-----|-------|
| 21 | 038 | Per-item profit/loss |
| 22 | 039 | Tax tracking |
| 23 | 040 | Bulk/batch operations |
| 24 | 041 | Global search |
| 25–52 | 042–069 | See build doc §4 |

Do not duplicate feature ADR text here; each ADR is SSOT for its feature.

---

_End of design-decisions-implementation.md. This document is the decision index; see SSOT for each section for full wording._
