# ADR-012: Database technology — SQLite

## Status

Accepted

## Date

2025-02-15

## Context

ADR-001 commits the application to using a database for all application data (inventory, customers, purchases, costs); the technology choice was left open and is decided here. We need a single, file-based database that is easy to set up, requires no separate server, and is sufficient for a single-shop or small multi-shop workload with reporting.

## Decision

Use **SQLite** as the application database.

- One database file (e.g. `data/etsy-sales.db` or similar) under the app; no separate database server to install or run.
- Schema and migrations managed in code (e.g. migration scripts or a lightweight migration runner).
- All application data (per ADR-001 and related ADRs) is stored in this SQLite database.

## Consequences

- **Positive**
  - Zero server setup; works out of the box on macOS and Windows.
  - Single file makes backup and portability straightforward.
  - Adequate for the planned scope (inventory, customers, purchases, reports).
- **Negative**
  - Not ideal for high concurrency or very large datasets; acceptable for Trudy’s Classic Treasures and similar single/small-shop use.
  - File must be writable by the app and backed up by the user or deployment process.

