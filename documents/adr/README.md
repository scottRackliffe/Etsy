# Architecture Decision Records (ADRs)

This folder contains Architecture Decision Records for the Etsy Sales Manager application. Each ADR documents a significant design or scope decision in a consistent format.

**Internal only — not exposed to users.** ADRs are internal design and architecture documents. They must **not** be exposed to end users: no ADR content, links, or references in the application UI, user help, or user-facing documentation. User-facing content and behavior are defined in [tutorial.md](../tutorial.md), [knowledge-base-design.md](../knowledge-base-design.md), [ui-design.md](../ui-design.md), [pictures-and-sales.md](../pictures-and-sales.md), system/tips, and similar documents only. Implementers use ADRs to build the system; users never see them.

## Format

We use a standard format for all ADRs:

- **Title** – Short noun phrase describing the decision.
- **Status** – Accepted | Deprecated | Superseded by [ADR-XXX].
- **Date** – When the decision was made.
- **Context** – What situation or requirement led to this decision; forces and constraints.
- **Decision** – What we decided to do.
- **Consequences** – Positive and negative outcomes of the decision.
- **Notes** – (Optional) References, alternatives, or follow-ups.

**For implementers:** Each ADR is self-contained for its decision. For UI flows, commands, and the exact definition of “outstanding” items, see [documents/ui-design.md](../ui-design.md). For Etsy compliance details, see [documents/etsy-compliance.md](../etsy-compliance.md). For implementation order (phases only), see [documents/implementation-guide.md](../implementation-guide.md). For Etsy listing content requirements, "can't list until complete," and AI inputs (including pictures), see [documents/etsy-listing-template-and-requirements.md](../etsy-listing-template-and-requirements.md).

## Index

| ADR                                                                | Title                                                                                   |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| [ADR-001](0001-database-for-all-application-data.md)               | Use a database for all application data                                                 |
| [ADR-002](0002-inventory-data-model.md)                            | Inventory data model and fields                                                         |
| [ADR-003](0003-customer-and-purchase-data-model.md)                | Customer and customer-purchase data model                                               |
| [ADR-004](0004-shipper-and-shipping-cost-on-purchases.md)          | Shipper field and shipping cost on purchases                                            |
| [ADR-005](0005-postal-costs-by-vendor-report.md)                   | Postal costs by vendor (seller’s spend, DHL included)                                   |
| [ADR-006](0006-reports-scope.md)                                   | Reports: thank you note, invoice, sales, costs, income, postal by vendor                |
| [ADR-007](0007-base-system-etsy-oauth-dashboard-receipts.md)       | Base system — Etsy OAuth, dashboard, and receipts                                       |
| [ADR-008](0008-data-storage-scope-all-app-data-except-reports.md)  | Data storage scope — all app data stored in SQLite                                      |
| [ADR-009](0009-ui-layout-tabs-commands-outstanding-detail-card.md) | UI layout — tabs, commands panel, outstanding panel, context in place, intuitive design |
| [ADR-010](0010-inventory-picture-import-process.md)                | Inventory picture import — upload, import from folder, replace/reorder/remove           |
| [ADR-011](0011-compliance-with-etsy-rules.md)                      | Compliance with Etsy rules (API, seller, listing, vintage, data)                        |
| [ADR-012](0012-database-technology-sqlite.md)                      | Database technology — SQLite                                                            |
| [ADR-013](0013-report-output-pdf.md)                               | Report output format — PDF and CSV                                                      |
| [ADR-014](0014-database-indexes-for-reports-and-queries.md)        | Database indexes for reports and queries                                                |
| [ADR-015](0015-add-sale-to-current-customer-item-pick-list.md)     | Add sale to current customer — item pick list (picture icon + name, scroll or filter)   |
| [ADR-016](0016-dashboard-content-and-behavior.md)                  | Dashboard — content, structure, and behavior                                            |
| [ADR-017](0017-database-schema.md)                                 | Database schema — canonical definition (no ambiguity)                                   |
| [ADR-018](0018-api-surface-endpoints.md)                           | API surface — endpoints and behavior (no ambiguity)                                     |
| [ADR-019](0019-etsy-order-sync-import.md)                          | Etsy order sync / import — when and how Etsy receipts become local data                 |
| [ADR-020](0020-outstanding-list-definitions-and-queries.md)        | Outstanding list — definitions and query rules (no ambiguity)                           |
| [ADR-021](0021-validation-and-business-rules.md)                   | Validation and business rules (no ambiguity)                                            |
| [ADR-022](0022-referential-integrity-and-delete-behavior.md)       | Referential integrity and delete behavior (no ambiguity)                                |
| [ADR-023](0023-listing-content-generation-modes.md)                | Listing content generation modes — manual, integrated AI, and portable AI handoff       |
| [ADR-024](0024-frontend-component-architecture.md)                 | Frontend component architecture — routing, layout, and component structure              |
| [ADR-025](0025-token-refresh-middleware.md)                         | Token refresh middleware — deterministic behavior (no ambiguity)                        |
| [ADR-026](0026-picture-storage-and-thumbnails.md)                   | Picture storage layout and thumbnail specification (no ambiguity)                       |
| [ADR-027](0027-backup-and-restore.md)                               | Backup and restore — automated backups with rolling retention                           |
| [ADR-028](0028-shared-component-adoption.md)                        | Shared component adoption — wire existing UI primitives into all pages                  |
| [ADR-029](0029-search-filter-sort-pagination.md)                    | Search, filter, sort, and pagination across all list views                              |
| [ADR-030](0030-inventory-detail-editing.md)                         | Inventory detail editing — core field management UI                                     |
| [ADR-031](0031-order-detail-view-and-editing.md)                    | Order detail view and editing                                                           |
| [ADR-032](0032-confirmation-dialogs.md)                             | Confirmation dialogs for destructive and irreversible actions                           |
| [ADR-033](0033-image-upload-and-thumbnail-preview.md)               | Image upload UI and thumbnail preview grid                                              |
| [ADR-034](0034-config-completion.md)                                | Config completion — business profile, shipping info, date format, and full settings     |
| [ADR-035](0035-deep-link-navigation.md)                             | Deep-link navigation — Outstanding click-through selects record on target page          |
| [ADR-036](0036-reports-date-picker-and-per-order-documents.md)      | Reports date picker UI and per-order document generation                                |
| [ADR-037](0037-activity-log-and-audit-trail.md)                     | Activity log and audit trail                                                            |
| [ADR-038](0038-per-item-profit-loss-and-margin.md)                  | Per-item profit/loss and margin calculation                                             |
| [ADR-039](0039-tax-tracking-and-report.md)                          | Tax tracking and tax report                                                             |
| [ADR-040](0040-bulk-batch-operations.md)                            | Bulk/batch operations — multi-select and batch actions                                  |
| [ADR-041](0041-global-search.md)                                    | Global search — Cmd/Ctrl+K cross-entity search                                         |
| [ADR-042](0042-unsaved-changes-guard-and-draft-recovery.md)         | Unsaved changes guard and auto-save/draft recovery                                      |
| [ADR-043](0043-progress-indicators-for-long-operations.md)          | Progress indicators for long-running operations                                         |
| [ADR-044](0044-first-run-setup-wizard-and-onboarding.md)            | First-run setup wizard and onboarding                                                   |
| [ADR-045](0045-accessibility-and-keyboard-navigation.md)            | Accessibility and keyboard navigation (WCAG 2.1 AA)                                     |
| [ADR-046](0046-concurrent-edit-detection.md)                        | Concurrent edit detection — optimistic locking via updated_at                           |
| [ADR-047](0047-bulk-csv-import-for-inventory.md)                    | Bulk CSV import for inventory                                                           |
| [ADR-048](0048-duplicate-detection-on-entry.md)                     | Duplicate detection on entry — fuzzy matching and warnings                              |
| [ADR-049](0049-keyboard-shortcuts.md)                               | Keyboard shortcuts — global and page-specific                                           |
| [ADR-050](0050-network-loss-handling-and-retry-queue.md)             | Network loss handling and retry queue                                                   |
| [ADR-051](0051-notification-center.md)                              | Notification center — persistent event log                                              |
| [ADR-052](0052-customer-purchase-history-timeline.md)               | Customer purchase history timeline                                                      |
| [ADR-053](0053-customer-merge-and-dedup.md)                         | Customer merge and deduplication tool                                                   |
| [ADR-054](0054-inventory-aging-and-slow-mover-report.md)            | Inventory aging and slow-mover report                                                   |
| [ADR-055](0055-print-queue-for-batch-printing.md)                   | Print queue for batch printing                                                          |
| [ADR-056](0056-export-to-accounting-format.md)                      | Export to accounting format (CSV)                                                       |
| [ADR-057](0057-scheduled-auto-sync-from-etsy.md)                    | Scheduled auto-sync from Etsy                                                           |
| [ADR-058](0058-sqlite-hardening.md)                                 | SQLite hardening — WAL mode, busy timeout, integrity checks                             |
| [ADR-059](0059-empty-state-calls-to-action.md)                      | Empty-state calls to action                                                             |
| [ADR-060](0060-contextual-help-tooltips.md)                         | Contextual help tooltips                                                                |
| [ADR-061](0061-mobile-responsive-layout.md)                         | Mobile-responsive layout                                                                |
| [ADR-062](0062-inline-editing-on-list-views.md)                     | Inline editing on list views                                                            |
| [ADR-063](0063-recently-viewed-items.md)                            | Recently-viewed items list                                                              |
| [ADR-064](0064-inventory-value-summary-widget.md)                   | Inventory value summary dashboard widget                                                |
| [ADR-065](0065-customer-interaction-notes.md)                       | Customer interaction notes log                                                          |
| [ADR-066](0066-repeat-customer-badge.md)                            | Repeat customer badge and highlight                                                     |
| [ADR-067](0067-undo-redo.md)                                        | Undo/redo for last N operations                                                         |
| [ADR-068](0068-listing-quality-score.md)                            | Listing quality score and SEO hints                                                     |
| [ADR-069](0069-sample-demo-data.md)                                 | Sample/demo data for new users                                                          |
| [ADR-070](0070-product-scope-and-non-goals.md)                      | Product scope matrix — v1 / post-v1 / Etsy-only / never (store owner capabilities)        |
| [ADR-071](0071-visual-design-system-and-ui-consistency.md)          | Visual design system — colors, navigation, badges, transaction-complete feedback        |
