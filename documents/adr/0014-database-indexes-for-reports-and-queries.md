# ADR-014: Database indexes for reports and queries

## Status

Accepted

## Date

2025-02-15

## Context

Reports (ADR-006) and everyday queries filter and aggregate by date, customer, shipper, and related keys. Without indexes, the database does full table scans; as data grows, report runs and list views can slow down. We want report and query performance to be acceptable from the start, without a later “we may need indexing” phase.

**Why index?** Indexes let the database find rows quickly by column value (e.g. “all purchases in this date range”, “all purchases for this customer”, “group by shipper”). We define indexes as part of the schema so report and filter queries use them from day one.

## Decision

We **define database indexes as part of the initial schema** (with the first migrations), not as an afterthought. Indexes are created for columns that reports and common queries use:

- **Purchase/sales table:** index on **date of purchase** (for date-range reports, MTD/YTD, sales by period); index on **customer_id** (for “purchases by customer”, thank-you and invoice lookups); index on **shipper** if we filter or group by it (e.g. postal-by-vendor report).
- **Customer table:** index on **customer_id** (primary key) is implicit; any lookup by name or email can get a separate index if we add those searches.
- **Inventory table:** index on **date** fields used in reports (e.g. date of sale); index on **inventory_id** / foreign keys used in joins.

Exact index list and names are defined in [ADR-017](0017-database-schema.md) (schema DDL); This ADR commits to indexes being part of the initial schema, not added later.

## Consequences

- **Positive**
  - Report and list queries stay fast as data grows; no deferred “we may need indexing” work.
  - Single, clear decision: indexes are part of schema design.
- **Negative**
  - Slightly more schema/migration work up front; we must choose the right columns (low cost for SQLite).

## Notes

- ADR-008 (no report output caching) is unchanged; we improve performance with indexing, not by caching report results.
- SQLite supports indexes on one or more columns; we use them for report and filter columns per above.
