# Architecture Decision Records (ADRs)

This folder contains Architecture Decision Records for the Etsy Sales Manager application. Each ADR documents a significant design or scope decision in a consistent format.

## Format

We use a standard format for all ADRs:

- **Title** – Short noun phrase describing the decision.
- **Status** – Accepted | Deprecated | Superseded by [ADR-XXX].
- **Date** – When the decision was made.
- **Context** – What situation or requirement led to this decision; forces and constraints.
- **Decision** – What we decided to do.
- **Consequences** – Positive and negative outcomes of the decision.
- **Notes** – (Optional) References, alternatives, or follow-ups.

## Index

| ADR | Title |
|-----|--------|
| [ADR-001](0001-database-for-all-application-data.md) | Use a database for all application data |
| [ADR-002](0002-inventory-data-model.md) | Inventory data model and fields |
| [ADR-003](0003-customer-and-purchase-data-model.md) | Customer and customer-purchase data model |
| [ADR-004](0004-shipper-and-shipping-cost-on-purchases.md) | Shipper field and shipping cost on purchases |
| [ADR-005](0005-postal-costs-by-vendor-report.md) | Postal costs by vendor (seller’s spend, DHL included) |
| [ADR-006](0006-reports-scope.md) | Reports: thank you note, invoice, sales, costs, income, postal by vendor |
| [ADR-007](0007-base-system-etsy-oauth-dashboard-receipts.md) | Base system — Etsy OAuth, dashboard, and receipts |
| [ADR-008](0008-data-storage-scope-all-app-data-except-reports.md) | Data storage scope — all app data in database, reports not stored |
| [ADR-009](0009-ui-layout-tabs-commands-outstanding-detail-card.md) | UI layout — tabs, commands panel, outstanding panel, context in place, intuitive design |
| [ADR-010](0010-inventory-picture-import-process.md) | Inventory picture import — upload, import from folder, replace/reorder/remove |
| [ADR-011](0011-compliance-with-etsy-rules.md) | Compliance with Etsy rules (API, seller, listing, vintage, data) |
| [ADR-012](0012-database-technology-sqlite.md) | Database technology — SQLite |
| [ADR-013](0013-report-output-pdf.md) | Report output format — PDF |
| [ADR-014](0014-database-indexes-for-reports-and-queries.md) | Database indexes for reports and queries |
| [ADR-015](0015-add-sale-to-current-customer-item-pick-list.md) | Add sale to current customer — item pick list (picture icon + name, scroll or filter) |
