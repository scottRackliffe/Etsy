# ADR-008: Data storage scope — all app data stored in SQLite

## Status

Accepted

## Date

2025-02-15

## Context

We decided to use a database for application data (ADR-001) and defined reports (thank you note, invoice, sales, costs, income MTD/YTD, postal by vendor) in ADR-006. Storage scope must be explicit: all application-owned data persists in SQLite, including auth/session state and report artifacts/metadata.

## Decision

- **Stored in SQLite (all app data)**  
  Every operational, auth/session, and business data field is persisted in SQLite:
  - **Inventory:** item number, description, costs, dates, pictures 1–10, status, other costs (in a related table), etc. (ADR-002).
  - **Customers:** first name, last name, address lines, city, state/province, country, postal code, email, etc. (ADR-003).
  - **Purchases/shipments:** customer, item purchased, date(s), shipping cost, shipper (USPS, UPS, FedEx, DHL, Other), Etsy receipt ID, notes, etc. (ADR-003, ADR-004).
  - **Other costs:** amount and description per line, linked to inventory (ADR-002).
  - **Auth/session state:** OAuth/session records required to operate securely without storing token payloads in cookies.
  - **Reports:** report-run metadata and generated output artifacts/records for traceability and reproducibility.
  - Any other app data (e.g. **settings** — panel layout, default shipper, business details, optional preferences; audit timestamps) that the application treats as source of truth.

  This is “all app data” for the purpose of storage decisions. **Currency:** Use a single default reporting currency for app-wide aggregates (e.g. `settings.currency_code`). For v1, all operations use USD only; multi-currency per customer is a future enhancement.

- **Out of scope for this ADR**
  - Physical file-system layout for optional exported files when users download copies (SQLite remains the system of record).

## Consequences

- **Positive**
  - Single source of truth: all app facts and artifacts live in SQLite.
  - Backup/migration boundary is straightforward: SQLite database is authoritative.
  - Auth/session behavior is consistent with business-data persistence.
- **Negative**
  - Requires clear retention and cleanup policy for stored report artifacts and auth/session records.

## Notes

- “All app data” means all application-owned data (auth/session, operational, business, and report artifacts/metadata) is persisted in SQLite.
- ADR-001 remains correct; this ADR refines the storage scope to include auth/session and report artifacts as SQLite-backed data.
