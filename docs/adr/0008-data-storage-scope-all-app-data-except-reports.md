# ADR-008: Data storage scope — all app data in database, reports not stored

## Status

Accepted

## Date

2025-02-15

## Context

We decided to use a database for application data (ADR-001) and defined reports (thank you note, invoice, sales, costs, income MTD/YTD, postal by vendor) in ADR-006. It must be explicit what is stored versus what is generated: operational data should persist; report output should not be stored as its own data.

## Decision

- **Stored in the database (all app data except reports)**  
  Every operational and business data field is persisted in the database:
  - **Inventory:** item number, description, costs, dates, pictures 1–10, status, other costs (in a related table), etc. (ADR-002).  
  - **Customers:** first name, last name, address lines, city, state/province, country, postal code, email, etc. (ADR-003).  
  - **Purchases/shipments:** customer, item purchased, date(s), shipping cost, shipper (USPS, UPS, FedEx, DHL, Other), Etsy receipt ID, notes, etc. (ADR-003, ADR-004).  
  - **Other costs:** amount and description per line, linked to inventory (ADR-002).  
  - Any other app data (e.g. settings, audit timestamps) that the application treats as source of truth.

  This is “all app data” for the purpose of storage decisions.

- **Not stored as data: reports**  
  **Reports** (thank you note, invoice, sales, costs, income month-to-date, income year-to-date, postal costs by vendor) are **not** stored as separate entities in the database. They are **generated on demand** from the stored data above (queries, aggregations, and document generation). No “report result” rows or blobs are persisted; only the underlying inventory, customer, and purchase data is stored.

- **Out of scope for this ADR**  
  - Etsy OAuth tokens (stored in cookies or a separate mechanism; see ADR-007).  
  - Caching of report output for performance (optional later; would be cache, not canonical storage).  
  - Export files (e.g. PDF/CSV) that the user downloads—those are outputs, not stored app data.

## Consequences

- **Positive**
  - Single source of truth: all facts live in the DB; reports are always derived from current data.
  - No risk of stale or duplicated “report data”; changing a sale or cost updates future report runs automatically.
  - Clear boundary for what to back up and migrate: the database only (plus auth/tokens as implemented).
- **Negative**
  - Reports require query/aggregation at request time; for large datasets, performance may require indexing or caching later.

## Notes

- “All app data (except reports)” means: if it’s operational or business data the app owns, it’s in the database; if it’s a report, it’s computed from that data and not stored as report data.
- ADR-001 remains correct; this ADR refines the scope of “all application data” to explicitly exclude report output from storage.
