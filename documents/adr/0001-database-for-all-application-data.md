# ADR-001: Use a database for all application data

## Status

Accepted

## Date

2025-02-15

## Context

The application must support inventory tracking, customer records, purchase history, costs, and reports. Data needs to persist across sessions, support multiple related entities (items, customers, purchases, costs), and be queryable for reporting (e.g. income month-to-date, postal costs by vendor). Using only in-memory storage or flat files would make this hard to maintain and report on.

## Decision

Use a **database** for all application data. Every field discussed for inventory, customers, purchases, other costs, and shipping will be stored in the database—no critical data will live only in memory or in non-database files.

## Consequences

- **Positive**
  - Persistent, reliable storage for inventory, customers, and purchases.
  - Ability to run queries for reports (sales, costs, income MTD/YTD, postal by vendor).
  - Clear schema and relationships (e.g. purchases link customers to inventory).
  - Easier to add new fields or tables later without changing storage model.
- **Negative**
  - Requires operating a database (technology is SQLite, see ADR-012).
  - Need migrations and schema management as the model evolves.

## Notes

- Database technology is **SQLite** (see [ADR-012](0012-database-technology-sqlite.md)).
- Etsy OAuth tokens may remain in cookies or a separate store; “all application data” here refers to business data (inventory, customers, purchases, costs).
